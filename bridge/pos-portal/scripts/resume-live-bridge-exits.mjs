import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  DEFAULT_SEPOLIA_RPC,
  NATIVE_GILT_BRIDGE_ADDRESS,
  REPO_ROOT,
  createCheckpointBuilder,
  childRpcFor,
  contractAt,
  loadAddressBook,
  rpcProviderFor,
  waitForMined,
  readArtifact,
} from './live-bridge-common.mjs';

function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const liveChainDir = process.env.LIVE_CHAIN_DIR
  ? path.resolve(REPO_ROOT, process.env.LIVE_CHAIN_DIR)
  : firstExistingPath([
      path.join(REPO_ROOT, '.live-chain'),
      path.join(REPO_ROOT, '.live-roughnet'),
    ]) || path.join(REPO_ROOT, '.live-roughnet');

const walletFile = process.env.TESTNET_WALLETS_FILE || firstExistingPath([
  path.join(REPO_ROOT, '.testnet-wallets', 'evm-wallets.json'),
  path.join(REPO_ROOT, '.roughnet-wallets', 'evm-wallets.json'),
]);

if (!walletFile) {
  throw new Error('wallet file not found (.testnet-wallets/evm-wallets.json or .roughnet-wallets/evm-wallets.json)');
}
const stateSenderAbi = ['function counter() view returns (uint256)'];
const ROOT_EXIT_GAS_LIMIT = 4_000_000n;

const portalArtifacts = {
  rootChainManager: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/RootChainManager/RootChainManager.sol/RootChainManager.json',
  ),
  childErc20: readArtifact(
    'bridge/pos-portal/artifacts/contracts/child/ChildToken/ChildERC20.sol/ChildERC20.json',
  ),
  giltWeth: readArtifact(
    'bridge/pos-portal/artifacts/contracts/child/ChildToken/GiltWETH.sol/GiltWETH.json',
  ),
  wrappedGilt: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/RootToken/WrappedGilt.sol/WrappedGilt.json',
  ),
  dummyErc20: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyERC20.sol/DummyERC20.json',
  ),
};

const chainArtifacts = {
  physicalGold1155: readArtifact('gilt-genesis-contract/out/PhysicalGold1155.sol/PhysicalGold1155.json'),
  nativeGiltBridge: readArtifact('gilt-genesis-contract/out/NativeGiltBridge.sol/NativeGiltBridge.json'),
};

