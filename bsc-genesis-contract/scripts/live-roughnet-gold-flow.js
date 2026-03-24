const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ethers } = require('ethers');

const STAKE_HUB = '0x0000000000000000000000000000000000002002';
const GOV_HUB = '0x0000000000000000000000000000000000001007';
const GOVERNOR = '0x0000000000000000000000000000000000002004';
const GOV_TOKEN = '0x0000000000000000000000000000000000002005';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');
const walletFile = process.env.WALLETS_FILE || path.resolve(__dirname, '../../.roughnet-wallets/evm-wallets.json');
const walletsData = JSON.parse(fs.readFileSync(walletFile, 'utf8'));

const blockProducerWallet = new ethers.Wallet(walletsData[0].private_key, provider);
const governanceWallet = new ethers.Wallet(walletsData[1].private_key, provider);
const tokenOwnerWallet = new ethers.Wallet(walletsData[2].private_key, provider);
const delegatorWallet = new ethers.Wallet(walletsData[3].private_key, provider);
const legacyUnbondWallet = new ethers.Wallet(walletsData[4].private_key, provider);
const validatorWallet = blockProducerWallet;

const validatorAddress = validatorWallet.address;
const blsPubkey = process.env.BLS_PUBKEY || '0x82106fca090df4d75d8a0e40e71fe47619ce9a9d5425063e734e40dca8a1f536443ea556a68e715496c8753c1be83f02';
const blsDatadir = process.env.BLS_DATADIR || path.resolve(__dirname, '../../.live-roughnet/validator1/bls');
const blsPassword = process.env.BLS_PASSWORD_FILE || path.resolve(__dirname, '../../.live-roughnet/bls-pass.txt');
const gethBinary = process.env.GETH_BINARY || path.resolve(__dirname, '../../.tmp/geth');

const stakeHubAbi = [
  'function LOCK_AMOUNT() view returns (uint256)',
  'function createValidator(address consensusAddress, bytes voteAddress, bytes blsProof, (uint64 rate, uint64 maxRate, uint64 maxChangeRate) commission, (string moniker, string identity, string website, string details) description) payable',
  'function delegate(address operatorAddress, bool delegateVotePower) payable',
  'function delegateTokenB(address operatorAddress, uint256 tokenBAmount)',
  'function undelegateTokenB(address operatorAddress, uint256 tokenBAmount)',
  'function claimTokenB(address operatorAddress, uint256 requestNumber)',
  'function depositTokenBMigrationReserve(uint256 amount)',
  'function getValidatorElectionInfo(uint256 offset, uint256 limit) view returns (address[] memory consensusAddresses, uint256[] memory votingPowers, bytes[] memory voteAddresses, uint256 totalLength)',
  'function getDelegatedTokenB(address operatorAddress, address delegator) view returns (uint256)',
  'function getLegacyDelegatedTokenB(address operatorAddress, address delegator) view returns (uint256)',
  'function legacyStakeTokenB() view returns (address)',
  'function ratioEnabled() view returns (bool)',
  'function stakeTokenB() view returns (address)',
  'function tokenBMigrationReserve() view returns (uint256)',
  'function unbondPeriod() view returns (uint256)',
];

const govHubAbi = [
  'function updateParam(string key, bytes value, address target)',
];

const governorAbi = [
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)',
  'function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (uint256)',
  'function proposalDeadline(uint256 proposalId) view returns (uint256)',
  'function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)',
  'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)',
  'function state(uint256 proposalId) view returns (uint8)',
];

const govTokenAbi = [
  'function delegate(address delegatee)',
  'function getVotes(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function mint(address account, uint256 amount)',
];

const physicalGoldArtifact = require('../out/PhysicalGoldToken.sol/PhysicalGoldToken.json');
const reserveVaultArtifact = require('../out/LegacyGoldReserveVault.sol/LegacyGoldReserveVault.json');

const stakeHub = new ethers.Contract(STAKE_HUB, stakeHubAbi, provider);
const govHub = new ethers.Contract(GOV_HUB, govHubAbi, provider);
const governor = new ethers.Contract(GOVERNOR, governorAbi, provider);
const govToken = new ethers.Contract(GOV_TOKEN, govTokenAbi, provider);

