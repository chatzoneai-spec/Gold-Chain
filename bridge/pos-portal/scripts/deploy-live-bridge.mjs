import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { ethers } from 'ethers';
import {
  ADDRESS_BOOK_PATH,
  CHECKPOINT_ACCOUNT_HASH,
  DEFAULT_SEPOLIA_RPC,
  GOV_HUB_ADDRESS,
  GOVERNOR_ADDRESS,
  GOV_TOKEN_ADDRESS,
  NATIVE_GILT_BRIDGE_ADDRESS,
  REPO_ROOT,
  ROOT_ETHER_ADDRESS,
  STATE_RECEIVER_ADDRESS,
  STAKE_HUB_ADDRESS,
  ZERO_ADDRESS,
  deployContract,
  hexAddressBytes,
  loadAddressBook,
  publicKeyBytes,
  rpcProviderFor,
  readArtifact,
  readJson,
  role,
  saveAddressBook,
  sleep,
  submitGoldMapping,
  submitStandardMapping,
  waitForMined,
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

const giltconsensusGenesisPath = process.env.GILTCONSENSUS_GENESIS_PATH || firstExistingPath([
  path.join(REPO_ROOT, '.giltconsensus-testnet', 'node0', 'giltconsensusd', 'config', 'genesis.json'),
  path.join(REPO_ROOT, '.giltconsensus-localnet', 'node0', 'giltconsensusd', 'config', 'genesis.json'),
]);

const blsDatadir = process.env.BLS_DATADIR || path.join(liveChainDir, 'validator1', 'bls');
const blsPassword = process.env.BLS_PASSWORD_FILE || path.join(liveChainDir, 'bls-pass.txt');
const gethBinary = path.join(REPO_ROOT, '.tmp', 'geth');
const blsPubkey =
  process.env.BLS_PUBKEY ||
  '0x82106fca090df4d75d8a0e40e71fe47619ce9a9d5425063e734e40dca8a1f536443ea556a68e715496c8753c1be83f02';
const DEFAULT_MAIN_CHAIN_TX_CONFIRMATIONS = parsePositiveIntegerEnv('GILTCONSENSUS_MAIN_CHAIN_TX_CONFIRMATIONS', 6);
const DEFAULT_GILT_CHAIN_TX_CONFIRMATIONS = parsePositiveIntegerEnv('GILTCONSENSUS_GILT_CHAIN_TX_CONFIRMATIONS', 10);
const GOLD_ROUTE_CONFIG = {
  PAXG: {
    tokenId: 1,
    rootDecimals: Number(process.env.PAXG_ROOT_DECIMALS || 18),
    goldDecimals: Number(process.env.GOLD_DECIMALS || 18),
    scaleNumerator: BigInt(process.env.PAXG_SCALE_NUMERATOR || '1000'),
    scaleDenominator: BigInt(process.env.PAXG_SCALE_DENOMINATOR || '1'),
    rootUnit: BigInt(process.env.PAXG_ROOT_UNIT || '1'),
  },
  XAUT: {
    tokenId: 2,
    rootDecimals: Number(process.env.XAUT_ROOT_DECIMALS || 6),
    goldDecimals: Number(process.env.GOLD_DECIMALS || 18),
    scaleNumerator: BigInt(process.env.XAUT_SCALE_NUMERATOR || '1000000000000000'),
    scaleDenominator: BigInt(process.env.XAUT_SCALE_DENOMINATOR || '1'),
    rootUnit: BigInt(process.env.XAUT_ROOT_UNIT || '1'),
  },
};
const ERC20_METADATA_ABI = [
  'function decimals() view returns (uint8)',
];

if (!walletFile) {
  throw new Error('wallet file not found (.testnet-wallets/evm-wallets.json or .roughnet-wallets/evm-wallets.json)');
}
if (!giltconsensusGenesisPath) {
  throw new Error('giltconsensus genesis not found (.giltconsensus-testnet or .giltconsensus-localnet)');
}

const rootArtifacts = {
  governance: readArtifact('bridge/pos-contracts/artifacts/contracts/common/governance/Governance.sol/Governance.json'),
  governanceProxy: readArtifact('bridge/pos-contracts/artifacts/contracts/common/governance/GovernanceProxy.sol/GovernanceProxy.json'),
  registry: readArtifact('bridge/pos-contracts/artifacts/contracts/common/Registry.sol/Registry.json'),
  eventsHub: readArtifact('bridge/pos-contracts/artifacts/contracts/staking/EventsHub.sol/EventsHub.json'),
  eventsHubProxy: readArtifact('bridge/pos-contracts/artifacts/contracts/staking/EventsHubProxy.sol/EventsHubProxy.json'),
  validatorShareFactory: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/staking/validatorShare/ValidatorShareFactory.sol/ValidatorShareFactory.json',
  ),
  validatorShareTest: readArtifact('bridge/pos-contracts/artifacts/contracts/test/ValidatorShareTest.sol/ValidatorShareTest.json'),
  stakeToken: readArtifact('bridge/pos-contracts/artifacts/contracts/common/tokens/TestToken.sol/TestToken.json'),
  polToken: readArtifact('bridge/pos-contracts/artifacts/contracts/common/tokens/ERC20Permit.sol/ERC20Permit.json'),
  giltMigration: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/common/misc/GiltMigration.sol/GiltMigration.json',
  ),
  stakingInfo: readArtifact('bridge/pos-contracts/artifacts/contracts/staking/StakingInfo.sol/StakingInfo.json'),
  stakingNFT: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/staking/stakeManager/StakingNFT.sol/StakingNFT.json',
  ),
  rootChain: readArtifact('bridge/pos-contracts/artifacts/contracts/root/RootChain.sol/RootChain.json'),
  rootChainProxy: readArtifact('bridge/pos-contracts/artifacts/contracts/root/RootChainProxy.sol/RootChainProxy.json'),
  stakeManagerTestable: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/test/StakeManagerTestable.sol/StakeManagerTestable.json',
  ),
  stakeManagerProxy: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/staking/stakeManager/StakeManagerProxy.sol/StakeManagerProxy.json',
  ),
  stakeManagerExtension: readArtifact(
    'bridge/pos-contracts/artifacts/contracts/staking/stakeManager/StakeManagerExtension.sol/StakeManagerExtension.json',
  ),
};

