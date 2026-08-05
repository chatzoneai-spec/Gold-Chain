const fs = require("fs");
const path = require("path");

const { GENESIS_ROOT, resolveFromRoot, sha256Hex, stableJson } = require("./launch-config");
const { verifyGiltValidatorSetStorageLayout } = require("./gilt-validator-set-storage-layout");
const { assertNoActiveCoreOldBscBridgeMachinery } = require("./launch-gates");
const { verifyStakeHubStorageLayout } = require("./stakehub-storage-layout");

const PREDEPLOY_CLASSIFICATIONS = Object.freeze({
  ACTIVE_CORE: "ACTIVE_CORE",
  RESERVED_INERT: "RESERVED_INERT",
});

const RESERVED_PREDEPLOY_ARTIFACT = "ReservedPredeploy.sol/ReservedPredeploy.json";
const RESERVED_PREDEPLOY_MAX_RUNTIME_BYTES = 512;

const SYSTEM_PREDEPLOYS = [
  {
    key: "validatorContract",
    contract: "GiltValidatorSet",
    address: "0x0000000000000000000000000000000000001000",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "GiltValidatorSet.sol/GiltValidatorSet.json",
  },
  {
    key: "slashContract",
    contract: "SlashIndicator",
    address: "0x0000000000000000000000000000000000001001",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "SlashIndicator.sol/SlashIndicator.json",
  },
  {
    key: "systemRewardContract",
    contract: "SystemReward",
    address: "0x0000000000000000000000000000000000001002",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "SystemReward.sol/SystemReward.json",
  },
  {
    key: "tendermintLightClient",
    contract: "TendermintLightClient",
    address: "0x0000000000000000000000000000000000001003",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "tokenHub",
    contract: "TokenHub",
    address: "0x0000000000000000000000000000000000001004",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "relayerIncentivize",
    contract: "RelayerIncentivize",
    address: "0x0000000000000000000000000000000000001005",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "relayerHub",
    contract: "RelayerHub",
    address: "0x0000000000000000000000000000000000001006",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "govHub",
    contract: "GovHub",
    address: "0x0000000000000000000000000000000000001007",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "GovHub.sol/GovHub.json",
  },
  {
    key: "tokenManager",
    contract: "TokenManager",
    address: "0x0000000000000000000000000000000000001008",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "crossChain",
    contract: "CrossChain",
    address: "0x0000000000000000000000000000000000002000",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "staking",
    contract: "Staking",
    address: "0x0000000000000000000000000000000000002001",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "stakeHub",
    contract: "StakeHub",
    address: "0x0000000000000000000000000000000000002002",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHub.sol/StakeHub.json",
  },
  {
    key: "stakeHubValidatorsModule",
    contract: "StakeHubValidators",
    address: "0x0000000000000000000000000000000000002010",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubValidators.sol/StakeHubValidators.json",
  },
  {
    key: "stakeHubGiltStakingModule",
    contract: "StakeHubGiltStaking",
    address: "0x0000000000000000000000000000000000002011",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubGiltStaking.sol/StakeHubGiltStaking.json",
  },
  {
    key: "stakeHubGoldStakingModule",
    contract: "StakeHubGoldStaking",
    address: "0x0000000000000000000000000000000000002012",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubGoldStaking.sol/StakeHubGoldStaking.json",
  },
  {
    key: "stakeHubRewardsModule",
    contract: "StakeHubRewards",
    address: "0x0000000000000000000000000000000000002013",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubRewards.sol/StakeHubRewards.json",
  },
  {
    key: "stakeHubInflationModule",
    contract: "StakeHubInflation",
    address: "0x0000000000000000000000000000000000002014",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubInflation.sol/StakeHubInflation.json",
  },
  {
    key: "stakeHubSlashingModule",
    contract: "StakeHubSlashing",
    address: "0x0000000000000000000000000000000000002015",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubSlashing.sol/StakeHubSlashing.json",
  },
  {
    key: "stakeHubMigrationModule",
    contract: "StakeHubMigration",
    address: "0x0000000000000000000000000000000000002016",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubMigration.sol/StakeHubMigration.json",
  },
  {
    key: "stakeHubParamsModule",
    contract: "StakeHubParams",
    address: "0x0000000000000000000000000000000000002017",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubParams.sol/StakeHubParams.json",
  },
  {
    key: "stakeHubValidatorViewsModule",
    contract: "StakeHubValidatorViews",
    address: "0x0000000000000000000000000000000000002018",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeHubValidatorViews.sol/StakeHubValidatorViews.json",
  },
  {
    key: "stakeCredit",
    contract: "StakeCredit",
    address: "0x0000000000000000000000000000000000002003",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StakeCredit.sol/StakeCredit.json",
  },
  {
    key: "governor",
    contract: "GiltGovernor",
    address: "0x0000000000000000000000000000000000002004",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "GiltGovernor.sol/GiltGovernor.json",
  },
  {
    key: "govToken",
    contract: "GovToken",
    address: "0x0000000000000000000000000000000000002005",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "GovToken.sol/GovToken.json",
  },
  {
    key: "timelock",
    contract: "GiltTimelock",
    address: "0x0000000000000000000000000000000000002006",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "GiltTimelock.sol/GiltTimelock.json",
  },
  {
    key: "tokenRecoverPortal",
    contract: "TokenRecoverPortal",
    address: "0x0000000000000000000000000000000000003000",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "stateReceiver",
    contract: "StateReceiver",
    address: "0x0000000000000000000000000000000000003001",
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "StateReceiver.sol/StateReceiver.json",
  },
  {
    key: "nativeGiltBridge",
    contract: "NativeGiltBridge",
    address: "0x0000000000000000000000000000000000003002",
    classification: PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT,
    artifactPath: RESERVED_PREDEPLOY_ARTIFACT,
  },
  {
    key: "physicalGold1155",
    contract: "PhysicalGold1155",
    address: null,
    classification: PREDEPLOY_CLASSIFICATIONS.ACTIVE_CORE,
    artifactPath: "PhysicalGold1155.sol/PhysicalGold1155.json",
    patchedLaunchImmutables: true,
  },
];

