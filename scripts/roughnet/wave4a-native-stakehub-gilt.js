#!/usr/bin/env node
/**
 * Wave 4 Path A: native StakeHub GILT createValidator -> elect -> delegate.
 * rootAnchoredGiltStakingEnabled must stay OFF (default).
 *
 * Env (all optional):
 *   RPC_URL, STAKE_HUB, GETH_BINARY, BLS_DATADIR, BLS_PASSWORD_FILE,
 *   WALLETS_FILE, PUBLIC_JSON, REPORT_FILE, DELEGATE_AMOUNT_WEI
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const requireFromGenesis = createRequire(
  path.join(ROOT, 'gilt-genesis-contract/package.json'),
);
const { ethers } = requireFromGenesis('ethers');

const STAKE_HUB = process.env.STAKE_HUB || '0x0000000000000000000000000000000000002002';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const GETH_BINARY = process.env.GETH_BINARY || path.join(ROOT, 'gilt-chain/build/bin/geth');
const PUBLIC_JSON =
  process.env.PUBLIC_JSON || path.join(ROOT, '.tmp/roughnet/roughnet-public.json');
const WALLETS_FILE =
  process.env.WALLETS_FILE || path.join(ROOT, '.roughnet-wallets/evm-wallets.json');
const REPORT_FILE = process.env.REPORT_FILE || '/tmp/cursor/roughnet-wave4a-report.txt';
const CHAIN_ID = Number(process.env.CHAIN_ID || '714');
const DELEGATE_AMOUNT = process.env.DELEGATE_AMOUNT_WEI
  ? BigInt(process.env.DELEGATE_AMOUNT_WEI)
  : ethers.parseEther('500');

const publicFacts = JSON.parse(fs.readFileSync(PUBLIC_JSON, 'utf8'));
const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
const blsDatadir = process.env.BLS_DATADIR || publicFacts.geth_datadir;
const blsPassword =
  process.env.BLS_PASSWORD_FILE || path.join(path.dirname(publicFacts.geth_datadir), 'bls-password.txt');
const blsPubkey = publicFacts.bls_pubkey;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const validatorWallet = new ethers.Wallet(wallets[0].private_key, provider);
const delegatorWallet = new ethers.Wallet(wallets[1].private_key, provider);
const operator = validatorWallet.address;
const consensus = operator;

const stakeHubAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'gilt-genesis-contract/abi/stakehub.abi'), 'utf8'),
);
const stakeCreditAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'gilt-genesis-contract/abi/stakecredit.abi'), 'utf8'),
);
const stakeHub = new ethers.Contract(STAKE_HUB, stakeHubAbi, provider);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReceipt(txHash, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for tx ${txHash}`);
}

function generateBlsProof(operatorAddress, voteAddress) {
  const output = execFileSync(
    GETH_BINARY,
    [
      'bls',
      'account',
      'generate-proof',
      '--chain-id',
      String(CHAIN_ID),
      '--blspassword',
      blsPassword,
      '--datadir',
      blsDatadir,
      operatorAddress,
      voteAddress,
    ],
    { encoding: 'utf8' },
  );
  const match = output.match(/Proof:\s*(0x[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error(`BLS proof generation failed: ${output}`);
  }
  return match[1];
}

async function readRootAnchoredEnabled() {
  const slot = await provider.getStorage(STAKE_HUB, 262n);
  return ethers.toBigInt(slot) !== 0n;
}

async function getPooledGilt(credit) {
  const creditContract = new ethers.Contract(credit, stakeCreditAbi, provider);
  try {
    return await creditContract.totalPooledGILT();
  } catch {
    // On roughnet proxy deployments totalPooledGILT() can revert while shares track 1:1 GILT.
    return creditContract.totalSupply();
  }
}

async function sendWithBreatheRetry(sendFn, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tx = await sendFn();
      return await tx.wait();
    } catch (err) {
      const msg = String(err?.shortMessage || err?.message || err);
      if (msg.includes('UpdateTooFrequently')) {
        const breathe = await stakeHub.BREATHE_BLOCK_INTERVAL();
        const waitSec = Number(breathe) + 5;
        console.error(`${label}: UpdateTooFrequently, sleeping ${waitSec}s`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after breathe retries`);
}

async function main() {
  const report = [];
  const writeReport = (status) => {
    report.push(`WAVE4A_STATUS=${status}`);
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${report.join('\n')}\n`);
  };

  try {
    const rootAnchored = await readRootAnchoredEnabled();
    report.push(`rootAnchoredGiltStakingEnabled=${rootAnchored}`);
    if (rootAnchored) {
      throw new Error('rootAnchoredGiltStakingEnabled is ON; Path A requires OFF');
    }

    const lockAmount = await stakeHub.LOCK_AMOUNT();
    const createValue = ethers.parseEther('2000') + lockAmount;
    const validatorProof = generateBlsProof(operator, blsPubkey);
    const commission = { rate: 10, maxRate: 100, maxChangeRate: 5 };
    const description = {
      moniker: 'Rough4A',
      identity: operator,
      website: 'https://roughnet.gold',
      details: 'wave4a native stakehub gilt validator',
    };

    report.push(`operator=${operator}`);
    report.push(`consensus=${consensus}`);
    report.push(`vote_bls_pubkey=${blsPubkey}`);

    const existingCredit = await stakeHub.getValidatorCreditContract(operator);
    let createTxHash = 'skipped';
    let createReceiptStatus = 'skipped';

    if (existingCredit === ethers.ZeroAddress) {
      const createData = stakeHub.interface.encodeFunctionData('createValidator', [
        consensus,
        blsPubkey,
        validatorProof,
        commission,
        description,
      ]);
      const feeData = await provider.getFeeData();
      const createTx = await validatorWallet.sendTransaction({
        to: STAKE_HUB,
        data: createData,
        value: createValue,
        gasLimit: 3_000_000,
        gasPrice: feeData.gasPrice ?? ethers.parseUnits('1', 'gwei'),
      });
      const createReceipt = await waitForReceipt(createTx.hash);
      createTxHash = createTx.hash;
      createReceiptStatus = String(createReceipt.status);
      if (createReceipt.status !== 1 && createReceipt.status !== 1n) {
        throw new Error(`createValidator reverted: ${createTx.hash}`);
      }
    }

    const credit = await stakeHub.getValidatorCreditContract(operator);
    report.push(`credit=${credit}`);
    report.push(`createValidator_tx=${createTxHash}`);
    report.push(`createValidator_receipt_status=${createReceiptStatus}`);

    if (credit === ethers.ZeroAddress) {
      throw new Error('validator credit contract missing after createValidator');
    }

    const election = await stakeHub.getValidatorElectionInfo(0, 1);
    const votingPower = election[1][0];
    report.push(`election_voting_power=${votingPower.toString()}`);
    if (votingPower <= 0n) {
      throw new Error(`validator not elected; voting power=${votingPower}`);
    }

    const pooledBefore = await getPooledGilt(credit);
    report.push(`pooled_gilt_before=${pooledBefore.toString()}`);

    const creditContract = new ethers.Contract(credit, stakeCreditAbi, provider);
    const delegatorStake = await creditContract.balanceOf(delegatorWallet.address);
    let delegateTxHash = 'skipped';
    if (delegatorStake < DELEGATE_AMOUNT) {
      const delegateReceipt = await sendWithBreatheRetry(
        () =>
          stakeHub.connect(delegatorWallet).delegate(operator, false, {
            value: DELEGATE_AMOUNT - delegatorStake,
            gasLimit: 1_500_000,
          }),
        'delegate',
      );
      delegateTxHash = delegateReceipt.hash;
    }
    report.push(`delegate_tx=${delegateTxHash}`);
    report.push(`delegator=${delegatorWallet.address}`);
    report.push(`delegate_amount_wei=${DELEGATE_AMOUNT.toString()}`);

    const finalDelegatorStake = await creditContract.balanceOf(delegatorWallet.address);
    if (finalDelegatorStake < DELEGATE_AMOUNT) {
      throw new Error(
        `delegator stake ${finalDelegatorStake} < required ${DELEGATE_AMOUNT}`,
      );
    }

    const pooledAfter = await getPooledGilt(credit);
    report.push(`pooled_gilt_after=${pooledAfter.toString()}`);
    const delta = pooledAfter - pooledBefore;
    report.push(`pooled_gilt_delta=${delta.toString()}`);

    if (delegateTxHash !== 'skipped' && delta !== DELEGATE_AMOUNT - delegatorStake) {
      throw new Error(`pooled GILT delta ${delta} != delegate amount ${DELEGATE_AMOUNT - delegatorStake}`);
    }

    writeReport('PASS');
    console.log(report.join('\n'));
    process.exit(0);
  } catch (err) {
    report.push(`error=${String(err?.shortMessage || err?.message || err)}`);
    writeReport('FAIL');
    console.error(err);
    console.log(report.join('\n'));
    process.exit(1);
  }
}

main();