const portalArtifacts = {
  rootChainManager: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/RootChainManager/RootChainManager.sol/RootChainManager.json',
  ),
  rootChainManagerProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/RootChainManager/RootChainManagerProxy.sol/RootChainManagerProxy.json',
  ),
  stateSender: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/StateSender/StateSender.sol/StateSender.json',
  ),
  erc20Predicate: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/ERC20Predicate.sol/ERC20Predicate.json',
  ),
  erc20PredicateProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/ERC20PredicateProxy.sol/ERC20PredicateProxy.json',
  ),
  etherPredicate: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/EtherPredicate.sol/EtherPredicate.json',
  ),
  etherPredicateProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/EtherPredicateProxy.sol/EtherPredicateProxy.json',
  ),
  wrappedGiltPredicate: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/WrappedGiltPredicate.sol/WrappedGiltPredicate.json',
  ),
  wrappedGiltPredicateProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/WrappedGiltPredicateProxy.sol/WrappedGiltPredicateProxy.json',
  ),
  scaledErc1155Predicate: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/ScaledERC1155Predicate.sol/ScaledERC1155Predicate.json',
  ),
  scaledErc1155PredicateProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/root/TokenPredicates/ScaledERC1155PredicateProxy.sol/ScaledERC1155PredicateProxy.json',
  ),
  wrappedGilt: readArtifact('bridge/pos-portal/artifacts/contracts/root/RootToken/WrappedGilt.sol/WrappedGilt.json'),
  childChainManager: readArtifact(
    'bridge/pos-portal/artifacts/contracts/child/ChildChainManager/ChildChainManager.sol/ChildChainManager.json',
  ),
  childChainManagerProxy: readArtifact(
    'bridge/pos-portal/artifacts/contracts/child/ChildChainManager/ChildChainManagerProxy.sol/ChildChainManagerProxy.json',
  ),
  childErc20: readArtifact('bridge/pos-portal/artifacts/contracts/child/ChildToken/ChildERC20.sol/ChildERC20.json'),
  giltWeth: readArtifact('bridge/pos-portal/artifacts/contracts/child/ChildToken/GiltWETH.sol/GiltWETH.json'),
};

const chainArtifacts = {
  physicalGold1155: readArtifact('gilt-genesis-contract/out/PhysicalGold1155.sol/PhysicalGold1155.json'),
  legacyGoldReserveVault: readArtifact('gilt-genesis-contract/out/LegacyGoldReserveVault.sol/LegacyGoldReserveVault.json'),
};

const MOCK_OR_DUMMY_ARTIFACT_PATHS = [
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyERC20.sol/DummyERC20.json',
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyERC721.sol/DummyERC721.json',
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyERC1155.sol/DummyERC1155.json',
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyMintableERC20.sol/DummyMintableERC20.json',
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyMintableERC721.sol/DummyMintableERC721.json',
  'bridge/pos-portal/artifacts/contracts/root/RootToken/DummyMintableERC1155.sol/DummyMintableERC1155.json',
  'bridge/pos-portal/artifacts/contracts/test/MockChildNativeGilt.sol/MockChildNativeGilt.json',
];
const MOCK_OR_DUMMY_CONTRACT_ID_PATTERN = /(mock|dummy)/i;

function maybeReadArtifact(relativePath) {
  try {
    return readArtifact(relativePath);
  } catch (_) {
    return null;
  }
}

function loadCanonicalAbi(fileName) {
  return readJson(path.join(REPO_ROOT, 'gilt-genesis-contract', 'abi', fileName));
}

const govHubAbi = loadCanonicalAbi('govhub.abi');
const governorAbi = loadCanonicalAbi('giltgovernor.abi');
const govTokenAbi = loadCanonicalAbi('govtoken.abi');
const stakeHubAbi = loadCanonicalAbi('stakehub.abi');
const liveStakeHubAbi = stakeHubAbi;
const TIMELOCK_ADDRESS = '0x0000000000000000000000000000000000002006';

function contractKey(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function waitTx(txPromise) {
  const tx = await txPromise;
  return waitForMined(tx);
}

async function waitForBlockAdvance(provider, startBlock) {
  while ((await provider.getBlockNumber()) <= startBlock) {
    await sleep(1500);
  }
}

async function ensureDelegatedProposalVotes(provider, tokenOwnerWallet, delegatee, requiredVotes) {
  const govTokenReader = new ethers.Contract(GOV_TOKEN_ADDRESS, govTokenAbi, provider);
  const govTokenWriter = govTokenReader.connect(tokenOwnerWallet);
  const ownerAddress = await tokenOwnerWallet.getAddress();
  const currentDelegate = await govTokenReader.delegates(ownerAddress);

  if (currentDelegate.toLowerCase() !== delegatee.toLowerCase()) {
    const startBlock = await provider.getBlockNumber();
    await waitTx(govTokenWriter.delegate(delegatee));
    await waitForBlockAdvance(provider, startBlock);
  }

  const votes = await govTokenReader.getVotes(delegatee);
  if (votes < requiredVotes) {
    throw new Error(
      `Proposer votes too low for ${delegatee}: have ${votes.toString()} need ${requiredVotes.toString()}`,
    );
  }

  return votes;
}

async function deployProxyInitialized(adminSigner, implArtifact, proxyArtifact, initArgs) {
  const impl = await deployContract(adminSigner, implArtifact);
  const proxy = await deployContract(adminSigner, proxyArtifact, [ZERO_ADDRESS]);
  const proxied = new ethers.Contract(await proxy.getAddress(), implArtifact.abi, adminSigner);
  const tx = await proxy.updateAndCall(
    await impl.getAddress(),
    proxied.interface.encodeFunctionData('initialize', initArgs),
    { gasLimit: 3_000_000 },
  );
  await waitForMined(tx);
  return proxied;
}

function artifactBytecode(artifact) {
  const bytecode = artifact?.bytecode?.object ?? artifact?.bytecode;
  if (!bytecode) {
    throw new Error('artifact is missing bytecode');
  }
  return bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`;
}

function artifactDeployedBytecode(artifact) {
  const bytecode = artifact?.deployedBytecode?.object ?? artifact?.deployedBytecode;
  if (!bytecode) {
    return null;
  }
  return bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`;
}

function mockOrDummyCodeHashes() {
  const hashes = new Set();
  for (const relativePath of MOCK_OR_DUMMY_ARTIFACT_PATHS) {
    const artifact = maybeReadArtifact(relativePath);
    if (!artifact) {
      continue;
    }
    const deployed = artifactDeployedBytecode(artifact);
    if (!deployed || deployed === '0x') {
      continue;
    }
    hashes.add(ethers.keccak256(deployed));
  }
  return hashes;
}

const MOCK_OR_DUMMY_HASHES = mockOrDummyCodeHashes();

const CONTRACT_ID_SELECTORS = [
  ethers.id('contractId()').slice(0, 10),
  ethers.id('getContractId()').slice(0, 10),
  ethers.id('CONTRACT_ID()').slice(0, 10),
];

function decodeContractID(raw) {
  if (!raw || raw === '0x') {
    return null;
  }

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  try {
    const [decodedString] = abiCoder.decode(['string'], raw);
    if (typeof decodedString === 'string' && decodedString.trim() !== '') {
      return decodedString.trim();
    }
  } catch (_) {
    // no-op; try bytes32 decode next.
  }

  try {
    const [decodedBytes32] = abiCoder.decode(['bytes32'], raw);
    const decoded = ethers.decodeBytes32String(decodedBytes32).trim();
    return decoded === '' ? null : decoded;
  } catch (_) {
    return null;
  }
}

async function readContractID(provider, address) {
  for (const selector of CONTRACT_ID_SELECTORS) {
    try {
      const raw = await provider.call({ to: address, data: selector });
      const decoded = decodeContractID(raw);
      if (decoded) {
        return decoded;
      }
    } catch (_) {
      // no-op; selector not implemented or decode failed.
    }
  }
  return null;
}

async function assertNotMockOrDummyContract(provider, address, label) {
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error(`${label} at ${address} has no runtime bytecode`);
  }

  const hash = ethers.keccak256(code);
  if (MOCK_OR_DUMMY_HASHES.has(hash)) {
    throw new Error(`${label} at ${address} matches mock/dummy runtime bytecode and cannot be used in production`);
  }

  const contractID = await readContractID(provider, address);
  if (contractID && MOCK_OR_DUMMY_CONTRACT_ID_PATTERN.test(contractID)) {
    throw new Error(`${label} at ${address} exposes mock/dummy contract id ${contractID}`);
  }
}