const SYSTEM_ARTIFACTS = SYSTEM_PREDEPLOYS.map((predeploy) => [predeploy.key, predeploy.artifactPath]);

assertNoActiveCoreOldBscBridgeMachinery(SYSTEM_PREDEPLOYS, "system predeploy registry");

const PHYSICAL_GOLD_STORAGE_LAYOUT_MANIFEST = {
  _uri: { slot: 2 },
  _roles: { slot: 4 },
  name: { slot: 5 },
  symbol: { slot: 6 },
  bridgeDepositor: { slot: 7 },
  migrationController: { slot: 8, offset: 0 },
  migrationMintingEnabled: { slot: 8, offset: 20 },
  migrationMintingFinalized: { slot: 8, offset: 21 },
  bridgeRoutePrecisionFinalized: { slot: 8, offset: 22 },
  bridgeDepositsClosed: { slot: 8, offset: 23 },
  bridgeRoutePrecision: { slot: 9 },
};

function relativeToRoot(filePath, root = GENESIS_ROOT) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function strip0x(value) {
  return String(value).replace(/^0x/i, "");
}

function runtimeBytecodeBytes(bytecode) {
  const raw = strip0x(bytecode);
  if (raw.length % 2 !== 0) {
    throw new Error("runtime bytecode has odd hex length");
  }
  return raw.length / 2;
}

function parseArtifactMetadata(artifact, artifactPath) {
  const raw = artifact.metadata || artifact.rawMetadata;
  if (!raw) {
    throw new Error(`artifact has no compiler metadata: ${artifactPath}`);
  }
  const metadata = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!metadata?.sources || Object.keys(metadata.sources).length === 0) {
    throw new Error(`artifact has no source metadata: ${artifactPath}`);
  }
  return metadata;
}

function assertArtifactFresh(contractName, artifactPath, artifact, options = {}) {
  const root = options.root || GENESIS_ROOT;
  const artifactStat = fs.statSync(artifactPath);
  const metadata = parseArtifactMetadata(artifact, artifactPath);
  let latestSource = null;

  for (const sourceName of Object.keys(metadata.sources)) {
    const sourcePath = path.resolve(root, sourceName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`artifact source missing for ${contractName}: ${relativeToRoot(sourcePath, root)}`);
    }
    const sourceStat = fs.statSync(sourcePath);
    if (!latestSource || sourceStat.mtimeMs > latestSource.mtimeMs) {
      latestSource = {
        path: sourcePath,
        mtimeMs: sourceStat.mtimeMs,
      };
    }
  }

  if (latestSource && latestSource.mtimeMs > artifactStat.mtimeMs) {
    throw new Error(
      `stale system contract artifact for ${contractName}: ${relativeToRoot(artifactPath, root)} is older than ${relativeToRoot(latestSource.path, root)}. Run forge build before launch reporting.`,
    );
  }

  return {
    artifactMtimeMs: artifactStat.mtimeMs,
    artifactPath: relativeToRoot(artifactPath, root),
    sourceLatestMtimeMs: latestSource ? latestSource.mtimeMs : null,
    sourceLatestPath: latestSource ? relativeToRoot(latestSource.path, root) : null,
  };
}

function assertRuntimeBytecodeSize(contractName, bytecode, classification, artifactPath) {
  const bytes = runtimeBytecodeBytes(bytecode);
  if (bytes <= 0) {
    throw new Error(`empty runtime bytecode for ${contractName}: ${artifactPath}`);
  }
  if (classification === PREDEPLOY_CLASSIFICATIONS.RESERVED_INERT && bytes > RESERVED_PREDEPLOY_MAX_RUNTIME_BYTES) {
    throw new Error(
      `reserved inert predeploy ${contractName} runtime is ${bytes} bytes, max ${RESERVED_PREDEPLOY_MAX_RUNTIME_BYTES}: ${artifactPath}`,
    );
  }
  return bytes;
}

