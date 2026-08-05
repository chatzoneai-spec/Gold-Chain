const STAKE_HUB_SLOTS = {
  protectorAndInitializable: 0,
  transferGasLimit: 53,
  minSelfDelegationGILT: 54,
  minDelegationGILTChange: 55,
  maxElectedValidators: 56,
  unbondPeriod: 57,
  redelegateFeeRate: 58,
  downtimeSlashAmount: 59,
  felonySlashAmount: 60,
  downtimeJailTime: 61,
  felonyJailTime: 62,
  maxFelonyBetweenBreatheBlock: 74,
  stakeTokenB: 80,
  stakeWeightA: 81,
  stakeWeightB: 82,
  maxBPowerRatioBps: 83,
  ratioEnabled: 84,
  minBtoARatioBps: 85,
  tokenBRewardSplitBps: 86,
  inflationEnabled: 87,
  inflationRateInitialBps: 89,
  inflationRateMinBps: 90,
  inflationDecayBpsPerYear: 91,
  inflationBaseSupply: 92,
  slashReserveVault: 100,
  pendingSystemRewardAutoRetryCap: 104,
  stakeTokenBPrimaryId: 128,
  stakeTokenBSecondaryId: 129,
  validatorAllowlistEnabled: 138,
  validatorAllowlist: 139,
};

const STAKE_HUB_STORAGE_LAYOUT_MANIFEST = {
  _protector: STAKE_HUB_SLOTS.protectorAndInitializable,
  transferGasLimit: STAKE_HUB_SLOTS.transferGasLimit,
  minSelfDelegationGILT: STAKE_HUB_SLOTS.minSelfDelegationGILT,
  minDelegationGILTChange: STAKE_HUB_SLOTS.minDelegationGILTChange,
  maxElectedValidators: STAKE_HUB_SLOTS.maxElectedValidators,
  unbondPeriod: STAKE_HUB_SLOTS.unbondPeriod,
  redelegateFeeRate: STAKE_HUB_SLOTS.redelegateFeeRate,
  downtimeSlashAmount: STAKE_HUB_SLOTS.downtimeSlashAmount,
  felonySlashAmount: STAKE_HUB_SLOTS.felonySlashAmount,
  downtimeJailTime: STAKE_HUB_SLOTS.downtimeJailTime,
  felonyJailTime: STAKE_HUB_SLOTS.felonyJailTime,
  maxFelonyBetweenBreatheBlock: STAKE_HUB_SLOTS.maxFelonyBetweenBreatheBlock,
  stakeTokenB: STAKE_HUB_SLOTS.stakeTokenB,
  stakeWeightA: STAKE_HUB_SLOTS.stakeWeightA,
  stakeWeightB: STAKE_HUB_SLOTS.stakeWeightB,
  maxBPowerRatioBps: STAKE_HUB_SLOTS.maxBPowerRatioBps,
  ratioEnabled: STAKE_HUB_SLOTS.ratioEnabled,
  minBtoARatioBps: STAKE_HUB_SLOTS.minBtoARatioBps,
  tokenBRewardSplitBps: STAKE_HUB_SLOTS.tokenBRewardSplitBps,
  inflationEnabled: STAKE_HUB_SLOTS.inflationEnabled,
  inflationRateInitialBps: STAKE_HUB_SLOTS.inflationRateInitialBps,
  inflationRateMinBps: STAKE_HUB_SLOTS.inflationRateMinBps,
  inflationDecayBpsPerYear: STAKE_HUB_SLOTS.inflationDecayBpsPerYear,
  inflationBaseSupply: STAKE_HUB_SLOTS.inflationBaseSupply,
  slashReserveVault: STAKE_HUB_SLOTS.slashReserveVault,
  pendingSystemRewardAutoRetryCap: STAKE_HUB_SLOTS.pendingSystemRewardAutoRetryCap,
  stakeTokenBPrimaryId: STAKE_HUB_SLOTS.stakeTokenBPrimaryId,
  stakeTokenBSecondaryId: STAKE_HUB_SLOTS.stakeTokenBSecondaryId,
  validatorAllowlistEnabled: STAKE_HUB_SLOTS.validatorAllowlistEnabled,
  validatorAllowlist: STAKE_HUB_SLOTS.validatorAllowlist,
};

function verifyStakeHubStorageLayout(storageLayout) {
  const entries = storageLayout?.storage;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      "StakeHub artifact is missing storageLayout.storage. Run forge build with extra_output = [\"storageLayout\"] before launch generation.",
    );
  }

  const byLabel = new Map();
  for (const entry of entries) {
    if (!byLabel.has(entry.label)) {
      byLabel.set(entry.label, entry);
    }
  }

  const checked = [];
  for (const [label, expectedSlot] of Object.entries(STAKE_HUB_STORAGE_LAYOUT_MANIFEST)) {
    const entry = byLabel.get(label);
    if (!entry) {
      throw new Error(`StakeHub storage layout missing required launch field: ${label}`);
    }
    const actualSlot = Number(entry.slot);
    if (actualSlot !== expectedSlot) {
      throw new Error(
        `StakeHub storage slot mismatch for ${label}: expected slot ${expectedSlot}, artifact has slot ${entry.slot}. Update launch storage deliberately before generating genesis.`,
      );
    }
    checked.push({ label, slot: actualSlot });
  }

  return checked;
}

module.exports = {
  STAKE_HUB_SLOTS,
  STAKE_HUB_STORAGE_LAYOUT_MANIFEST,
  verifyStakeHubStorageLayout,
};
