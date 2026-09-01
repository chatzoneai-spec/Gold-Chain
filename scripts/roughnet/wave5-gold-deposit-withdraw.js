#!/usr/bin/env node
/**
 * Wave 5: GOLD deposit/withdraw smoke on live gilt-chain (mock bridge, no Ethereum L1).
 * deposit() mints GOLD as if root-side PAXG/XAUT were locked after finality.
 * withdrawSingle() burns GOLD on Gold Chain (GoldRedemptionRequested event only).
 *
 * Env (optional): RPC_URL, GOLD, TIMELOCK, WALLETS_FILE, REPORT_FILE,
 *   PAXG_ROOT_AMOUNT, XAUT_ROOT_AMOUNT, PAXG_WITHDRAW_GOLD, XAUT_WITHDRAW_GOLD, GAS_PRICE_WEI
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

const GOLD = process.env.GOLD || '0x0000000000000000000000000000000000003003';
const TIMELOCK = process.env.TIMELOCK || '0x0000000000000000000000000000000000002006';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const WALLETS_FILE =
  process.env.WALLETS_FILE || path.join(ROOT, '.roughnet-wallets/evm-wallets.json');
const REPORT_FILE =
  process.env.REPORT_FILE || '/tmp/cursor/roughnet-wave5-report.txt';

const PAXG_TOKEN_ID = 1n;
const XAUT_TOKEN_ID = 2n;
const PAXG_ROOT_AMOUNT = process.env.PAXG_ROOT_AMOUNT
  ? BigInt(process.env.PAXG_ROOT_AMOUNT)
  : ethers.parseEther('1');
const XAUT_ROOT_AMOUNT = process.env.XAUT_ROOT_AMOUNT
  ? BigInt(process.env.XAUT_ROOT_AMOUNT)
  : 2_000_000n;
const PAXG_WITHDRAW_GOLD = process.env.PAXG_WITHDRAW_GOLD
  ? BigInt(process.env.PAXG_WITHDRAW_GOLD)
  : ethers.parseEther('0.5');
const XAUT_WITHDRAW_GOLD = process.env.XAUT_WITHDRAW_GOLD
  ? BigInt(process.env.XAUT_WITHDRAW_GOLD)
  : ethers.parseEther('1');
const GAS_PRICE = process.env.GAS_PRICE_WEI
  ? BigInt(process.env.GAS_PRICE_WEI)
  : 1_000_000_000n;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
const funderWallet = new ethers.Wallet(wallets[1].private_key, provider);
const userWallet = new ethers.Wallet(wallets[2].private_key, provider);

const goldAbi = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'gilt-genesis-contract/abi/physicalgold1155.abi'), 'utf8'),
);
const gold = new ethers.Contract(GOLD, goldAbi, provider);
const goldUser = gold.connect(userWallet);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

async function impersonate(address) {
  const body = await rpcCall('eth_impersonateAccount', [address]);
  if (body.error) {
    throw new Error(`eth_impersonateAccount failed: ${body.error.message}`);
  }
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

async function sendImpersonated(from, to, data) {
  const body = await rpcCall('eth_sendTransaction', [
    {
      from,
      to,
      data,
      gasPrice: `0x${GAS_PRICE.toString(16)}`,
    },
  ]);
  if (body.error) {
    return { ok: false, error: body.error.message };
  }
  const receipt = await waitForReceipt(body.result);
  if (receipt.status !== 1 && receipt.status !== 1n) {
    return { ok: false, error: `tx reverted: ${body.result}` };
  }
  return { ok: true, txHash: body.result };
}

function castCalldata(signature, ...args) {
  return execFileSync('cast', ['calldata', signature, ...args.map(String)], {
    encoding: 'utf8',
  }).trim();
}

async function findAdmin() {
  const defaultAdminRole = await gold.DEFAULT_ADMIN_ROLE();
  const candidates = [
    await gold.bridgeDepositor(),
    TIMELOCK,
    wallets[0].address,
    wallets[1].address,
  ];
  for (const addr of candidates) {
    if (await gold.hasRole(defaultAdminRole, addr)) {
      return { admin: addr, defaultAdminRole };
    }
  }
  throw new Error('no DEFAULT_ADMIN_ROLE holder found among known candidates');
}

async function ensureDepositorFunded(depositor) {
  const balance = await provider.getBalance(depositor);
  if (balance >= ethers.parseEther('0.1')) {
    return null;
  }
  const tx = await funderWallet.sendTransaction({
    to: depositor,
    value: ethers.parseEther('1'),
    gasPrice: GAS_PRICE,
    type: 0,
  });
  const receipt = await tx.wait();
  return receipt.hash;
}

async function readBalances(account) {
  const paxg = await gold.balanceOf(account, PAXG_TOKEN_ID);
  const xaut = await gold.balanceOf(account, XAUT_TOKEN_ID);
  return { paxg, xaut };
}

async function main() {
  const report = [];
  const txHashes = {};
  let status = 'FAIL';
  let blocker = 'unknown';

  try {
    const chainId = (await provider.getNetwork()).chainId;
    report.push(`chain_id=${chainId}`);
    report.push(`gold=${GOLD}`);
    report.push(`user=${userWallet.address}`);
    report.push(`funder=${funderWallet.address}`);

    const codesize = execFileSync(
      'cast',
      ['codesize', GOLD, '--rpc-url', RPC_URL],
      { encoding: 'utf8' },
    ).trim();
    report.push(`gold_codesize=${codesize}`);

    let bridgeDepositor = await gold.bridgeDepositor();
    const precisionFinalized = await gold.bridgeRoutePrecisionFinalized();
    report.push(`bridgeDepositor=${bridgeDepositor}`);
    report.push(`bridgeRoutePrecisionFinalized=${precisionFinalized}`);

    const { admin } = await findAdmin();
    report.push(`gold_admin=${admin}`);

    const paxgRoute = await gold.bridgeRoutePrecision(PAXG_TOKEN_ID);
    const xautRoute = await gold.bridgeRoutePrecision(XAUT_TOKEN_ID);
    report.push(
      `paxg_route=enabled:${paxgRoute.enabled},rootDecimals:${paxgRoute.rootDecimals},goldDecimals:${paxgRoute.goldDecimals}`,
    );
    report.push(
      `xaut_route=enabled:${xautRoute.enabled},rootDecimals:${xautRoute.rootDecimals},goldDecimals:${xautRoute.goldDecimals}`,
    );

    if (!precisionFinalized) {
      await impersonate(admin);
      const fundTx = await ensureDepositorFunded(admin);
      if (fundTx) {
        txHashes.admin_fund = fundTx;
        report.push(`admin_fund_tx=${fundTx}`);
      }
      const finalizeData = castCalldata('finalizeBridgeRoutePrecision()');
      const finalizeSend = await sendImpersonated(admin, GOLD, finalizeData);
      report.push(
        `finalizeBridgeRoutePrecision=${finalizeSend.ok ? finalizeSend.txHash : finalizeSend.error}`,
      );
      if (!finalizeSend.ok) {
        throw new Error(`finalizeBridgeRoutePrecision failed: ${finalizeSend.error}`);
      }
      txHashes.finalize_precision = finalizeSend.txHash;
    }

    if (bridgeDepositor === ethers.ZeroAddress) {
      bridgeDepositor = funderWallet.address;
      await impersonate(admin);
      await ensureDepositorFunded(admin);
      const setDepositorData = castCalldata('setBridgeDepositor(address)', bridgeDepositor);
      const setSend = await sendImpersonated(admin, GOLD, setDepositorData);
      report.push(`setBridgeDepositor=${setSend.ok ? setSend.txHash : setSend.error}`);
      if (!setSend.ok) {
        throw new Error(`setBridgeDepositor failed: ${setSend.error}`);
      }
      txHashes.set_bridge_depositor = setSend.txHash;
      bridgeDepositor = await gold.bridgeDepositor();
      report.push(`bridgeDepositor_after_set=${bridgeDepositor}`);
    }

    const before = await readBalances(userWallet.address);
    report.push(`user_paxg_before=${before.paxg.toString()}`);
    report.push(`user_xaut_before=${before.xaut.toString()}`);

    await impersonate(bridgeDepositor);
    const fundDepositorTx = await ensureDepositorFunded(bridgeDepositor);
    if (fundDepositorTx) {
      txHashes.depositor_fund = fundDepositorTx;
      report.push(`depositor_fund_tx=${fundDepositorTx}`);
    }

    const paxgDepositData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [PAXG_TOKEN_ID, PAXG_ROOT_AMOUNT],
    );
    const xautDepositData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [XAUT_TOKEN_ID, XAUT_ROOT_AMOUNT],
    );
    const depositPaxgCalldata = castCalldata(
      'deposit(address,bytes)',
      userWallet.address,
      paxgDepositData,
    );
    const depositXautCalldata = castCalldata(
      'deposit(address,bytes)',
      userWallet.address,
      xautDepositData,
    );

    const depPaxg = await sendImpersonated(bridgeDepositor, GOLD, depositPaxgCalldata);
    report.push(`deposit_paxg=${depPaxg.ok ? depPaxg.txHash : depPaxg.error}`);
    if (!depPaxg.ok) throw new Error(`PAXG deposit failed: ${depPaxg.error}`);
    txHashes.deposit_paxg = depPaxg.txHash;

    const depXaut = await sendImpersonated(bridgeDepositor, GOLD, depositXautCalldata);
    report.push(`deposit_xaut=${depXaut.ok ? depXaut.txHash : depXaut.error}`);
    if (!depXaut.ok) throw new Error(`XAUT deposit failed: ${depXaut.error}`);
    txHashes.deposit_xaut = depXaut.txHash;

    const afterDeposit = await readBalances(userWallet.address);
    report.push(`user_paxg_after_deposit=${afterDeposit.paxg.toString()}`);
    report.push(`user_xaut_after_deposit=${afterDeposit.xaut.toString()}`);

    const paxgMinted = afterDeposit.paxg - before.paxg;
    const xautMinted = afterDeposit.xaut - before.xaut;
    report.push(`paxg_minted=${paxgMinted.toString()}`);
    report.push(`xaut_minted=${xautMinted.toString()}`);

    const withdrawSingle = goldUser.getFunction('withdrawSingle(uint256,uint256)');
    const withdrawPaxgTx = await (
      await withdrawSingle(PAXG_TOKEN_ID, PAXG_WITHDRAW_GOLD, {
        gasPrice: GAS_PRICE,
        type: 0,
      })
    ).wait();
    txHashes.withdraw_paxg = withdrawPaxgTx.hash;
    report.push(`withdraw_paxg=${withdrawPaxgTx.hash}`);

    const withdrawXautTx = await (
      await withdrawSingle(XAUT_TOKEN_ID, XAUT_WITHDRAW_GOLD, {
        gasPrice: GAS_PRICE,
        type: 0,
      })
    ).wait();
    txHashes.withdraw_xaut = withdrawXautTx.hash;
    report.push(`withdraw_xaut=${withdrawXautTx.hash}`);

    const afterWithdraw = await readBalances(userWallet.address);
    report.push(`user_paxg_after_withdraw=${afterWithdraw.paxg.toString()}`);
    report.push(`user_xaut_after_withdraw=${afterWithdraw.xaut.toString()}`);

    const paxgDropped = afterDeposit.paxg - afterWithdraw.paxg;
    const xautDropped = afterDeposit.xaut - afterWithdraw.xaut;
    report.push(`paxg_burned=${paxgDropped.toString()}`);
    report.push(`xaut_burned=${xautDropped.toString()}`);

    let giltconsdHeight = 'unavailable';
    try {
      const res = await fetch('http://127.0.0.1:26657/status');
      const json = await res.json();
      giltconsdHeight = json?.result?.sync_info?.latest_block_height ?? 'unknown';
    } catch {
      giltconsdHeight = 'unreachable';
    }
    report.push(`giltconsd_height=${giltconsdHeight}`);

    const checks =
      paxgMinted > 0n &&
      xautMinted > 0n &&
      paxgDropped === PAXG_WITHDRAW_GOLD &&
      xautDropped === XAUT_WITHDRAW_GOLD &&
      afterWithdraw.paxg === afterDeposit.paxg - PAXG_WITHDRAW_GOLD &&
      afterWithdraw.xaut === afterDeposit.xaut - XAUT_WITHDRAW_GOLD;

    if (checks) {
      status = 'PASS';
      blocker = 'none';
    } else {
      blocker = 'balance checks failed after deposit/withdraw';
    }
  } catch (err) {
    report.push(`fatal_error=${String(err?.shortMessage || err?.message || err)}`);
    blocker = String(err?.shortMessage || err?.message || err);
  }

  for (const [key, hash] of Object.entries(txHashes)) {
    report.push(`${key}_tx=${hash}`);
  }
  report.push(`blocker=${blocker}`);
  report.push(`WAVE5_STATUS=${status}`);

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, `${report.join('\n')}\n`);
  console.log(report.join('\n'));
  process.exit(status === 'PASS' ? 0 : 1);
}

main();