function normalizeBytecode(bytecode) {
  return bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTransactionReceipt(txHash, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      return receipt;
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for tx ${txHash}`);
}

async function waitForBlock(targetBlock) {
  while ((await provider.getBlockNumber()) < targetBlock) {
    await sleep(1500);
  }
}

async function waitForSeconds(seconds) {
  await sleep(seconds * 1000);
}

async function governStakeHubUpdate(key, value, description) {
  const targets = [GOV_HUB];
  const values = [0];
  const calldatas = [govHub.interface.encodeFunctionData('updateParam', [key, value, STAKE_HUB])];
  const descriptionHash = ethers.id(description);

  const proposeTx = await governor.connect(governanceWallet).propose(targets, values, calldatas, description);
  await proposeTx.wait();

  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
  const startBlock = await provider.getBlockNumber();
  await waitForBlock(startBlock + 1);

  const voteTx = await governor.connect(governanceWallet).castVote(proposalId, 1);
  await voteTx.wait();

  const deadline = await governor.proposalDeadline(proposalId);
  await waitForBlock(Number(deadline) + 1);

  const queueTx = await governor.connect(governanceWallet).queue(targets, values, calldatas, descriptionHash);
  await queueTx.wait();

  await waitForSeconds(65);

  const executeTx = await governor.connect(governanceWallet).execute(targets, values, calldatas, descriptionHash);
  await executeTx.wait();

  return proposalId;
}

async function main() {
  const goldFactory = new ethers.ContractFactory(
    physicalGoldArtifact.abi,
    normalizeBytecode(physicalGoldArtifact.bytecode.object),
    tokenOwnerWallet,
  );
  const reserveFactory = new ethers.ContractFactory(
    reserveVaultArtifact.abi,
    normalizeBytecode(reserveVaultArtifact.bytecode.object),
    tokenOwnerWallet,
  );

  console.error('deploying gold contracts');
  const oldGold = await goldFactory.deploy('Legacy Gold', 'LGOLD');
  await oldGold.waitForDeployment();
  const newGold = await goldFactory.deploy('Physical Gold', 'PGOLD');
  await newGold.waitForDeployment();
  const reserveVault = await reserveFactory.deploy();
  await reserveVault.waitForDeployment();

  const oldGoldToken = new ethers.Contract(await oldGold.getAddress(), erc20Abi, tokenOwnerWallet);
  const newGoldToken = new ethers.Contract(await newGold.getAddress(), erc20Abi, tokenOwnerWallet);

  console.error('creating live stakehub validator');
  const lockAmount = await stakeHub.LOCK_AMOUNT();
  const validatorProofOutput = execFileSync(
    gethBinary,
    [
      'bls',
      'account',
      'generate-proof',
      '--chain-id',
      '714',
      '--blspassword',
      blsPassword,
      '--datadir',
      blsDatadir,
      validatorAddress,
      blsPubkey,
    ],
    { encoding: 'utf8' },
  );
  const validatorProof = validatorProofOutput.trim().split('Proof: ')[1].trim();
  const commission = { rate: 10, maxRate: 100, maxChangeRate: 5 };
  const description = {
    moniker: 'Rough1',
    identity: validatorAddress,
    website: 'https://roughnet.gold',
    details: 'live roughnet gold validator',
  };

  const createValidatorData = stakeHub.interface.encodeFunctionData('createValidator', [
    validatorAddress,
    blsPubkey,
    validatorProof,
    commission,
    description,
  ]);
  const createValidatorTx = await validatorWallet.sendTransaction({
    to: STAKE_HUB,
    data: createValidatorData,
    value: ethers.parseEther('2000') + lockAmount,
    gasLimit: 3_000_000,
    nonce: await provider.getTransactionCount(validatorAddress, 'pending'),
    gasPrice: await provider.getFeeData().then((f) => f.gasPrice ?? ethers.parseUnits('1', 'gwei')),
  });
  const createValidatorReceipt = await waitForTransactionReceipt(createValidatorTx.hash);
  if (createValidatorReceipt.status !== 1 && createValidatorReceipt.status !== 1n) {
    throw new Error(`createValidator failed: ${createValidatorTx.hash}`);
  }

  console.error('staking gilt for governance');
  const stakeAmount = ethers.parseEther('10000000');
  const nativeStakeTx = await stakeHub.connect(governanceWallet).delegate(validatorAddress, false, {
    value: stakeAmount,
    gasLimit: 1_500_000,
  });
  await nativeStakeTx.wait();

  console.error('self-delegating governance votes');
  const selfDelegateTx = await govToken.connect(governanceWallet).delegate(governanceWallet.address);
  await selfDelegateTx.wait();

  console.error('governance: set stakeTokenB');
  await governStakeHubUpdate(
    'stakeTokenB',
    ethers.getBytes(await oldGold.getAddress()),
    'Set old GOLD as live staking token',
  );

  console.error('minting old and new gold');
  await (await oldGoldToken.mint(delegatorWallet.address, ethers.parseEther('100'))).wait();
  await (await oldGoldToken.mint(legacyUnbondWallet.address, ethers.parseEther('150'))).wait();
  await (await newGoldToken.mint(tokenOwnerWallet.address, ethers.parseEther('500'))).wait();

  const oldGoldAsDelegator = new ethers.Contract(await oldGold.getAddress(), erc20Abi, delegatorWallet);
  const oldGoldAsLegacyUnbond = new ethers.Contract(await oldGold.getAddress(), erc20Abi, legacyUnbondWallet);
  const newGoldAsOwner = new ethers.Contract(await newGold.getAddress(), erc20Abi, tokenOwnerWallet);

  console.error('staking old gold');
  await (await oldGoldAsDelegator.approve(STAKE_HUB, ethers.parseEther('100'))).wait();
  await (await stakeHub.connect(delegatorWallet).delegateTokenB(validatorAddress, ethers.parseEther('100'))).wait();

  console.error('creating legacy unbond position');
  await (await oldGoldAsLegacyUnbond.approve(STAKE_HUB, ethers.parseEther('150'))).wait();
  await (await stakeHub.connect(legacyUnbondWallet).delegateTokenB(validatorAddress, ethers.parseEther('150'))).wait();
  await (await stakeHub.connect(legacyUnbondWallet).undelegateTokenB(validatorAddress, ethers.parseEther('50'))).wait();

  const beforeElection = await stakeHub.getValidatorElectionInfo(0, 0);
  const powerBeforeRatio = beforeElection[1][0];

  console.error('governance: enable ratio');
  await governStakeHubUpdate(
    'ratioEnabled',
    '0x01',
    'Enable live gold ratio enforcement',
  );

  const afterElection = await stakeHub.getValidatorElectionInfo(0, 0);
  const powerAfterRatio = afterElection[1][0];

  console.error('governance: activate migration');
  await governStakeHubUpdate(
    'activateTokenBMigration',
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address'], [await newGold.getAddress(), await reserveVault.getAddress()]),
    'Activate GOLD migration',
  );

  console.error('funding migration reserve');
  await (await newGoldAsOwner.approve(STAKE_HUB, ethers.parseEther('300'))).wait();
  await (await stakeHub.connect(tokenOwnerWallet).depositTokenBMigrationReserve(ethers.parseEther('300'))).wait();

  console.error('post-cutover undelegate and live claims');
  await (await stakeHub.connect(delegatorWallet).undelegateTokenB(validatorAddress, ethers.parseEther('40'))).wait();

  const unbondPeriod = Number(await stakeHub.unbondPeriod());
  await waitForSeconds(unbondPeriod + 5);

  const newGoldAsDelegator = new ethers.Contract(await newGold.getAddress(), erc20Abi, delegatorWallet);
  const oldGoldAsLegacyClaimer = new ethers.Contract(await oldGold.getAddress(), erc20Abi, legacyUnbondWallet);

  const newGoldBeforeClaim = await newGoldAsDelegator.balanceOf(delegatorWallet.address);
  await (await stakeHub.connect(delegatorWallet).claimTokenB(validatorAddress, 0)).wait();
  const newGoldAfterClaim = await newGoldAsDelegator.balanceOf(delegatorWallet.address);

  const oldGoldBeforeClaim = await oldGoldAsLegacyClaimer.balanceOf(legacyUnbondWallet.address);
  await (await stakeHub.connect(legacyUnbondWallet).claimTokenB(validatorAddress, 0)).wait();
  const oldGoldAfterClaim = await oldGoldAsLegacyClaimer.balanceOf(legacyUnbondWallet.address);

  const reserveOldGold = await oldGoldToken.balanceOf(await reserveVault.getAddress());

  console.log(JSON.stringify({
    oldGold: await oldGold.getAddress(),
    newGold: await newGold.getAddress(),
    reserveVault: await reserveVault.getAddress(),
    blockProducer: blockProducerWallet.address,
    validatorOperator: validatorAddress,
    govVotes: (await govToken.getVotes(governanceWallet.address)).toString(),
    govSupply: (await govToken.totalSupply()).toString(),
    stakeTokenB: await stakeHub.stakeTokenB(),
    legacyStakeTokenB: await stakeHub.legacyStakeTokenB(),
    ratioEnabled: await stakeHub.ratioEnabled(),
    powerBeforeRatio: powerBeforeRatio.toString(),
    powerAfterRatio: powerAfterRatio.toString(),
    migrationReserve: (await stakeHub.tokenBMigrationReserve()).toString(),
    delegatorRemainingStake: (await stakeHub.getDelegatedTokenB(validatorAddress, delegatorWallet.address)).toString(),
    delegatorLegacyStake: (await stakeHub.getLegacyDelegatedTokenB(validatorAddress, delegatorWallet.address)).toString(),
    newGoldClaimed: (newGoldAfterClaim - newGoldBeforeClaim).toString(),
    legacyOldGoldClaimed: (oldGoldAfterClaim - oldGoldBeforeClaim).toString(),
    reserveOldGold: reserveOldGold.toString(),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
