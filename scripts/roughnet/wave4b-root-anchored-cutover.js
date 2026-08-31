#!/usr/bin/env node
/**
 * Wave 4 Path B: root-anchored flip via impersonated StateReceiver.
 * No Ethereum L1, no wGILT lock, no StakeManager deploy.
 *
 * Required order (StakeHubGiltCutover.sol / Wave5GiltCutover.t.sol):
 *   1. Enable giltStakeFreezeEnabled (GOV_HUB -> StakeHub.updateParam)
 *   2. takeGiltCutoverSnapshot (GOV_HUB)
 *   3. Enable rootAnchoredGiltStakingEnabled (GOV_HUB -> StakeHub.updateParam)
 *   4. Impersonate STATE_RECEIVER 0x3001 -> StakeHub.onStateReceive
 *   5. cutoverValidatorToRoot(operator)
 *
 * Env (optional): RPC_URL, STAKE_HUB, GOV_HUB, STATE_RECEIVER, OPERATOR,
 *   CONSENSUS_ADDR, ROOT_AMOUNT_WEI, REPORT_FILE
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const requireFromGenesis = createRequire(
  path.join(ROOT, 'gilt-genesis-contract/package.json'),
);
const { ethers } = requireFromGenesis('ethers');

const STAKE_HUB = process.env.STAKE_HUB || '0x0000000000000000000000000000000000002002';
const GOV_HUB = process.env.GOV_HUB || '0x0000000000000000000000000000000000001007';
const STATE_RECEIVER =
  process.env.STATE_RECEIVER || '0x0000000000000000000000000000000000003001';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const REPORT_FILE =
  process.env.REPORT_FILE || '/tmp/cursor/roughnet-wave4b-report.txt';

const PUBLIC_JSON =
  process.env.PUBLIC_JSON || path.join(ROOT, '.tmp/roughnet/roughnet-public.json');
const operator =
  process.env.OPERATOR ||
  (fs.existsSync(PUBLIC_JSON)
    ? JSON.parse(fs.readFileSync(PUBLIC_JSON, 'utf8')).validator_address
    : null);
const consensus = process.env.CONSENSUS_ADDR || operator;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const stakeHubAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'gilt-genesis-contract/abi/stakehub.abi'), 'utf8'),
);
const stakeCreditAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'gilt-genesis-contract/abi/stakecredit.abi'), 'utf8'),
);
const stakeHub = new ethers.Contract(STAKE_HUB, stakeHubAbi, provider);

function castCalldata(signature, ...args) {
  return execFileSync('cast', ['calldata', signature, ...args.map(String)], {
    encoding: 'utf8',
  }).trim();
}

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

async function probeRpcMethods() {
  const methods = [
    'anvil_impersonateAccount',
    'dev_impersonateAccount',
    'debug_setBalance',
    'admin_setBalance',
    'personal_listAccounts',
  ];
  const out = [];
  for (const method of methods) {
    const body = await rpcCall(method, method === 'anvil_impersonateAccount' ? [GOV_HUB] : []);
    out.push(`${method}=${body.error ? body.error.message : 'ok'}`);
  }
  return out;
}

async function ethCallFrom(from, data) {
  try {
    const result = await provider.call({ to: STAKE_HUB, from, data });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err?.shortMessage || err?.message || err) };
  }
}

async function tryUnlockedSend(from, calldata) {
  try {
    const out = execFileSync(
      'cast',
      ['send', STAKE_HUB, calldata, '--from', from, '--unlocked', '--rpc-url', RPC_URL],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    const match = out.match(/transactionHash\s+(0x[a-fA-F0-9]+)/);
    return { ok: true, txHash: match ? match[1] : out.trim() };
  } catch (err) {
    const msg = String(err.stderr || err.stdout || err.message || err);
    return { ok: false, error: msg.split('\n')[0] };
  }
}

async function tryEthSendTransaction(from, calldata) {
  const body = await rpcCall('eth_sendTransaction', [
    { from, to: STAKE_HUB, data: calldata },
  ]);
  if (body.error) {
    return { ok: false, error: body.error.message };
  }
  return { ok: true, txHash: body.result };
}

async function waitForReceipt(txHash, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for tx ${txHash}`);
}

async function sendAndWait(from, calldata, label) {
  const send = await tryEthSendTransaction(from, calldata);
  if (!send.ok) {
    return send;
  }
  const receipt = await waitForReceipt(send.txHash);
  if (receipt.status !== 1 && receipt.status !== 1n) {
    return { ok: false, error: `${label} reverted: ${send.txHash}` };
  }
  return { ok: true, txHash: send.txHash };
}

async function getPooledGilt(credit) {
  const creditContract = new ethers.Contract(credit, stakeCreditAbi, provider);
  try {
    return await creditContract.totalPooledGILT();
  } catch {
    return creditContract.totalSupply();
  }
}

async function readElectionPower() {
  const info = await stakeHub.getValidatorElectionInfo(0, 1);
  return info[1][0];
}

async function main() {
  const report = [];
  const txHashes = {};
  let status = 'FAIL';
  let blocker =
    'unknown; see step errors below';

  try {
    if (!operator) {
      throw new Error('OPERATOR not set and roughnet-public.json missing validator_address');
    }

    const chainId = (await provider.getNetwork()).chainId;
    report.push(`chain_id=${chainId}`);
    report.push(`stake_hub=${STAKE_HUB}`);
    report.push(`gov_hub=${GOV_HUB}`);
    report.push(`state_receiver=${STATE_RECEIVER}`);
    report.push(`operator=${operator}`);
    report.push(`consensus=${consensus}`);

    const credit = await stakeHub.getValidatorCreditContract(operator);
    report.push(`stake_credit=${credit}`);
    const pooledGilt = await getPooledGilt(credit);
    report.push(`native_pooled_gilt=${pooledGilt.toString()}`);

    const electionBefore = await readElectionPower();
    report.push(`election_power_before=${electionBefore.toString()}`);

    const stakeWeightA = await stakeHub.stakeWeightA();
    report.push(`stake_weight_a=${stakeWeightA.toString()}`);

    const rootAmount =
      process.env.ROOT_AMOUNT_WEI != null
        ? BigInt(process.env.ROOT_AMOUNT_WEI)
        : pooledGilt + BigInt(3000) * BigInt(10 ** 18);
    report.push(`root_amount_target=${rootAmount.toString()}`);

    const rootAnchoredSlot = await provider.getStorage(STAKE_HUB, 262n);
    report.push(`rootAnchoredGiltStakingEnabled_slot262=${rootAnchoredSlot}`);

    for (const line of await probeRpcMethods()) {
      report.push(`rpc_probe_${line}`);
    }

    try {
      const liveCode = await provider.getCode(STAKE_HUB);
      const selectors = [
        ['takeGiltCutoverSnapshot()', '43e29f08'],
        ['giltStakeFreezeEnabled()', '099e310e'],
        ['cutoverValidatorToRoot(address)', '84c0b148'],
        ['onStateReceive(uint256,bytes)', '26c53bea'],
      ];
      const missing = selectors.filter(([, sel]) => !liveCode.toLowerCase().includes(sel)).map(([sig]) => sig);
      report.push(`deployed_stakehub_missing_selectors=${missing.join('|') || 'none'}`);
    } catch (err) {
      report.push(`deployed_stakehub_selector_scan=${String(err?.message || err)}`);
    }

    const freezeCalldata = castCalldata('updateParam(string,bytes)', 'giltStakeFreezeEnabled', '0x01');
    const rootAnchoredCalldata = castCalldata(
      'updateParam(string,bytes)',
      'rootAnchoredGiltStakingEnabled',
      '0x01',
    );
    const snapshotCalldata = castCalldata('takeGiltCutoverSnapshot()');
    const payload = execFileSync(
      'cast',
      [
        'abi-encode',
        'x(uint256,address,uint256,uint256,uint8)',
        '1',
        consensus,
        rootAmount.toString(),
        '1',
        '0',
      ],
      { encoding: 'utf8' },
    ).trim();
    const onStateCalldata = castCalldata('onStateReceive(uint256,bytes)', '1', payload);
    const cutoverCalldata = castCalldata('cutoverValidatorToRoot(address)', operator);

    // Step 1: giltStakeFreezeEnabled
    const step1Call = await ethCallFrom(GOV_HUB, freezeCalldata);
    report.push(`step1_eth_call=${step1Call.ok ? 'ok' : step1Call.error}`);
    const step1Send = await sendAndWait(GOV_HUB, freezeCalldata, 'step1');
    report.push(`step1_eth_sendTransaction=${step1Send.ok ? step1Send.txHash : step1Send.error}`);
    if (step1Send.ok) txHashes.step1 = step1Send.txHash;

    // Step 2: takeGiltCutoverSnapshot
    const step2Call = await ethCallFrom(GOV_HUB, snapshotCalldata);
    report.push(`step2_eth_call=${step2Call.ok ? 'ok' : step2Call.error}`);
    if (step2Call.ok) {
      const step2Send = await sendAndWait(GOV_HUB, snapshotCalldata, 'step2');
      report.push(`step2_eth_sendTransaction=${step2Send.ok ? step2Send.txHash : step2Send.error}`);
      if (step2Send.ok) txHashes.step2 = step2Send.txHash;
    }

    // Step 3: rootAnchoredGiltStakingEnabled
    const step3Call = await ethCallFrom(GOV_HUB, rootAnchoredCalldata);
    report.push(`step3_eth_call=${step3Call.ok ? 'ok' : step3Call.error}`);
    if (step3Call.ok) {
      const step3Send = await sendAndWait(GOV_HUB, rootAnchoredCalldata, 'step3');
      report.push(`step3_eth_sendTransaction=${step3Send.ok ? step3Send.txHash : step3Send.error}`);
      if (step3Send.ok) txHashes.step3 = step3Send.txHash;
    }

    // Step 4: onStateReceive from STATE_RECEIVER (user-locked cast pattern)
    const step4Call = await ethCallFrom(STATE_RECEIVER, onStateCalldata);
    report.push(`step4_eth_call=${step4Call.ok ? 'ok' : step4Call.error}`);
    const step4Send = await sendAndWait(STATE_RECEIVER, onStateCalldata, 'step4');
    report.push(`step4_eth_sendTransaction=${step4Send.ok ? step4Send.txHash : step4Send.error}`);
    if (step4Send.ok) txHashes.step4 = step4Send.txHash;

    // Step 5: cutoverValidatorToRoot(operator)
    const step5Call = await ethCallFrom(operator, cutoverCalldata);
    report.push(`step5_eth_call=${step5Call.ok ? 'ok' : step5Call.error}`);
    if (step5Call.ok) {
      const step5Send = await sendAndWait(operator, cutoverCalldata, 'step5');
      report.push(`step5_eth_sendTransaction=${step5Send.ok ? step5Send.txHash : step5Send.error}`);
      if (step5Send.ok) txHashes.step5 = step5Send.txHash;
    }

    // Success checks (only meaningful if cutover bytecode + txs succeeded)
    let flipped = false;
    let rootStake = 0n;
    try {
      const rawFlipped = await provider.call({
        to: STAKE_HUB,
        data: castCalldata('isGiltCutoverFlipped(address)', operator),
      });
      flipped = BigInt(rawFlipped) !== 0n;
      const rawRoot = await provider.call({
        to: STAKE_HUB,
        data: castCalldata('getRootStakeAmountByConsensus(address)', consensus),
      });
      rootStake = BigInt(rawRoot);
    } catch (err) {
      report.push(
        `check_cutover_views=unavailable:${String(err?.shortMessage || err?.message || err)}`,
      );
    }

    const electionAfter = await readElectionPower();
    const pooledAfter = await getPooledGilt(credit);
    report.push(`election_power_after=${electionAfter.toString()}`);
    report.push(`native_pooled_gilt_after=${pooledAfter.toString()}`);
    report.push(`isGiltCutoverFlipped=${flipped}`);
    report.push(`getRootStakeAmountByConsensus=${rootStake.toString()}`);

    const expectedRootPower = (rootStake * stakeWeightA) / 10000n;
    report.push(`expected_root_election_power=${expectedRootPower.toString()}`);

    const allChecks =
      flipped === true &&
      rootStake === rootAmount &&
      electionAfter === expectedRootPower &&
      pooledAfter > 0n &&
      electionAfter !== (pooledAfter * stakeWeightA) / 10000n;

    if (allChecks) {
      status = 'PASS';
      blocker = 'none';
    } else if (blocker === 'unknown; see step errors below') {
      if (!step1Call.ok) {
        blocker = `deployed StakeHub rejects giltStakeFreezeEnabled (${step1Call.error})`;
      } else if (!step4Send.ok) {
        blocker = `STATE_RECEIVER sender unavailable (${step4Send.error})`;
      } else {
        blocker = 'cutover prep txs did not complete; success checks false';
      }
    }
  } catch (err) {
    report.push(`fatal_error=${String(err?.shortMessage || err?.message || err)}`);
    blocker = String(err?.shortMessage || err?.message || err);
  }

  report.push(`snapshot_gilt=${report.find((l) => l.startsWith('native_pooled_gilt='))?.split('=')[1] || 'unknown'}`);
  report.push(`root_amount=${report.find((l) => l.startsWith('root_amount_target='))?.split('=')[1] || 'unknown'}`);
  for (const [step, hash] of Object.entries(txHashes)) {
    report.push(`${step}_tx=${hash}`);
  }
  report.push(`blocker=${blocker}`);
  report.push(`WAVE4B_STATUS=${status}`);

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, `${report.join('\n')}\n`);
  console.log(report.join('\n'));
  process.exit(status === 'PASS' ? 0 : 1);
}

main();
