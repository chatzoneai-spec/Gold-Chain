const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const RLP = require("rlp");
const web3 = require("web3");

const GENESIS_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PROFILE = "testnet";
const SUPPORTED_PROFILES = new Set(["testnet", "mainnet"]);

function resolveFromRoot(...parts) {
  return path.resolve(GENESIS_ROOT, ...parts);
}

function parseProfileArg(argv = process.argv.slice(2)) {
  let profile = process.env.LAUNCH_PROFILE || DEFAULT_PROFILE;
  let configPath = null;
  let outputPath = null;
  let reportPath = null;
  let json = false;

  function readFlagValue(index, flag) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--profile") {
      profile = readFlagValue(i, arg);
      i += 1;
    } else if (arg === "--config") {
      configPath = readFlagValue(i, arg);
      i += 1;
    } else if (arg === "--output") {
      outputPath = readFlagValue(i, arg);
      i += 1;
    } else if (arg === "--report") {
      reportPath = readFlagValue(i, arg);
      i += 1;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { profile, configPath, outputPath, reportPath, json };
}

function loadLaunchConfig(options = {}) {
  const profile = options.profile || DEFAULT_PROFILE;
  const configPath = options.configPath
    ? path.resolve(GENESIS_ROOT, options.configPath)
    : resolveFromRoot("launch-config", `${profile}.json`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return { config, configPath };
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function isAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isZeroAddress(value) {
  return isAddress(value) && /^0x0{40}$/i.test(value);
}

function isHex(value, bytes) {
  const expected = bytes == null ? "+" : `{${bytes * 2}}`;
  return typeof value === "string" && new RegExp(`^0x[0-9a-fA-F]${expected}$`).test(value);
}

function parsePositiveBigInt(value, label) {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error();
    }
    return parsed;
  } catch (_) {
    throw new Error(`${label} must be a positive integer string`);
  }
}

function assertPositiveInteger(value, label, errors) {
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer`, errors);
}

function validateRootRelativePath(value, label, errors, options = {}) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} is required`);
    return;
  }
  if (path.isAbsolute(value)) {
    errors.push(`${label} must be relative to gilt-genesis-contract`);
    return;
  }

  const resolved = resolveFromRoot(value);
  const relative = path.relative(GENESIS_ROOT, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    errors.push(`${label} must stay inside gilt-genesis-contract`);
    return;
  }
  if (options.mustExist && !fs.existsSync(resolved)) {
    errors.push(`${label} does not exist: ${value}`);
  }
}

function validatePositiveBigInt(value, label, errors) {
  try {
    parsePositiveBigInt(value, label);
  } catch (error) {
    errors.push(error.message);
  }
}