async function assertRootTokenDecimals(provider, tokenAddress, expectedDecimals, routeName) {
  const token = new ethers.Contract(tokenAddress, ERC20_METADATA_ABI, provider);
  const decimals = Number(await token.decimals());
  if (decimals !== expectedDecimals) {
    throw new Error(
      `${routeName} decimals mismatch at ${tokenAddress}: expected ${expectedDecimals}, got ${decimals}`,
    );
  }
}

async function deployContractWithNonce(signer, artifact, nonceRef, args = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifactBytecode(artifact), signer);
  const contract = await factory.deploy(...args, { nonce: nonceRef.value++ });
  await waitForMined(contract.deploymentTransaction());
  return contract;
}

async function deployProxyInitializedWithNonce(adminSigner, implArtifact, proxyArtifact, initArgs, nonceRef) {
  const impl = await deployContractWithNonce(adminSigner, implArtifact, nonceRef);
  const proxy = await deployContractWithNonce(adminSigner, proxyArtifact, nonceRef, [ZERO_ADDRESS]);
  const proxied = new ethers.Contract(await proxy.getAddress(), implArtifact.abi, adminSigner);
  const tx = await proxy.updateAndCall(
    await impl.getAddress(),
    proxied.interface.encodeFunctionData('initialize', initArgs),
    { nonce: nonceRef.value++, gasLimit: 3_000_000 },
  );
  await waitForMined(tx);
  return proxied;
}

async function deployEventsHub(adminSigner, registry) {
  const impl = await deployContract(adminSigner, rootArtifacts.eventsHub);
  const proxy = await deployContract(adminSigner, rootArtifacts.eventsHubProxy, [ZERO_ADDRESS]);
  const proxied = new ethers.Contract(await proxy.getAddress(), rootArtifacts.eventsHub.abi, adminSigner);
  const tx = await proxy.updateAndCall(await impl.getAddress(), proxied.interface.encodeFunctionData('initialize', [await registry.getAddress()]));
  await waitForMined(tx);
  return proxied;
}

async function deployStakeManager(sepoliaSigner, sepoliaWallet, governance, registry, rootChain, giltconsensusChainId) {
  const eventsHub = await deployEventsHub(sepoliaSigner, registry);
  const validatorShareFactory = await deployContract(sepoliaSigner, rootArtifacts.validatorShareFactory);
  const validatorShareImpl = await deployContract(sepoliaSigner, rootArtifacts.validatorShareTest);
  const stakeToken = await deployContract(sepoliaSigner, rootArtifacts.stakeToken, ['Stake Token', 'STAKE']);
  const polToken = await deployContract(sepoliaSigner, rootArtifacts.polToken, ['POL', 'POL', '1.1.0']);
  const migration = await deployContract(sepoliaSigner, rootArtifacts.giltMigration, [
    await stakeToken.getAddress(),
    await polToken.getAddress(),
  ]);
  const stakingInfo = await deployContract(sepoliaSigner, rootArtifacts.stakingInfo, [await registry.getAddress()]);
  const stakingNFT = await deployContract(sepoliaSigner, rootArtifacts.stakingNFT, ['Gilt Validator', 'GV']);
  const extension = await deployContract(sepoliaSigner, rootArtifacts.stakeManagerExtension);
  const stakeManagerImpl = await deployContract(sepoliaSigner, rootArtifacts.stakeManagerTestable);
  const stakeManagerProxy = await deployContract(sepoliaSigner, rootArtifacts.stakeManagerProxy, [ZERO_ADDRESS]);
  const stakeManager = new ethers.Contract(await stakeManagerProxy.getAddress(), rootArtifacts.stakeManagerTestable.abi, sepoliaSigner);
  const sepoliaAddress = await sepoliaSigner.getAddress();

  const initTx = await stakeManagerProxy.updateAndCall(
    await stakeManagerImpl.getAddress(),
    stakeManager.interface.encodeFunctionData('initialize', [
      await registry.getAddress(),
      await rootChain.getAddress(),
      await stakeToken.getAddress(),
      await stakingNFT.getAddress(),
      await stakingInfo.getAddress(),
      await validatorShareFactory.getAddress(),
      await governance.getAddress(),
      sepoliaAddress,
      await extension.getAddress(),
      await polToken.getAddress(),
      await migration.getAddress(),
    ]),
  );
  await waitForMined(initTx);

  await waitTx(stakingNFT.transferOwnership(await stakeManager.getAddress()));

  const governanceContract = new ethers.Contract(await governance.getAddress(), rootArtifacts.governance.abi, sepoliaSigner);
  await waitTx(
    governanceContract.update(
      await registry.getAddress(),
      registry.interface.encodeFunctionData('updateContractMap', [contractKey('eventsHub'), await eventsHub.getAddress()]),
    ),
  );
  await waitTx(
    governanceContract.update(
      await registry.getAddress(),
      registry.interface.encodeFunctionData('updateContractMap', [contractKey('stakeManager'), await stakeManager.getAddress()]),
    ),
  );
  await waitTx(
    governanceContract.update(
      await registry.getAddress(),
      registry.interface.encodeFunctionData('updateContractMap', [contractKey('validatorShare'), await validatorShareImpl.getAddress()]),
    ),
  );
  await waitTx(
    governanceContract.update(
      await registry.getAddress(),
      registry.interface.encodeFunctionData('updateContractMap', [contractKey('pol'), await polToken.getAddress()]),
    ),
  );

  await waitTx(
    governanceContract.update(
      await stakeManager.getAddress(),
      stakeManager.interface.encodeFunctionData('updateCheckPointBlockInterval', [1]),
    ),
  );

  const giltconsensusFee = ethers.parseEther('1');
  const stakeAmount = ethers.parseEther('200');
  await waitTx(polToken.approve(await stakeManager.getAddress(), stakeAmount + giltconsensusFee));
  await waitTx(
    stakeManager.stakeForPOL(
      sepoliaAddress,
      stakeAmount,
      giltconsensusFee,
      false,
      publicKeyBytes(sepoliaWallet.privateKey),
    ),
  );

  return {
    giltconsensusChainId,
    eventsHub,
    migration,
    polToken,
    stakeManager,
    stakeToken,
    stakingInfo,
    stakingNFT,
    validatorShareFactory,
    validatorShareImpl,
  };
}