function rootArtifacts() {
  return readArtifact('bridge/pos-contracts/artifacts/contracts/root/RootChain.sol/RootChain.json');
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected} got ${actual}`);
  }
}

async function exitOnRoot(rootChainManager, exitData, label) {
  try {
    await rootChainManager.exit.staticCall(exitData, { gasLimit: ROOT_EXIT_GAS_LIMIT });
  } catch (error) {
    const message = error?.shortMessage || error?.message || String(error);
    throw new Error(`${label} static exit failed: ${message}`);
  }
  return waitForMined(await rootChainManager.exit(exitData, { gasLimit: ROOT_EXIT_GAS_LIMIT }));
}

function feePaid(receipt) {
  const gasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n;
  return receipt.gasUsed * gasPrice;
}

function findLogIndex(receipt, emitter, topic0 = null) {
  const emitterLc = emitter.toLowerCase();
  return receipt.logs.findIndex((log) => {
    if (log.address.toLowerCase() !== emitterLc) {
      return false;
    }
    if (!topic0) {
      return true;
    }
    return log.topics[0].toLowerCase() === topic0.toLowerCase();
  });
}

async function main() {
  const sepoliaRpc = process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC;
  const roughnetRpc = process.env.CHILD_RPC_URL || process.env.ROUGHNET_RPC_URL || 'http://127.0.0.1:8545';
  const validatorKeyPath = path.join(liveChainDir, 'validator-ecdsa.key');
  const rawPrivateKey =
    process.env.PRIVATE_KEY || fs.readFileSync(validatorKeyPath, 'utf8').trim();
  const deployerKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;

  const addressBook = loadAddressBook();
  const roughnetWallets = JSON.parse(fs.readFileSync(walletFile, 'utf8'));

  const sepoliaProvider = rpcProviderFor(sepoliaRpc);
  const roughnetProvider = rpcProviderFor(roughnetRpc);
  const deployer = new ethers.Wallet(deployerKey, sepoliaProvider);
  const sepoliaUser = new ethers.Wallet(roughnetWallets[1].private_key, sepoliaProvider);
  const roughnetUser = new ethers.Wallet(roughnetWallets[1].private_key, roughnetProvider);

  const rootChainManager = contractAt(addressBook.root.rootChainManager, portalArtifacts.rootChainManager, sepoliaUser);
  const rootChain = contractAt(addressBook.root.rootChain, rootArtifacts(), deployer);
  const rootPaxg = contractAt(addressBook.root.paxg, portalArtifacts.dummyErc20, sepoliaProvider);
  const rootXaut = contractAt(addressBook.root.xaut, portalArtifacts.dummyErc20, sepoliaProvider);
  const rootUsdc = contractAt(addressBook.root.usdc, portalArtifacts.dummyErc20, sepoliaProvider);
  const rootUsdt = contractAt(addressBook.root.usdt, portalArtifacts.dummyErc20, sepoliaProvider);
  const wrappedGilt = contractAt(addressBook.root.wrappedGilt, portalArtifacts.wrappedGilt, sepoliaProvider);
  const childGold = contractAt(addressBook.child.gold, chainArtifacts.physicalGold1155, roughnetUser);
  const childUsdc = contractAt(addressBook.child.usdc, portalArtifacts.childErc20, roughnetUser);
  const childUsdt = contractAt(addressBook.child.usdt, portalArtifacts.childErc20, roughnetUser);
  const childWeth = contractAt(addressBook.child.weth, portalArtifacts.giltWeth, roughnetUser);
  const nativeGiltBridge = contractAt(NATIVE_GILT_BRIDGE_ADDRESS, chainArtifacts.nativeGiltBridge, roughnetUser);
  const rootStateSender = new ethers.Contract(addressBook.root.stateSender, stateSenderAbi, sepoliaProvider);

  const childWeb3 = childRpcFor(roughnetProvider);
  const checkpointExitData = createCheckpointBuilder({
    rootChain,
    proposerPrivateKey: deployer.privateKey,
    proposerAddress: deployer.address,
    childWeb3,
    roughnetProvider,
    addressBook,
    giltconsensusUrl,
  });

  const results = [];

  // Finish the PAXG-backed GOLD exit whose child-chain GOLD burn was already submitted.
  {
    const rootBefore = await rootPaxg.balanceOf(sepoliaUser.address);
    const paxgWithdrawTxHash = '0x4838bfd3e68c7148474f9bba1af8e41725ead310a4e5340b060037c1e0bdc265';
    const withdrawReceipt = await roughnetProvider.getTransactionReceipt(paxgWithdrawTxHash);
    const logIndex = findLogIndex(withdrawReceipt, await childGold.getAddress());
    const exitData = await checkpointExitData(withdrawReceipt.hash, logIndex);
    await exitOnRoot(rootChainManager, exitData, 'PAXG');
    const rootAfter = await rootPaxg.balanceOf(sepoliaUser.address);
    assertEq(rootAfter.toString(), (rootBefore + 2n).toString(), 'PAXG exit completion');
    results.push({ route: 'PAXG', rootBefore: rootBefore.toString(), rootAfter: rootAfter.toString() });
  }

  // Exit XAUT-backed GOLD.
  {
    const rootBefore = await rootXaut.balanceOf(sepoliaUser.address);
    const withdrawTx = await childGold.withdrawSingle(2n, 2000n);
    const withdrawReceipt = await waitForMined(withdrawTx);
    const logIndex = findLogIndex(withdrawReceipt, await childGold.getAddress());
    const exitData = await checkpointExitData(withdrawReceipt.hash, logIndex);
    await exitOnRoot(rootChainManager, exitData, 'XAUT');
    const rootAfter = await rootXaut.balanceOf(sepoliaUser.address);
    assertEq(rootAfter.toString(), (rootBefore + 2n).toString(), 'XAUT exit');
    results.push({ route: 'XAUT', rootBefore: rootBefore.toString(), rootAfter: rootAfter.toString() });
  }

  // Exit standard ERC20 routes.
  for (const [label, rootToken, childToken, amount] of [
    ['USDC', rootUsdc, childUsdc, ethers.parseEther('5')],
    ['USDT', rootUsdt, childUsdt, ethers.parseEther('5')],
  ]) {
    const rootBefore = await rootToken.balanceOf(sepoliaUser.address);
    const withdrawTx = await childToken.withdraw(amount);
    const withdrawReceipt = await waitForMined(withdrawTx);
    const logIndex = findLogIndex(withdrawReceipt, await childToken.getAddress());
    const exitData = await checkpointExitData(withdrawReceipt.hash, logIndex);
    await exitOnRoot(rootChainManager, exitData, label);
    const rootAfter = await rootToken.balanceOf(sepoliaUser.address);
    assertEq(rootAfter.toString(), (rootBefore + amount).toString(), `${label} exit`);
    results.push({ route: label, rootBefore: rootBefore.toString(), rootAfter: rootAfter.toString() });
  }

  // Exit native GILT back to wrapped GILT.
  {
    const amount = ethers.parseEther('7');
    const childBefore = await roughnetProvider.getBalance(roughnetUser.address);
    const rootBefore = await wrappedGilt.balanceOf(sepoliaUser.address);
    const withdrawTx = await nativeGiltBridge.withdraw(amount, { value: amount });
    const withdrawReceipt = await waitForMined(withdrawTx);
    const childAfter = await roughnetProvider.getBalance(roughnetUser.address);
    const gas = feePaid(withdrawReceipt);
    assertEq((childAfter + gas + amount).toString(), childBefore.toString(), 'native GILT lock');
    const logIndex = findLogIndex(withdrawReceipt, NATIVE_GILT_BRIDGE_ADDRESS);
    const exitData = await checkpointExitData(withdrawReceipt.hash, logIndex);
    await exitOnRoot(rootChainManager, exitData, 'GILT');
    const rootAfter = await wrappedGilt.balanceOf(sepoliaUser.address);
    assertEq(rootAfter.toString(), (rootBefore + amount).toString(), 'wrapped GILT exit');
    results.push({ route: 'GILT', rootBefore: rootBefore.toString(), rootAfter: rootAfter.toString() });
  }

  // Exit child WETH back to raw ETH on Sepolia.
  {
    const amount = ethers.parseEther('0.002');
    const rootBefore = await sepoliaProvider.getBalance(sepoliaUser.address);
    const withdrawTx = await childWeth.withdraw(amount);
    const withdrawReceipt = await waitForMined(withdrawTx);
    const logIndex = findLogIndex(withdrawReceipt, await childWeth.getAddress());
    const exitData = await checkpointExitData(withdrawReceipt.hash, logIndex);
    const exitReceipt = await exitOnRoot(rootChainManager, exitData, 'ETH');
    const exitFee = feePaid(exitReceipt);
    const rootAfter = await sepoliaProvider.getBalance(sepoliaUser.address);
    assertEq((rootAfter + exitFee).toString(), (rootBefore + amount).toString(), 'raw ETH exit');
    results.push({
      route: 'ETH',
      rootBefore: rootBefore.toString(),
      rootAfter: rootAfter.toString(),
      exitFee: exitFee.toString(),
    });
  }

  const finalState = {
    stateCounter: (await rootStateSender.counter()).toString(),
    paxg: (await rootPaxg.balanceOf(sepoliaUser.address)).toString(),
    xaut: (await rootXaut.balanceOf(sepoliaUser.address)).toString(),
    usdc: (await rootUsdc.balanceOf(sepoliaUser.address)).toString(),
    usdt: (await rootUsdt.balanceOf(sepoliaUser.address)).toString(),
    wrappedGilt: (await wrappedGilt.balanceOf(sepoliaUser.address)).toString(),
    sepoliaEth: (await sepoliaProvider.getBalance(sepoliaUser.address)).toString(),
    childGold1: (await childGold.balanceOf(roughnetUser.address, 1n)).toString(),
    childGold2: (await childGold.balanceOf(roughnetUser.address, 2n)).toString(),
    childUsdc: (await childUsdc.balanceOf(roughnetUser.address)).toString(),
    childUsdt: (await childUsdt.balanceOf(roughnetUser.address)).toString(),
    childWeth: (await childWeth.balanceOf(roughnetUser.address)).toString(),
    childGilt: (await roughnetProvider.getBalance(roughnetUser.address)).toString(),
  };

  console.log(JSON.stringify({ results, finalState }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
