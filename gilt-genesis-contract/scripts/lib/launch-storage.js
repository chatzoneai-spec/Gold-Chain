const web3 = require("web3");

const { parseVotingPower, sha256Hex, stableJson } = require("./launch-config");
const { GILT_VALIDATOR_SET_SLOTS } = require("./gilt-validator-set-storage-layout");
const { STAKE_HUB_SLOTS } = require("./stakehub-storage-layout");

const VALIDATOR_SET_ADDRESS = "0x0000000000000000000000000000000000001000";
const STAKE_HUB_ADDRESS = "0x0000000000000000000000000000000000002002";
const DEFAULT_GOLD_ADDRESS = "0x0000000000000000000000000000000000003003";

const VALIDATOR_STRUCT_SIZE = 4n;
const VALIDATOR_EXTRA_STRUCT_SIZE = 22n;

const PHYSICAL_GOLD_SLOTS = {
  uri: 2,
  roles: 4,
  name: 5,
  symbol: 6,
  bridgeDepositor: 7,
  migrationAndBridgeFlags: 8,
  bridgeRoutePrecision: 9,
};

function strip0x(value) {
  return String(value).replace(/^0x/i, "");
}

function hex32(value) {
  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new Error(`cannot encode negative storage value: ${value}`);
  }
  const hex = parsed.toString(16);
  if (hex.length > 64) {
    throw new Error(`storage value exceeds 32 bytes: ${value}`);
  }
  return `0x${hex.padStart(64, "0")}`;
}

function slotKey(slot) {
  return hex32(slot);
}

function addressBigInt(address) {
  const raw = strip0x(address);
  if (!/^[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(`invalid address for genesis storage: ${address}`);
  }
  return BigInt(`0x${raw}`);
}

function encodeAddress(address) {
  return hex32(addressBigInt(address));
}

function encodeBool(value) {
  return hex32(value ? 1n : 0n);
}

function encodeShortString(value, label) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 31) {
    throw new Error(`${label} must fit in one genesis storage slot`);
  }
  return `0x${bytes.toString("hex").padEnd(62, "0")}${(bytes.length * 2).toString(16).padStart(2, "0")}`;
}

function mappingSlot(key, slot) {
  const keyHex = typeof key === "string" && key.startsWith("0x") ? strip0x(hex32(BigInt(key))) : strip0x(hex32(key));
  return web3.utils.keccak256(`0x${keyHex}${strip0x(slotKey(slot))}`);
}

function addressMappingSlot(address, slot) {
  return web3.utils.keccak256(`0x${strip0x(encodeAddress(address))}${strip0x(slotKey(slot))}`);
}

function routeSlotValue(route) {
  return hex32(1n + (BigInt(route.rootDecimals) << 8n) + (BigInt(route.goldDecimals) << 16n));
}

function setStorage(storage, slot, value) {
  storage[slotKey(slot)] = value;
}

function setMappingStorage(storage, baseSlot, offset, value) {
  storage[hex32(BigInt(baseSlot) + BigInt(offset))] = value;
}

function dynamicArrayDataSlot(slot) {
  return BigInt(web3.utils.keccak256(slotKey(slot)));
}

function dynamicArrayElementSlot(slot, index, elementSize = 1n) {
  return dynamicArrayDataSlot(slot) + BigInt(index) * BigInt(elementSize);
}

function setDynamicArrayLength(storage, slot, length) {
  setStorage(storage, slot, hex32(length));
}

function setDynamicBytes(storage, slot, value) {
  const raw = strip0x(value);
  if (raw.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(raw)) {
    throw new Error(`invalid dynamic bytes value: ${value}`);
  }

  const byteLength = raw.length / 2;
  if (byteLength < 32) {
    storage[hex32(slot)] = `0x${raw.padEnd(62, "0")}${(byteLength * 2).toString(16).padStart(2, "0")}`;
    return;
  }

  storage[hex32(slot)] = hex32(BigInt(byteLength * 2 + 1));
  const dataSlot = BigInt(web3.utils.keccak256(hex32(slot)));
  for (let offset = 0; offset < raw.length; offset += 64) {
    storage[hex32(dataSlot + BigInt(offset / 64))] = `0x${raw.slice(offset, offset + 64).padEnd(64, "0")}`;
  }
}

function validatorVotingPower(value, index) {
  return parseVotingPower(value, `validators[${index}].votingPower`);
}