async function governUpdateParam(provider, key, valueBytes, target, description, governanceWallet, fallbackProposalWallet = governanceWallet) {
  const govHub = new ethers.Contract(GOV_HUB_ADDRESS, govHubAbi, governanceWallet);
  const governor = new ethers.Contract(GOVERNOR_ADDRESS, governorAbi, provider);
  const governanceAddress = await governanceWallet.getAddress();
  const fallbackAddress = await fallbackProposalWallet.getAddress();
  const proposalThreshold = await governor.proposalThreshold();

  const resolveLiveProposal = async (account) => {
    const latestProposalId = await governor.latestProposalIds(account);
    if (latestProposalId === 0n) {
      return null;
    }

    const proposalState = Number(await governor.state(latestProposalId));
    return {
      latestProposalId,
      proposalState,
      isLive: proposalState === 0 || proposalState === 1,
    };
  };

  let proposalWallet = governanceWallet;
  let proposalAddress = governanceAddress;
  const governanceProposal = await resolveLiveProposal(governanceAddress);
  if (governanceProposal?.isLive) {
    const fallbackProposal = await resolveLiveProposal(fallbackAddress);
    if (fallbackProposal?.isLive) {
      throw new Error(
        `No free governance proposer: ${governanceAddress} has live proposal ${governanceProposal.latestProposalId} and ${fallbackAddress} has live proposal ${fallbackProposal.latestProposalId}`,
      );
    }

    proposalWallet = fallbackProposalWallet;
    proposalAddress = fallbackAddress;
  }

  await ensureDelegatedProposalVotes(provider, governanceWallet, proposalAddress, proposalThreshold);

  const proposalGovernor = governor.connect(proposalWallet);

  const targets = [GOV_HUB_ADDRESS];
  const values = [0];
  const calldatas = [govHub.interface.encodeFunctionData('updateParam', [key, valueBytes, target])];
  const descriptionHash = ethers.id(description);

  await waitTx(proposalGovernor.propose(targets, values, calldatas, description));
  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
  const startBlock = await provider.getBlockNumber();

  while ((await provider.getBlockNumber()) < startBlock + 1) {
    await sleep(1500);
  }

  await waitTx(proposalGovernor.castVote(proposalId, 1));
  const deadline = Number(await governor.proposalDeadline(proposalId));
  while ((await provider.getBlockNumber()) <= deadline) {
    await sleep(1500);
  }

  await waitTx(proposalGovernor.queue(targets, values, calldatas, descriptionHash));
  await sleep(65000);
  await waitTx(proposalGovernor.execute(targets, values, calldatas, descriptionHash));
}

async function governContractCall(
  provider,
  targets,
  values,
  calldatas,
  description,
  governanceWallet,
  fallbackProposalWallet = governanceWallet,
) {
  const governor = new ethers.Contract(GOVERNOR_ADDRESS, governorAbi, provider);
  const governanceAddress = await governanceWallet.getAddress();
  const fallbackAddress = await fallbackProposalWallet.getAddress();
  const proposalThreshold = await governor.proposalThreshold();

  const resolveLiveProposal = async (account) => {
    const latestProposalId = await governor.latestProposalIds(account);
    if (latestProposalId === 0n) {
      return null;
    }

    const proposalState = Number(await governor.state(latestProposalId));
    return {
      latestProposalId,
      proposalState,
      isLive: proposalState === 0 || proposalState === 1,
    };
  };

  let proposalWallet = governanceWallet;
  let proposalAddress = governanceAddress;
  const governanceProposal = await resolveLiveProposal(governanceAddress);
  if (governanceProposal?.isLive) {
    const fallbackProposal = await resolveLiveProposal(fallbackAddress);
    if (fallbackProposal?.isLive) {
      throw new Error(
        `No free governance proposer: ${governanceAddress} has live proposal ${governanceProposal.latestProposalId} and ${fallbackAddress} has live proposal ${fallbackProposal.latestProposalId}`,
      );
    }

    proposalWallet = fallbackProposalWallet;
    proposalAddress = fallbackAddress;
  }

  await ensureDelegatedProposalVotes(provider, governanceWallet, proposalAddress, proposalThreshold);

  const proposalGovernor = governor.connect(proposalWallet);
  const descriptionHash = ethers.id(description);

  await waitTx(proposalGovernor.propose(targets, values, calldatas, description));
  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
  const startBlock = await provider.getBlockNumber();

  while ((await provider.getBlockNumber()) < startBlock + 1) {
    await sleep(1500);
  }

  await waitTx(proposalGovernor.castVote(proposalId, 1));
  const deadline = Number(await governor.proposalDeadline(proposalId));
  while ((await provider.getBlockNumber()) <= deadline) {
    await sleep(1500);
  }

  await waitTx(proposalGovernor.queue(targets, values, calldatas, descriptionHash));
  await sleep(65000);
  await waitTx(proposalGovernor.execute(targets, values, calldatas, descriptionHash));
}