function verifyPhysicalGoldStorageLayout(storageLayout) {
  const entries = storageLayout?.storage;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      "PhysicalGold1155 artifact is missing storageLayout.storage. Run forge build with extra_output = [\"storageLayout\"] before launch generation.",
    );
  }

  const byLabel = new Map();
  for (const entry of entries) {
    if (!byLabel.has(entry.label)) {
      byLabel.set(entry.label, entry);
    }
  }

  const checked = [];
  for (const [label, expected] of Object.entries(PHYSICAL_GOLD_STORAGE_LAYOUT_MANIFEST)) {
    const entry = byLabel.get(label);
    if (!entry) {
      throw new Error(`PhysicalGold1155 storage layout missing required launch field: ${label}`);
    }
    const actualSlot = Number(entry.slot);
    if (actualSlot !== expected.slot) {
      throw new Error(
        `PhysicalGold1155 storage slot mismatch for ${label}: expected slot ${expected.slot}, artifact has slot ${entry.slot}. Update launch storage deliberately before generating genesis.`,
      );
    }
    if (expected.offset != null && Number(entry.offset) !== expected.offset) {
      throw new Error(
        `PhysicalGold1155 storage offset mismatch for ${label}: expected offset ${expected.offset}, artifact has offset ${entry.offset}. Update launch storage deliberately before generating genesis.`,
      );
    }
    checked.push({ label, slot: actualSlot, offset: Number(entry.offset || 0) });
  }

  return checked;
}

function readArtifact(relativePath) {
  const artifactPath = resolveFromRoot("out", relativePath);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`missing system contract artifact: ${artifactPath}`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const deployedBytecode = artifact?.deployedBytecode?.object;
  if (!deployedBytecode || deployedBytecode === "0x") {
    throw new Error(`artifact has no deployed bytecode: ${artifactPath}`);
  }
  const contractName = path.basename(relativePath, ".json");
  const freshness = assertArtifactFresh(contractName, artifactPath, artifact);
  return {
    artifactPath,
    artifact,
    deployedBytecode,
    immutableReferences: artifact?.deployedBytecode?.immutableReferences || {},
    freshness,
    sha256: sha256Hex(deployedBytecode),
  };
}

function readSystemArtifacts() {
  const data = {};
  const hashes = {};
  const artifacts = [];
  const rawArtifacts = {};
  const predeploys = [];
  const artifactCache = new Map();

  for (const predeploy of SYSTEM_PREDEPLOYS) {
    const { key, artifactPath: relativePath } = predeploy;
    let artifact = artifactCache.get(relativePath);
    if (!artifact) {
      artifact = readArtifact(relativePath);
      artifactCache.set(relativePath, artifact);
    }
    const storageLayoutCheck =
      key === "stakeHub"
        ? verifyStakeHubStorageLayout(artifact.artifact.storageLayout)
        : key === "physicalGold1155"
          ? verifyPhysicalGoldStorageLayout(artifact.artifact.storageLayout)
          : key === "validatorContract"
            ? verifyGiltValidatorSetStorageLayout(artifact.artifact.storageLayout)
            : null;
    const bytecodeBytes = assertRuntimeBytecodeSize(
      predeploy.contract,
      artifact.deployedBytecode,
      predeploy.classification,
      artifact.artifactPath,
    );
    const storageLayoutHash = storageLayoutCheck ? sha256Hex(stableJson(storageLayoutCheck)) : null;
    data[key] = artifact.deployedBytecode;
    rawArtifacts[key] = artifact;
    hashes[key] = {
      path: path.relative(GENESIS_ROOT, artifact.artifactPath).replace(/\\/g, "/"),
      sha256: artifact.sha256,
      classification: predeploy.classification,
      address: predeploy.address,
      runtimeBytecodeBytes: bytecodeBytes,
      storageLayoutHash,
      patchedLaunchImmutables: Boolean(predeploy.patchedLaunchImmutables),
    };
    const predeploySummary = {
      name: key,
      contract: predeploy.contract,
      address: predeploy.address,
      classification: predeploy.classification,
      ...artifact.freshness,
      sha256: artifact.sha256,
      runtimeBytecodeBytes: bytecodeBytes,
      storageLayoutCheck,
      storageLayoutHash,
      patchedLaunchImmutables: Boolean(predeploy.patchedLaunchImmutables),
    };
    artifacts.push(predeploySummary);
    predeploys.push({
      ...predeploySummary,
      path: hashes[key].path,
    });
  }
  return { data, hashes, artifacts, predeploys, rawArtifacts };
}

module.exports = {
  PREDEPLOY_CLASSIFICATIONS,
  SYSTEM_ARTIFACTS,
  SYSTEM_PREDEPLOYS,
  assertArtifactFresh,
  runtimeBytecodeBytes,
  readSystemArtifacts,
};