function packValidatorMeta(validator, index) {
  const bbcFeeAddress = addressBigInt(validator.feeAddress);
  const votingPower = validatorVotingPower(validator.votingPower, index);
  return hex32(bbcFeeAddress + (votingPower << 160n));
}

function normalizeStorageForHash(storage) {
  return Object.fromEntries(
    Object.entries(storage)
      .map(([key, value]) => [String(key).toLowerCase(), String(value).toLowerCase()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hashValidatorBootstrapStorage(storage) {
  const copy = { ...storage };
  delete copy[hex32(GILT_VALIDATOR_SET_SLOTS.validatorBootstrapHash)];
  return sha256Hex(stableJson(normalizeStorageForHash(copy)));
}

function buildGiltValidatorSetStorage(config) {
  const validators = config.validators || [];
  if (validators.length === 0) {
    throw new Error("at least one validator is required for GiltValidatorSet genesis storage");
  }

  const storage = {};
  const validatorSetSlot = GILT_VALIDATOR_SET_SLOTS.currentValidatorSet;
  const validatorExtraSetSlot = GILT_VALIDATOR_SET_SLOTS.validatorExtraSet;
  const previousVoteSetSlot = GILT_VALIDATOR_SET_SLOTS.previousVoteAddrFullSet;
  const currentVoteSetSlot = GILT_VALIDATOR_SET_SLOTS.currentVoteAddrFullSet;

  setDynamicArrayLength(storage, validatorSetSlot, validators.length);
  setDynamicArrayLength(storage, validatorExtraSetSlot, validators.length);
  setDynamicArrayLength(storage, previousVoteSetSlot, validators.length);
  setDynamicArrayLength(storage, currentVoteSetSlot, validators.length);

  for (const [index, validator] of validators.entries()) {
    const validatorBase = dynamicArrayElementSlot(validatorSetSlot, index, VALIDATOR_STRUCT_SIZE);
    setStorage(storage, validatorBase, encodeAddress(validator.consensusAddress));
    setStorage(storage, validatorBase + 1n, encodeAddress(validator.giltFeeAddress));
    setStorage(storage, validatorBase + 2n, packValidatorMeta(validator, index));
    setStorage(storage, validatorBase + 3n, hex32(0));

    storage[addressMappingSlot(validator.consensusAddress, GILT_VALIDATOR_SET_SLOTS.currentValidatorSetMap)] = hex32(
      index + 1,
    );

    const validatorExtraBase = dynamicArrayElementSlot(
      validatorExtraSetSlot,
      index,
      VALIDATOR_EXTRA_STRUCT_SIZE,
    );
    setDynamicBytes(storage, validatorExtraBase + 2n, validator.blsPublicKey);
    setDynamicBytes(storage, dynamicArrayElementSlot(previousVoteSetSlot, index), validator.blsPublicKey);
    setDynamicBytes(storage, dynamicArrayElementSlot(currentVoteSetSlot, index), validator.blsPublicKey);
  }

  setStorage(storage, GILT_VALIDATOR_SET_SLOTS.maxNumOfMaintaining, hex32(3));
  setStorage(storage, GILT_VALIDATOR_SET_SLOTS.maintainSlashScale, hex32(2));
  setStorage(storage, GILT_VALIDATOR_SET_SLOTS.maxNumOfCandidates, hex32(15));
  setStorage(storage, GILT_VALIDATOR_SET_SLOTS.turnLength, hex32(16));
  setStorage(
    storage,
    GILT_VALIDATOR_SET_SLOTS.validatorBootstrapHash,
    `0x${hashValidatorBootstrapStorage(storage)}`,
  );

  return storage;
}

function bridgeRoute(config, key, expectedTokenId) {
  const route = config.gold?.routes?.[key];
  if (!route) {
    throw new Error(`missing GOLD bridge route: ${key}`);
  }
  if (route.tokenId !== expectedTokenId) {
    throw new Error(`GOLD route ${key} must use token ID ${expectedTokenId}`);
  }
  return route;
}

function buildPhysicalGoldStorage(config) {
  const gold = config.gold;
  const storage = {};
  const bridgeDepositor = gold.bridgeDepositor;
  const admin = gold.admin || config.governance?.stakeHubProtector;
  const migrationController = gold.migrationController || "0x0000000000000000000000000000000000000000";

  setStorage(storage, PHYSICAL_GOLD_SLOTS.uri, encodeShortString(gold.uri, "gold.uri"));
  setStorage(storage, PHYSICAL_GOLD_SLOTS.name, encodeShortString(gold.name || "Physical Gold", "gold.name"));
  setStorage(storage, PHYSICAL_GOLD_SLOTS.symbol, encodeShortString(gold.symbol || "PGOLD", "gold.symbol"));
  setStorage(storage, PHYSICAL_GOLD_SLOTS.bridgeDepositor, encodeAddress(bridgeDepositor));

  let flags = addressBigInt(migrationController);
  if (gold.migrationMintingEnabledAtLaunch) flags += 1n << 160n;
  if (gold.migrationMintingFinalizedAtLaunch) flags += 1n << 168n;
  if (gold.routePrecisionFinalizedAtLaunch) flags += 1n << 176n;
  if (gold.bridgeDepositsClosedAtLaunch) flags += 1n << 184n;
  setStorage(storage, PHYSICAL_GOLD_SLOTS.migrationAndBridgeFlags, hex32(flags));

  const defaultAdminRole = hex32(0);
  const bridgeMinterRole = web3.utils.keccak256("BRIDGE_MINTER_ROLE");
  const defaultRoleSlot = mappingSlot(defaultAdminRole, PHYSICAL_GOLD_SLOTS.roles);
  const bridgeRoleSlot = mappingSlot(bridgeMinterRole, PHYSICAL_GOLD_SLOTS.roles);
  storage[addressMappingSlot(admin, defaultRoleSlot)] = encodeBool(true);
  storage[addressMappingSlot(bridgeDepositor, bridgeRoleSlot)] = encodeBool(true);

  const paxgRoute = bridgeRoute(config, "paxg", 1);
  const xautRoute = bridgeRoute(config, "xaut", 2);
  for (const route of [paxgRoute, xautRoute]) {
    const baseSlot = mappingSlot(route.tokenId, PHYSICAL_GOLD_SLOTS.bridgeRoutePrecision);
    setMappingStorage(storage, baseSlot, 0, routeSlotValue(route));
    setMappingStorage(storage, baseSlot, 1, hex32(route.scaleNumerator));
    setMappingStorage(storage, baseSlot, 2, hex32(route.scaleDenominator));
    setMappingStorage(storage, baseSlot, 3, hex32(route.rootUnit));
  }

  return storage;
}

function buildStakeHubStorage(config) {
  const staking = config.staking;
  const inflation = config.gilt.inflation;
  const gold = config.gold;
  const storage = {};
  const protector = config.governance.stakeHubProtector;

  setStorage(storage, STAKE_HUB_SLOTS.protectorAndInitializable, hex32(addressBigInt(protector) << 24n));
  setStorage(storage, STAKE_HUB_SLOTS.transferGasLimit, hex32(staking.transferGasLimit));
  setStorage(storage, STAKE_HUB_SLOTS.minSelfDelegationGILT, hex32(staking.minSelfDelegationGILTWei));
  setStorage(storage, STAKE_HUB_SLOTS.minDelegationGILTChange, hex32(staking.minDelegationGILTChangeWei));
  setStorage(storage, STAKE_HUB_SLOTS.maxElectedValidators, hex32(staking.maxElectedValidators));
  setStorage(storage, STAKE_HUB_SLOTS.unbondPeriod, hex32(staking.unbondPeriodSeconds));
  setStorage(storage, STAKE_HUB_SLOTS.redelegateFeeRate, hex32(staking.redelegateFeeRate));
  setStorage(storage, STAKE_HUB_SLOTS.downtimeSlashAmount, hex32(staking.downtimeSlashAmountWei));
  setStorage(storage, STAKE_HUB_SLOTS.felonySlashAmount, hex32(staking.felonySlashAmountWei));
  setStorage(storage, STAKE_HUB_SLOTS.downtimeJailTime, hex32(staking.downtimeJailTimeSeconds));
  setStorage(storage, STAKE_HUB_SLOTS.felonyJailTime, hex32(staking.felonyJailTimeSeconds));
  setStorage(storage, STAKE_HUB_SLOTS.maxFelonyBetweenBreatheBlock, hex32(staking.maxFelonyBetweenBreatheBlock));
  setStorage(storage, STAKE_HUB_SLOTS.stakeTokenB, encodeAddress(gold.address));
  setStorage(storage, STAKE_HUB_SLOTS.stakeWeightA, hex32(staking.stakeWeightA));
  setStorage(storage, STAKE_HUB_SLOTS.stakeWeightB, hex32(staking.stakeWeightB));
  setStorage(storage, STAKE_HUB_SLOTS.maxBPowerRatioBps, hex32(staking.maxBPowerRatioBps));
  setStorage(storage, STAKE_HUB_SLOTS.ratioEnabled, encodeBool(staking.ratioEnabledAtLaunch));
  setStorage(storage, STAKE_HUB_SLOTS.minBtoARatioBps, hex32(staking.minBtoARatioBps));
  setStorage(storage, STAKE_HUB_SLOTS.tokenBRewardSplitBps, hex32(staking.goldRewardSplitBps));
  setStorage(storage, STAKE_HUB_SLOTS.inflationEnabled, encodeBool(inflation.enabled));
  setStorage(storage, STAKE_HUB_SLOTS.inflationRateInitialBps, hex32(inflation.initialRateBps));
  setStorage(storage, STAKE_HUB_SLOTS.inflationRateMinBps, hex32(inflation.minimumRateBps));
  setStorage(storage, STAKE_HUB_SLOTS.inflationDecayBpsPerYear, hex32(inflation.decayBpsPerYear));
  setStorage(storage, STAKE_HUB_SLOTS.inflationBaseSupply, hex32(inflation.baseSupplyWei));
  setStorage(storage, STAKE_HUB_SLOTS.slashReserveVault, encodeAddress(staking.slashReserveVault));
  setStorage(storage, STAKE_HUB_SLOTS.pendingSystemRewardAutoRetryCap, hex32(staking.pendingSystemRewardAutoRetryCapWei));
  setStorage(storage, STAKE_HUB_SLOTS.stakeTokenBPrimaryId, hex32(gold.tokenIds.paxgBacked));
  setStorage(storage, STAKE_HUB_SLOTS.stakeTokenBSecondaryId, hex32(gold.tokenIds.xautBacked));

  const allowlistEnabled = staking.validatorAllowlistEnabled !== false;
  setStorage(storage, STAKE_HUB_SLOTS.validatorAllowlistEnabled, encodeBool(allowlistEnabled));
  const allowlist = Array.isArray(staking.validatorAllowlist) && staking.validatorAllowlist.length > 0
    ? staking.validatorAllowlist
    : (config.validators || []).map((validator) => validator.consensusAddress);
  for (const account of allowlist) {
    setStorage(
      storage,
      addressMappingSlot(account, STAKE_HUB_SLOTS.validatorAllowlist),
      encodeBool(true),
    );
  }

  return storage;
}

function patchPhysicalGoldImmutables(bytecode, immutableReferences, gold) {
  const refs = Object.values(immutableReferences || {}).flat().sort((a, b) => a.start - b.start);
  if (refs.length !== 2) {
    throw new Error("PhysicalGold1155 launch bytecode must expose exactly two immutable bridge-ratio placeholders");
  }

  let patched = strip0x(bytecode);
  for (const [index, value] of [gold.bridgeScaleNumerator, gold.bridgeScaleDenominator].entries()) {
    const ref = refs[index];
    const start = ref.start * 2;
    const length = ref.length * 2;
    patched = `${patched.slice(0, start)}${strip0x(hex32(value)).slice(-length)}${patched.slice(start + length)}`;
  }
  return `0x${patched}`;
}

function buildLaunchGenesisState(config, physicalGoldArtifact) {
  const physicalGoldBytecode = patchPhysicalGoldImmutables(
    physicalGoldArtifact.deployedBytecode,
    physicalGoldArtifact.immutableReferences,
    config.gold,
  );
  const validatorSetStorage = buildGiltValidatorSetStorage(config);
  return {
    goldAddress: config.gold.address || DEFAULT_GOLD_ADDRESS,
    physicalGoldBytecode,
    validatorSetStorage,
    validatorBootstrapHash: validatorSetStorage[hex32(GILT_VALIDATOR_SET_SLOTS.validatorBootstrapHash)],
    physicalGoldStorage: buildPhysicalGoldStorage(config),
    stakeHubStorage: buildStakeHubStorage(config),
  };
}

module.exports = {
  DEFAULT_GOLD_ADDRESS,
  GILT_VALIDATOR_SET_SLOTS,
  STAKE_HUB_ADDRESS,
  VALIDATOR_SET_ADDRESS,
  buildGiltValidatorSetStorage,
  buildLaunchGenesisState,
  buildPhysicalGoldStorage,
  buildStakeHubStorage,
  hashValidatorBootstrapStorage,
  hex32,
  normalizeStorageForHash,
};