function parseVotingPower(value, label = "votingPower") {
  let parsed;
  if (typeof value === "string" && value.startsWith("0x")) {
    if (!/^0x[0-9a-fA-F]+$/.test(value)) {
      throw new Error(`${label} is invalid hex`);
    }
    parsed = BigInt(value);
  } else {
    parsed = parsePositiveBigInt(value, label);
  }

  if (parsed <= 0n) {
    throw new Error(`${label} must be positive`);
  }
  if (parsed > ((1n << 64n) - 1n)) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function canonicalVotingPowerHex(value, label) {
  return `0x${parseVotingPower(value, label).toString(16).padStart(16, "0")}`;
}

function validateLaunchConfig(config) {
  const errors = [];
  assert(typeof config.profile === "string" && config.profile.length > 0, "profile is required", errors);
  assert(SUPPORTED_PROFILES.has(config.profile), "profile must be testnet or mainnet", errors);
  assert(Number.isInteger(config.chainId) && config.chainId > 0, "chainId must be a positive integer", errors);
  assert(typeof config.sourceChainId === "string" && config.sourceChainId.length > 0, "sourceChainId is required", errors);
  validateRootRelativePath(config.genesisTemplate, "genesisTemplate", errors, { mustExist: true });
  validateRootRelativePath(config.genesisOutput, "genesisOutput", errors);
  validateRootRelativePath(config.reportOutput, "reportOutput", errors);

  const allocations = config.gilt?.allocations || [];
  assert(Array.isArray(allocations) && allocations.length > 0, "at least one initial GILT allocation is required", errors);
  const allocationAddresses = new Set();
  for (const [index, allocation] of allocations.entries()) {
    assert(isAddress(allocation.address), `gilt.allocations[${index}].address must be an address`, errors);
    const normalized = String(allocation.address || "").toLowerCase();
    assert(!allocationAddresses.has(normalized), `duplicate GILT allocation address: ${allocation.address}`, errors);
    allocationAddresses.add(normalized);
    validatePositiveBigInt(allocation.balanceWei, `gilt.allocations[${index}].balanceWei`, errors);
  }

  const inflation = config.gilt?.inflation || {};
  assert(inflation.enabled === true, "GILT inflation must be enabled from launch", errors);
  assert(inflation.starts === "block_1", "GILT inflation must start from block_1", errors);
  assert(inflation.rewardSource === "GILT_INFLATION_AND_FEES", "GILT reward source must be GILT_INFLATION_AND_FEES", errors);
  assert(Number.isInteger(inflation.initialRateBps) && inflation.initialRateBps > 0, "inflation initialRateBps is required", errors);
  assert(Number.isInteger(inflation.minimumRateBps) && inflation.minimumRateBps > 0, "inflation minimumRateBps is required", errors);
  assert(inflation.initialRateBps >= inflation.minimumRateBps, "inflation initial rate must be >= minimum rate", errors);
  assert(Number.isInteger(inflation.decayBpsPerYear) && inflation.decayBpsPerYear >= 0, "inflation decayBpsPerYear is required", errors);
  validatePositiveBigInt(inflation.baseSupplyWei, "gilt.inflation.baseSupplyWei", errors);

  const validators = config.validators || [];
  assert(Array.isArray(validators) && validators.length > 0, "at least one validator is required", errors);
  const consensusAddresses = new Set();
  const blsKeys = new Set();
  for (const [index, validator] of validators.entries()) {
    assert(isAddress(validator.consensusAddress), `validators[${index}].consensusAddress must be an address`, errors);
    assert(isAddress(validator.feeAddress), `validators[${index}].feeAddress must be an address`, errors);
    assert(isAddress(validator.giltFeeAddress), `validators[${index}].giltFeeAddress must be an address`, errors);
    assert(!isZeroAddress(validator.consensusAddress), `validators[${index}].consensusAddress must not be zero`, errors);
    assert(!isZeroAddress(validator.feeAddress), `validators[${index}].feeAddress must not be zero`, errors);
    assert(!isZeroAddress(validator.giltFeeAddress), `validators[${index}].giltFeeAddress must not be zero`, errors);
    assert(typeof validator.blsPublicKey === "string", `validators[${index}].blsPublicKey vote address is required`, errors);
    assert(isHex(validator.blsPublicKey, 48), `validators[${index}].blsPublicKey must be 48 bytes`, errors);
    assert(!/^0x0{96}$/i.test(String(validator.blsPublicKey || "")), `validators[${index}].blsPublicKey vote address must not be zero`, errors);
    const consensus = String(validator.consensusAddress || "").toLowerCase();
    const bls = String(validator.blsPublicKey || "").toLowerCase();
    assert(!consensusAddresses.has(consensus), `duplicate validator consensus address: ${validator.consensusAddress}`, errors);
    assert(!blsKeys.has(bls), `duplicate validator BLS public key: ${validator.blsPublicKey}`, errors);
    consensusAddresses.add(consensus);
    blsKeys.add(bls);
    try {
      parseVotingPower(validator.votingPower, `validators[${index}].votingPower`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  const staking = config.staking || {};
  assert(staking.giltStakingEnabled === true, "GILT staking must be enabled", errors);
  assert(staking.goldStakingEnabled === true, "GOLD staking must be enabled from day one", errors);
  assert(staking.goldRewardSource === "GILT_PLUS_FEES", "GOLD staking rewards must be GILT_PLUS_FEES", errors);
  assert(Number.isInteger(staking.goldRewardSplitBps) && staking.goldRewardSplitBps > 0, "GOLD reward split must be non-zero", errors);
  assert(staking.ratioEnabledAtLaunch === false, "ratio enforcement must be off at launch", errors);
  assert(staking.validatorAllowlistEnabled === true, "validator allowlist mode must be enabled at launch", errors);
  if (staking.validatorAllowlist !== undefined) {
    assert(Array.isArray(staking.validatorAllowlist) && staking.validatorAllowlist.length > 0, "validatorAllowlist must be a non-empty address list when provided", errors);
    for (const [index, account] of staking.validatorAllowlist.entries()) {
      assert(isAddress(account), `staking.validatorAllowlist[${index}] must be an address`, errors);
    }
  }
  assertPositiveInteger(staking.transferGasLimit, "transferGasLimit", errors);
  assertPositiveInteger(staking.unbondPeriodSeconds, "unbondPeriodSeconds", errors);
  assertPositiveInteger(staking.redelegateFeeRate, "redelegateFeeRate", errors);
  assertPositiveInteger(staking.downtimeJailTimeSeconds, "downtimeJailTimeSeconds", errors);
  assertPositiveInteger(staking.felonyJailTimeSeconds, "felonyJailTimeSeconds", errors);
  assertPositiveInteger(staking.maxFelonyBetweenBreatheBlock, "maxFelonyBetweenBreatheBlock", errors);
  assertPositiveInteger(staking.stakeWeightA, "stakeWeightA", errors);
  assertPositiveInteger(staking.stakeWeightB, "stakeWeightB", errors);
  assertPositiveInteger(staking.maxBPowerRatioBps, "maxBPowerRatioBps", errors);
  assertPositiveInteger(staking.minBtoARatioBps, "minBtoARatioBps", errors);
  assertPositiveInteger(staking.maxElectedValidators, "maxElectedValidators", errors);
  assert(validators.length <= staking.maxElectedValidators, "validator count must not exceed maxElectedValidators", errors);
  assert(isAddress(staking.slashReserveVault), "slashReserveVault must be an address", errors);
  validatePositiveBigInt(staking.minSelfDelegationGILTWei, "minSelfDelegationGILTWei", errors);
  validatePositiveBigInt(staking.minDelegationGILTChangeWei, "minDelegationGILTChangeWei", errors);
  validatePositiveBigInt(staking.downtimeSlashAmountWei, "downtimeSlashAmountWei", errors);
  validatePositiveBigInt(staking.felonySlashAmountWei, "felonySlashAmountWei", errors);
  validatePositiveBigInt(staking.pendingSystemRewardAutoRetryCapWei, "pendingSystemRewardAutoRetryCapWei", errors);

  const gold = config.gold || {};
  assert(isAddress(gold.address), "GOLD contract address must be set", errors);
  assert(isAddress(gold.admin), "GOLD admin must be an address", errors);
  assert(isAddress(gold.bridgeDepositor), "GOLD bridge depositor must be an address", errors);
  assert(typeof gold.uri === "string" && gold.uri.length > 0, "GOLD URI is required", errors);
  assert(typeof gold.name === "string" && gold.name.length > 0, "GOLD name is required", errors);
  assert(typeof gold.symbol === "string" && gold.symbol.length > 0, "GOLD symbol is required", errors);
  validatePositiveBigInt(gold.bridgeScaleNumerator, "gold.bridgeScaleNumerator", errors);
  validatePositiveBigInt(gold.bridgeScaleDenominator, "gold.bridgeScaleDenominator", errors);
  assert(gold.type === "ERC1155", "GOLD must be ERC1155", errors);
  assert(gold.stakingEnabledFromDayOne === true, "GOLD staking must be on from day one", errors);
  assert(gold.emitsGoldRewards === false, "GOLD must not emit/mint GOLD rewards", errors);
  assert(gold.routePrecisionFinalizedAtLaunch === true, "GOLD route precision must be finalized at launch", errors);
  assert(gold.bridgeDepositsClosedAtLaunch === false, "GOLD bridge deposits must be open at launch", errors);
  assert(gold.migrationMintingEnabledAtLaunch === false, "GOLD migration minting must be disabled at launch", errors);
  assert(gold.migrationMintingFinalizedAtLaunch === false, "GOLD migration minting finalization must be off at launch", errors);
  assert(gold.tokenIds?.paxgBacked === 1, "PAXG-backed GOLD token ID must be 1", errors);
  assert(gold.tokenIds?.xautBacked === 2, "XAUT-backed GOLD token ID must be 2", errors);
  const routeChecks = [
    ["paxg", 1, 18, 18],
    ["xaut", 2, 6, 18],
  ];
  for (const [routeName, tokenId, rootDecimals, goldDecimals] of routeChecks) {
    const route = gold.routes?.[routeName] || {};
    assert(route.tokenId === tokenId, `${routeName.toUpperCase()} GOLD route token ID must be ${tokenId}`, errors);
    assert(route.rootDecimals === rootDecimals, `${routeName.toUpperCase()} GOLD route root decimals must be ${rootDecimals}`, errors);
    assert(route.goldDecimals === goldDecimals, `${routeName.toUpperCase()} GOLD route gold decimals must be ${goldDecimals}`, errors);
    validatePositiveBigInt(route.scaleNumerator, `${routeName}.scaleNumerator`, errors);
    validatePositiveBigInt(route.scaleDenominator, `${routeName}.scaleDenominator`, errors);
    validatePositiveBigInt(route.rootUnit, `${routeName}.rootUnit`, errors);
  }

  const migration = config.migration || {};
  assert(migration.launchState === "OFF", "migration must be off at launch", errors);
  assert(migration.governanceActivatesLater === true, "migration must be governance-activated later", errors);

  const governance = config.governance || {};
  assert(isAddress(governance.stakeHubProtector), "stakeHubProtector must be an address", errors);
  assert(isAddress(governance.governorProtector), "governorProtector must be an address", errors);

  if (errors.length > 0) {
    const error = new Error(`launch config validation failed:\n- ${errors.join("\n- ")}`);
    error.errors = errors;
    throw error;
  }
}

function initHoldersForGenesis(config) {
  return config.gilt.allocations.map((allocation) => ({
    address: allocation.address,
    balance: BigInt(allocation.balanceWei).toString(16),
  }));
}

function validatorExtraData(config) {
  const extraVanity = Buffer.alloc(32);
  const validatorBytes = Buffer.concat(
    config.validators.map((validator) => Buffer.from(web3.utils.hexToBytes(validator.consensusAddress))),
  );
  const extraSeal = Buffer.alloc(65);
  return Buffer.concat([extraVanity, validatorBytes, extraSeal]);
}

function validatorSetBytes(config) {
  const encodedValidators = config.validators.map((validator) => [
    validator.consensusAddress,
    validator.giltFeeAddress,
    validator.feeAddress,
    canonicalVotingPowerHex(validator.votingPower, "validator.votingPower"),
    validator.blsPublicKey,
  ]);
  return web3.utils.bytesToHex(RLP.encode([0x00, encodedValidators]));
}

module.exports = {
  GENESIS_ROOT,
  initHoldersForGenesis,
  loadLaunchConfig,
  parseProfileArg,
  parseVotingPower,
  resolveFromRoot,
  sha256Hex,
  stableJson,
  validateLaunchConfig,
  validatorExtraData,
  validatorSetBytes,
};