async function ensureLiveGovernanceReadiness(provider, validatorWallet, governanceWallet, childChainId) {
  const stakeHub = new ethers.Contract(STAKE_HUB_ADDRESS, liveStakeHubAbi, provider);
  const govToken = new ethers.Contract(GOV_TOKEN_ADDRESS, govTokenAbi, provider);
  const governor = new ethers.Contract(GOVERNOR_ADDRESS, governorAbi, provider);
  const proposeStartSupplyThreshold = ethers.parseEther('10000000');
  const validatorAddress = await validatorWallet.getAddress();
  const governanceAddress = await governanceWallet.getAddress();

  const electionInfo = await stakeHub.getValidatorElectionInfo(0, 0);
  const validatorCount = Number(electionInfo[3]);
  if (validatorCount === 0) {
    const lockAmount = await stakeHub.LOCK_AMOUNT();
    const validatorProofOutput = execFileSync(
      gethBinary,
      [
        'bls',
        'account',
        'generate-proof',
        '--chain-id',
        String(childChainId),
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
      moniker: 'Gold1',
      identity: validatorAddress,
      website: 'https://goldchain.local',
      details: 'live bridge testnet validator',
    };

    const createValidatorTx = await validatorWallet.sendTransaction({
      to: STAKE_HUB_ADDRESS,
      data: stakeHub.interface.encodeFunctionData('createValidator', [
        validatorAddress,
        blsPubkey,
        validatorProof,
        commission,
        description,
      ]),
      value: ethers.parseEther('2000') + lockAmount,
      gasLimit: 3_000_000,
    });
    await waitForMined(createValidatorTx);
  }

  const proposalThreshold = await governor.proposalThreshold();
  const govSupply = await govToken.totalSupply();
  const governanceBalance = await govToken.balanceOf(governanceAddress);
  const supplyShortfall = govSupply < proposeStartSupplyThreshold ? proposeStartSupplyThreshold - govSupply : 0n;
  const balanceShortfall = governanceBalance < proposalThreshold ? proposalThreshold - governanceBalance : 0n;
  const requiredStake = supplyShortfall > balanceShortfall ? supplyShortfall : balanceShortfall;

  if (requiredStake > 0n) {
    const nativeStakeTx = await stakeHub.connect(governanceWallet).delegate(validatorAddress, false, {
      value: requiredStake,
      gasLimit: 1_500_000,
    });
    await waitForMined(nativeStakeTx);
  }

  await ensureDelegatedProposalVotes(provider, governanceWallet, governanceAddress, proposalThreshold);
}

async function configureGoldRoutePrecision({
  sepoliaProvider,
  roughnetProvider,
  scaledErc1155Predicate,
  childGold,
  rootPaxgAddress,
  rootXautAddress,
}) {
  await assertRootTokenDecimals(sepoliaProvider, rootPaxgAddress, GOLD_ROUTE_CONFIG.PAXG.rootDecimals, 'PAXG');
  await assertRootTokenDecimals(sepoliaProvider, rootXautAddress, GOLD_ROUTE_CONFIG.XAUT.rootDecimals, 'XAUT');

  await assertNotMockOrDummyContract(sepoliaProvider, rootPaxgAddress, 'PAXG root token');
  await assertNotMockOrDummyContract(sepoliaProvider, rootXautAddress, 'XAUT root token');
  await assertNotMockOrDummyContract(roughnetProvider, await childGold.getAddress(), 'child GOLD token');

  await waitTx(
    scaledErc1155Predicate.configureGoldRoutePrecision(
      rootPaxgAddress,
      GOLD_ROUTE_CONFIG.PAXG.tokenId,
      GOLD_ROUTE_CONFIG.PAXG.rootDecimals,
      GOLD_ROUTE_CONFIG.PAXG.goldDecimals,
      GOLD_ROUTE_CONFIG.PAXG.scaleNumerator,
      GOLD_ROUTE_CONFIG.PAXG.scaleDenominator,
      GOLD_ROUTE_CONFIG.PAXG.rootUnit,
    ),
  );
  await waitTx(
    scaledErc1155Predicate.configureGoldRoutePrecision(
      rootXautAddress,
      GOLD_ROUTE_CONFIG.XAUT.tokenId,
      GOLD_ROUTE_CONFIG.XAUT.rootDecimals,
      GOLD_ROUTE_CONFIG.XAUT.goldDecimals,
      GOLD_ROUTE_CONFIG.XAUT.scaleNumerator,
      GOLD_ROUTE_CONFIG.XAUT.scaleDenominator,
      GOLD_ROUTE_CONFIG.XAUT.rootUnit,
    ),
  );
}

async function main() {
  const sepoliaRpc = process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC;
  const roughnetRpc = process.env.CHILD_RPC_URL || process.env.ROUGHNET_RPC_URL || 'http://127.0.0.1:8545';
  const reuseRoot = process.env.REUSE_ROOT === '1';
  const skipStakeGoldCutover = process.env.SKIP_STAKE_GOLD === '1';
  const roughnetWallets = readJson(walletFile);
  const validatorKeyPath = path.join(liveChainDir, 'validator-ecdsa.key');
  const rawPrivateKey =
    process.env.PRIVATE_KEY || fs.readFileSync(validatorKeyPath, 'utf8').trim();
  const privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;
  const defaultRoughnetDeployerKey = roughnetWallets[2]?.private_key || roughnetWallets[1]?.private_key || rawPrivateKey;
  const rawRoughnetPrivateKey = process.env.ROUGHNET_PRIVATE_KEY || defaultRoughnetDeployerKey;
  const roughnetPrivateKey = rawRoughnetPrivateKey.startsWith('0x')
    ? rawRoughnetPrivateKey
    : `0x${rawRoughnetPrivateKey}`;

  const sepoliaProvider = rpcProviderFor(sepoliaRpc);
  const roughnetProvider = rpcProviderFor(roughnetRpc);
  const childNetwork = await roughnetProvider.getNetwork();
  const childChainId = childNetwork.chainId.toString();
  const validatorWallet = new ethers.Wallet(roughnetWallets[0].private_key, roughnetProvider);
  const governanceWallet = new ethers.Wallet(roughnetWallets[1].private_key, roughnetProvider);
  const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);
  const sepoliaSigner = new ethers.NonceManager(sepoliaWallet);
  const sepoliaAddress = await sepoliaSigner.getAddress();
  const roughnetSigner = new ethers.Wallet(roughnetPrivateKey, roughnetProvider);
  const roughnetSignerAddress = roughnetSigner.address;
  const roughnetNonceRef = {
    value: await roughnetProvider.getTransactionCount(roughnetSignerAddress, 'pending'),
  };

  const sepBalance = await sepoliaProvider.getBalance(sepoliaAddress);
  console.log(`Sepolia deployer ${sepoliaAddress} balance: ${ethers.formatEther(sepBalance)} ETH`);

  const giltconsensusGenesis = readJson(giltconsensusGenesisPath);
  const giltconsensusChainId = giltconsensusGenesis.chain_id;

  const existingAddressBook = reuseRoot ? loadAddressBook() : null;
  if (reuseRoot && !existingAddressBook?.root?.rootChainManager) {
    throw new Error('REUSE_ROOT=1 requires an existing live bridge address book');
  }

  console.log(`Deploying child contracts on chain ${childChainId}`);
  const childChainManager = await deployProxyInitializedWithNonce(
    roughnetSigner,
    portalArtifacts.childChainManager,
    portalArtifacts.childChainManagerProxy,
    [roughnetSignerAddress],
    roughnetNonceRef,
  );
  const childGold = await deployContractWithNonce(roughnetSigner, chainArtifacts.physicalGold1155, roughnetNonceRef, [
    'ipfs://gold/{id}.json',
    1000,
    1,
    TIMELOCK_ADDRESS,
  ]);
  const legacyGoldReserveVault = await deployContractWithNonce(
    roughnetSigner,
    chainArtifacts.legacyGoldReserveVault,
    roughnetNonceRef,
  );
  const childUsdc = await deployContractWithNonce(roughnetSigner, portalArtifacts.childErc20, roughnetNonceRef, [
    'USD Coin',
    'USDC',
    18,
    await childChainManager.getAddress(),
  ]);
  const childUsdt = await deployContractWithNonce(roughnetSigner, portalArtifacts.childErc20, roughnetNonceRef, [
    'Tether USD',
    'USDT',
    18,
    await childChainManager.getAddress(),
  ]);
  const childWeth = await deployContractWithNonce(roughnetSigner, portalArtifacts.giltWeth, roughnetNonceRef, [
    await childChainManager.getAddress(),
  ]);

  const stateSyncerRole = await childChainManager.STATE_SYNCER_ROLE();
  await waitTx(childChainManager.grantRole(stateSyncerRole, STATE_RECEIVER_ADDRESS, { nonce: roughnetNonceRef.value++ }));

  let governance;
  let registry;
  let rootChain;
  let staking;
  let stateSender;
  let rootChainManager;
  let erc20Predicate;
  let etherPredicate;
  let wrappedGiltPredicate;
  let scaledErc1155Predicate;
  let wrappedGilt;
  let rootPaxg;
  let rootXaut;
  let rootUsdc;
  let rootUsdt;

  if (reuseRoot) {
    console.log('Reusing existing Sepolia root checkpoint stack');
    governance = new ethers.Contract(existingAddressBook.root.governance, rootArtifacts.governance.abi, sepoliaSigner);
    registry = new ethers.Contract(existingAddressBook.root.registry, rootArtifacts.registry.abi, sepoliaSigner);
    rootChain = new ethers.Contract(existingAddressBook.root.rootChain, rootArtifacts.rootChain.abi, sepoliaSigner);
    staking = {
      stakeManager: new ethers.Contract(existingAddressBook.root.stakeManager, rootArtifacts.stakeManagerTestable.abi, sepoliaSigner),
      stakeToken: new ethers.Contract(existingAddressBook.root.stakeToken, rootArtifacts.stakeToken.abi, sepoliaSigner),
      polToken: new ethers.Contract(existingAddressBook.root.polToken, rootArtifacts.polToken.abi, sepoliaSigner),
      stakingInfo: new ethers.Contract(existingAddressBook.root.stakingInfo, rootArtifacts.stakingInfo.abi, sepoliaSigner),
    };
    stateSender = new ethers.Contract(existingAddressBook.root.stateSender, portalArtifacts.stateSender.abi, sepoliaSigner);
    rootChainManager = new ethers.Contract(
      existingAddressBook.root.rootChainManager,
      portalArtifacts.rootChainManager.abi,
      sepoliaSigner,
    );
    erc20Predicate = new ethers.Contract(existingAddressBook.root.erc20Predicate, portalArtifacts.erc20Predicate.abi, sepoliaSigner);
    etherPredicate = new ethers.Contract(existingAddressBook.root.etherPredicate, portalArtifacts.etherPredicate.abi, sepoliaSigner);
    wrappedGiltPredicate = new ethers.Contract(
      existingAddressBook.root.wrappedGiltPredicate,
      portalArtifacts.wrappedGiltPredicate.abi,
      sepoliaSigner,
    );
    scaledErc1155Predicate = new ethers.Contract(
      existingAddressBook.root.scaledErc1155Predicate,
      portalArtifacts.scaledErc1155Predicate.abi,
      sepoliaSigner,
    );
    wrappedGilt = new ethers.Contract(existingAddressBook.root.wrappedGilt, portalArtifacts.wrappedGilt.abi, sepoliaSigner);
    rootPaxg = new ethers.Contract(existingAddressBook.root.paxg, ERC20_METADATA_ABI, sepoliaSigner);
    rootXaut = new ethers.Contract(existingAddressBook.root.xaut, ERC20_METADATA_ABI, sepoliaSigner);
    rootUsdc = new ethers.Contract(existingAddressBook.root.usdc, ERC20_METADATA_ABI, sepoliaSigner);
    rootUsdt = new ethers.Contract(existingAddressBook.root.usdt, ERC20_METADATA_ABI, sepoliaSigner);

    const rootLastChildBlock = Number(await rootChain.getLastChildBlock());
    const roughnetHead = await roughnetProvider.getBlockNumber();
    if (roughnetHead <= rootLastChildBlock) {
      throw new Error(
        `REUSE_ROOT=1 is unsafe for this child chain: root checkpoint stack already covers child block ${rootLastChildBlock}, but current child head is only ${roughnetHead}`,
      );
    }
  } else {
    console.log('Deploying Sepolia root checkpoint stack');
    const governanceImpl = await deployContract(sepoliaSigner, rootArtifacts.governance);
    const governanceProxy = await deployContract(sepoliaSigner, rootArtifacts.governanceProxy, [
      await governanceImpl.getAddress(),
    ]);
    governance = new ethers.Contract(await governanceProxy.getAddress(), rootArtifacts.governance.abi, sepoliaSigner);
    registry = await deployContract(sepoliaSigner, rootArtifacts.registry, [await governance.getAddress()]);
    const rootChainImpl = await deployContract(sepoliaSigner, rootArtifacts.rootChain);
    const rootChainProxy = await deployContract(sepoliaSigner, rootArtifacts.rootChainProxy, [
      await rootChainImpl.getAddress(),
      await registry.getAddress(),
      giltconsensusChainId,
    ]);
    rootChain = new ethers.Contract(await rootChainProxy.getAddress(), rootArtifacts.rootChain.abi, sepoliaSigner);

    staking = await deployStakeManager(sepoliaSigner, sepoliaWallet, governance, registry, rootChain, giltconsensusChainId);

    console.log('Deploying Sepolia portal contracts');
    stateSender = await deployContract(sepoliaSigner, portalArtifacts.stateSender);
    rootChainManager = await deployProxyInitialized(
      sepoliaSigner,
      portalArtifacts.rootChainManager,
      portalArtifacts.rootChainManagerProxy,
      [sepoliaAddress],
    );
    erc20Predicate = await deployProxyInitialized(
      sepoliaSigner,
      portalArtifacts.erc20Predicate,
      portalArtifacts.erc20PredicateProxy,
      [sepoliaAddress],
    );
    etherPredicate = await deployProxyInitialized(
      sepoliaSigner,
      portalArtifacts.etherPredicate,
      portalArtifacts.etherPredicateProxy,
      [sepoliaAddress],
    );
    wrappedGiltPredicate = await deployProxyInitialized(
      sepoliaSigner,
      portalArtifacts.wrappedGiltPredicate,
      portalArtifacts.wrappedGiltPredicateProxy,
      [sepoliaAddress],
    );
    scaledErc1155Predicate = await deployProxyInitialized(
      sepoliaSigner,
      portalArtifacts.scaledErc1155Predicate,
      portalArtifacts.scaledErc1155PredicateProxy,
      [sepoliaAddress, 1000, 1],
    );

    wrappedGilt = await deployContract(sepoliaSigner, portalArtifacts.wrappedGilt);
    const rootPaxgAddress = process.env.ROOT_PAXG_ADDRESS;
    const rootXautAddress = process.env.ROOT_XAUT_ADDRESS;
    const rootUsdcAddress = process.env.ROOT_USDC_ADDRESS;
    const rootUsdtAddress = process.env.ROOT_USDT_ADDRESS;
    if (!rootPaxgAddress || !rootXautAddress || !rootUsdcAddress || !rootUsdtAddress) {
      throw new Error(
        'ROOT_PAXG_ADDRESS, ROOT_XAUT_ADDRESS, ROOT_USDC_ADDRESS, and ROOT_USDT_ADDRESS are required for production deployment',
      );
    }
    rootPaxg = new ethers.Contract(rootPaxgAddress, ERC20_METADATA_ABI, sepoliaSigner);
    rootXaut = new ethers.Contract(rootXautAddress, ERC20_METADATA_ABI, sepoliaSigner);
    rootUsdc = new ethers.Contract(rootUsdcAddress, ERC20_METADATA_ABI, sepoliaSigner);
    rootUsdt = new ethers.Contract(rootUsdtAddress, ERC20_METADATA_ABI, sepoliaSigner);

    await waitTx(rootChainManager.setStateSender(await stateSender.getAddress()));
    await waitTx(rootChainManager.setCheckpointManager(await rootChain.getAddress()));

    const managerRole = await erc20Predicate.MANAGER_ROLE();
    await waitTx(erc20Predicate.grantRole(managerRole, await rootChainManager.getAddress()));
    await waitTx(etherPredicate.grantRole(managerRole, await rootChainManager.getAddress()));
    await waitTx(wrappedGiltPredicate.grantRole(managerRole, await rootChainManager.getAddress()));
    await waitTx(scaledErc1155Predicate.grantRole(managerRole, await rootChainManager.getAddress()));

    const wrappedGiltPredicateRole = await wrappedGilt.PREDICATE_ROLE();
    await waitTx(wrappedGilt.grantRole(wrappedGiltPredicateRole, await wrappedGiltPredicate.getAddress()));

    await waitTx(rootChainManager.registerPredicate(await erc20Predicate.TOKEN_TYPE(), await erc20Predicate.getAddress()));
    await waitTx(rootChainManager.registerPredicate(await etherPredicate.TOKEN_TYPE(), await etherPredicate.getAddress()));
    await waitTx(
      rootChainManager.registerPredicate(await wrappedGiltPredicate.TOKEN_TYPE(), await wrappedGiltPredicate.getAddress()),
    );
    await waitTx(
      rootChainManager.registerPredicate(
        await scaledErc1155Predicate.TOKEN_TYPE(),
        await scaledErc1155Predicate.getAddress(),
      ),
    );
  }

  await waitTx(rootChainManager.setChildChainManagerAddress(await childChainManager.getAddress()));
  await waitTx(stateSender.register(await rootChainManager.getAddress(), await childChainManager.getAddress()));
  await configureGoldRoutePrecision({
    sepoliaProvider,
    roughnetProvider,
    scaledErc1155Predicate,
    childGold,
    rootPaxgAddress: await rootPaxg.getAddress(),
    rootXautAddress: await rootXaut.getAddress(),
  });
  await assertNotMockOrDummyContract(sepoliaProvider, await rootUsdc.getAddress(), 'USDC root token');
  await assertNotMockOrDummyContract(sepoliaProvider, await rootUsdt.getAddress(), 'USDT root token');
  await assertNotMockOrDummyContract(sepoliaProvider, await wrappedGilt.getAddress(), 'wrapped GILT root token');
  await assertNotMockOrDummyContract(roughnetProvider, await childChainManager.getAddress(), 'child chain manager');

  console.log('Submitting root mappings for the current child bridge manager');
  const scaledErc1155Type = await scaledErc1155Predicate.TOKEN_TYPE();
  const erc20Type = await erc20Predicate.TOKEN_TYPE();
  const etherType = await etherPredicate.TOKEN_TYPE();
  const wrappedGiltType = await wrappedGiltPredicate.TOKEN_TYPE();
  await submitGoldMapping(
    rootChainManager,
    childChainManager,
    await rootPaxg.getAddress(),
    await childGold.getAddress(),
    1,
    scaledErc1155Type,
  );
  await submitGoldMapping(
    rootChainManager,
    childChainManager,
    await rootXaut.getAddress(),
    await childGold.getAddress(),
    2,
    scaledErc1155Type,
  );
  await submitStandardMapping(
    rootChainManager,
    childChainManager,
    await rootUsdc.getAddress(),
    await childUsdc.getAddress(),
    erc20Type,
  );
  await submitStandardMapping(
    rootChainManager,
    childChainManager,
    await rootUsdt.getAddress(),
    await childUsdt.getAddress(),
    erc20Type,
  );
  await submitStandardMapping(
    rootChainManager,
    childChainManager,
    ROOT_ETHER_ADDRESS,
    await childWeth.getAddress(),
    etherType,
  );
  await submitStandardMapping(
    rootChainManager,
    childChainManager,
    await wrappedGilt.getAddress(),
    NATIVE_GILT_BRIDGE_ADDRESS,
    wrappedGiltType,
  );

  const addressBook = {
    meta: {
      generatedAt: new Date().toISOString(),
      giltconsensusChainId,
      sepoliaRpc,
      roughnetRpc,
      childRpc: roughnetRpc,
      childChainId,
      checkpointAccountHash: CHECKPOINT_ACCOUNT_HASH,
      deployer: sepoliaAddress,
      nativeGiltBridge: NATIVE_GILT_BRIDGE_ADDRESS,
      stateReceiver: STATE_RECEIVER_ADDRESS,
    },
    root: {
      governance: await governance.getAddress(),
      registry: await registry.getAddress(),
      rootChain: await rootChain.getAddress(),
      stakeManager: await staking.stakeManager.getAddress(),
      stakeToken: await staking.stakeToken.getAddress(),
      polToken: await staking.polToken.getAddress(),
      stakingInfo: await staking.stakingInfo.getAddress(),
      stateSender: await stateSender.getAddress(),
      rootChainManager: await rootChainManager.getAddress(),
      erc20Predicate: await erc20Predicate.getAddress(),
      etherPredicate: await etherPredicate.getAddress(),
      wrappedGiltPredicate: await wrappedGiltPredicate.getAddress(),
      scaledErc1155Predicate: await scaledErc1155Predicate.getAddress(),
      wrappedGilt: await wrappedGilt.getAddress(),
      paxg: await rootPaxg.getAddress(),
      xaut: await rootXaut.getAddress(),
      usdc: await rootUsdc.getAddress(),
      usdt: await rootUsdt.getAddress(),
    },
    child: {
      childChainManager: await childChainManager.getAddress(),
      gold: await childGold.getAddress(),
      legacyGoldReserveVault: await legacyGoldReserveVault.getAddress(),
      goldPaxgId: '1',
      goldXautId: '2',
      usdc: await childUsdc.getAddress(),
      usdt: await childUsdt.getAddress(),
      weth: await childWeth.getAddress(),
    },
  };
  saveAddressBook(addressBook);

  console.log(
    skipStakeGoldCutover
      ? 'Wiring bridge runtime only; leaving StakeHub GOLD unchanged'
      : 'Wiring governance for GOLD and native GILT bridge',
  );
  await ensureLiveGovernanceReadiness(roughnetProvider, validatorWallet, governanceWallet, childChainId);
  await governContractCall(
    roughnetProvider,
    [await childGold.getAddress(), await childGold.getAddress(), await childGold.getAddress(), await childGold.getAddress()],
    [0, 0, 0, 0],
    [
      childGold.interface.encodeFunctionData('setBridgeRoutePrecision', [
        GOLD_ROUTE_CONFIG.PAXG.tokenId,
        GOLD_ROUTE_CONFIG.PAXG.rootDecimals,
        GOLD_ROUTE_CONFIG.PAXG.goldDecimals,
        GOLD_ROUTE_CONFIG.PAXG.scaleNumerator,
        GOLD_ROUTE_CONFIG.PAXG.scaleDenominator,
        GOLD_ROUTE_CONFIG.PAXG.rootUnit,
      ]),
      childGold.interface.encodeFunctionData('setBridgeRoutePrecision', [
        GOLD_ROUTE_CONFIG.XAUT.tokenId,
        GOLD_ROUTE_CONFIG.XAUT.rootDecimals,
        GOLD_ROUTE_CONFIG.XAUT.goldDecimals,
        GOLD_ROUTE_CONFIG.XAUT.scaleNumerator,
        GOLD_ROUTE_CONFIG.XAUT.scaleDenominator,
        GOLD_ROUTE_CONFIG.XAUT.rootUnit,
      ]),
      childGold.interface.encodeFunctionData('setBridgeDepositor', [await childChainManager.getAddress()]),
      childGold.interface.encodeFunctionData('finalizeBridgeRoutePrecision'),
    ],
    'Configure GOLD bridge routes, set bridge depositor, and finalize route precision',
    governanceWallet,
    roughnetSigner,
  );
  const liveStakeHub = new ethers.Contract(STAKE_HUB_ADDRESS, liveStakeHubAbi, roughnetProvider);
  if (!skipStakeGoldCutover) {
    const currentStakeTokenB = await liveStakeHub.stakeTokenB();
    const currentLegacyStakeTokenB = await liveStakeHub.legacyStakeTokenB();

    if (currentStakeTokenB.toLowerCase() !== (await childGold.getAddress()).toLowerCase()) {
      if (currentStakeTokenB === ZERO_ADDRESS && currentLegacyStakeTokenB === ZERO_ADDRESS) {
      await governUpdateParam(
        roughnetProvider,
        'stakeTokenB',
        hexAddressBytes(await childGold.getAddress()),
        STAKE_HUB_ADDRESS,
        'Set live bridge GOLD token',
        governanceWallet,
        roughnetSigner,
      );
      } else if (currentLegacyStakeTokenB === ZERO_ADDRESS) {
        const activateTx = await liveStakeHub
          .connect(validatorWallet)
          .activateTokenBMigration(await childGold.getAddress(), await legacyGoldReserveVault.getAddress(), {
            gasLimit: 2_000_000,
          });
        await waitForMined(activateTx);
      } else {
        throw new Error(
          `StakeHub is already mid/post migration: active ${currentStakeTokenB}, legacy ${currentLegacyStakeTokenB}, new ${(await childGold.getAddress())}`,
        );
      }
    }
  }
  await governUpdateParam(
    roughnetProvider,
    'childChainManager',
    hexAddressBytes(await childChainManager.getAddress()),
    NATIVE_GILT_BRIDGE_ADDRESS,
    'Set native GILT bridge child manager',
    governanceWallet,
    roughnetSigner,
  );

  const minNativeBridgeLiquidity = ethers.parseEther(process.env.NATIVE_GILT_BRIDGE_MIN_LIQUIDITY || '1000');
  const nativeBridgeBalance = await roughnetProvider.getBalance(NATIVE_GILT_BRIDGE_ADDRESS);
  if (nativeBridgeBalance < minNativeBridgeLiquidity) {
    const topUpAmount = minNativeBridgeLiquidity - nativeBridgeBalance;
    console.log(`Funding native GILT bridge liquidity with ${ethers.formatEther(topUpAmount)} GILT`);
    const topUpTx = await roughnetSigner.sendTransaction({
      to: NATIVE_GILT_BRIDGE_ADDRESS,
      value: topUpAmount,
      gasLimit: 210000,
    });
    await waitForMined(topUpTx);
  }

  if (!skipStakeGoldCutover) {
    const stakeHub = new ethers.Contract(STAKE_HUB_ADDRESS, stakeHubAbi, roughnetProvider);
    const liveGoldAddress = await stakeHub.stakeTokenB();
    if (liveGoldAddress.toLowerCase() !== (await childGold.getAddress()).toLowerCase()) {
      throw new Error(`StakeHub GOLD mismatch: ${liveGoldAddress} != ${await childGold.getAddress()}`);
    }
  }

  giltconsensusGenesis.app_state.gilt.spans = giltconsensusGenesis.app_state.gilt.spans.map((span) => ({
    ...span,
    gilt_chain_id: childChainId,
  }));
  giltconsensusGenesis.app_state.chainmanager.params.chain_params = {
    ...giltconsensusGenesis.app_state.chainmanager.params.chain_params,
    gilt_chain_id: childChainId,
    giltconsensus_chain_id: giltconsensusChainId,
    pol_token_address: await staking.polToken.getAddress(),
    staking_manager_address: await staking.stakeManager.getAddress(),
    slash_manager_address: ZERO_ADDRESS,
    root_chain_address: await rootChain.getAddress(),
    staking_info_address: await staking.stakingInfo.getAddress(),
    state_sender_address: await stateSender.getAddress(),
    state_receiver_address: STATE_RECEIVER_ADDRESS,
    validator_set_address: '0x0000000000000000000000000000000000001000',
  };
  giltconsensusGenesis.app_state.chainmanager.params.main_chain_tx_confirmations = String(
    DEFAULT_MAIN_CHAIN_TX_CONFIRMATIONS,
  );
  giltconsensusGenesis.app_state.chainmanager.params.gilt_chain_tx_confirmations = String(
    DEFAULT_GILT_CHAIN_TX_CONFIRMATIONS,
  );
  fs.writeFileSync(giltconsensusGenesisPath, `${JSON.stringify(giltconsensusGenesis, null, 2)}\n`);

  saveAddressBook(addressBook);
  console.log(`Saved address book to ${ADDRESS_BOOK_PATH}`);
  console.log(JSON.stringify(addressBook, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
