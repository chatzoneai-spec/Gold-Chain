// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "./stakehub/StakeHubCommon.sol";
import "./stakehub/StakeHubGiltStaking.sol";
import "./stakehub/StakeHubGoldStaking.sol";
import "./stakehub/StakeHubInflation.sol";
import "./stakehub/StakeHubMigration.sol";
import "./stakehub/StakeHubParams.sol";
import "./stakehub/StakeHubRewards.sol";
import "./stakehub/StakeHubSlashing.sol";
import "./stakehub/StakeHubValidatorViews.sol";
import "./stakehub/StakeHubValidators.sol";

contract StakeHub is StakeHubCommon {
    address public constant STAKE_HUB_VALIDATORS_MODULE_ADDR = 0x0000000000000000000000000000000000002010;
    address public constant STAKE_HUB_GILT_STAKING_MODULE_ADDR = 0x0000000000000000000000000000000000002011;
    address public constant STAKE_HUB_GOLD_STAKING_MODULE_ADDR = 0x0000000000000000000000000000000000002012;
    address public constant STAKE_HUB_REWARDS_MODULE_ADDR = 0x0000000000000000000000000000000000002013;
    address public constant STAKE_HUB_INFLATION_MODULE_ADDR = 0x0000000000000000000000000000000000002014;
    address public constant STAKE_HUB_SLASHING_MODULE_ADDR = 0x0000000000000000000000000000000000002015;
    address public constant STAKE_HUB_MIGRATION_MODULE_ADDR = 0x0000000000000000000000000000000000002016;
    address public constant STAKE_HUB_PARAMS_MODULE_ADDR = 0x0000000000000000000000000000000000002017;
    address public constant STAKE_HUB_VALIDATOR_VIEWS_MODULE_ADDR = 0x0000000000000000000000000000000000002018;

    error UnknownStakeHubSelector(bytes4 selector);
    error StakeHubModuleUnavailable(address module);

    receive() external payable {
        if (_receiveFundStatus != _ENABLE) revert();
    }

    fallback() external payable {
        _delegateTo(_moduleForSelector(msg.sig));
    }

    function initialize() external initializer onlyCoinbase onlyZeroGasPrice {
        if (transferGasLimit == 0) transferGasLimit = 5000;
        if (minSelfDelegationGILT == 0) minSelfDelegationGILT = 2_000 ether;
        if (minDelegationGILTChange == 0) minDelegationGILTChange = 1 ether;
        if (maxElectedValidators == 0) maxElectedValidators = 45;
        if (unbondPeriod == 0) unbondPeriod = block.chainid == ROUGHNET_CHAIN_ID ? ROUGHNET_UNBOND_PERIOD : 7 days;
        if (redelegateFeeRate == 0) redelegateFeeRate = 2;
        if (downtimeSlashAmount == 0) downtimeSlashAmount = 10 ether;
        if (felonySlashAmount == 0) felonySlashAmount = 200 ether;
        if (downtimeJailTime == 0) downtimeJailTime = 2 days;
        if (felonyJailTime == 0) felonyJailTime = 30 days;
        if (maxFelonyBetweenBreatheBlock == 0) maxFelonyBetweenBreatheBlock = 2;
        if (stakeWeightA == 0) stakeWeightA = POWER_SCALE;
        if (stakeWeightB == 0) stakeWeightB = 6_000;
        if (maxBPowerRatioBps == 0) maxBPowerRatioBps = MAX_RATIO_BPS;
        if (minBtoARatioBps == 0) minBtoARatioBps = MIN_RATIO_BPS;
        if (stakeTokenBPrimaryId == 0) stakeTokenBPrimaryId = 1;
        if (stakeTokenBSecondaryId == 0) stakeTokenBSecondaryId = 2;
        _deprecatedStakeTokenBStandard = 2;
        if (inflationStartDayIndex == 0) {
            inflationStartDayIndex = block.timestamp / BREATHE_BLOCK_INTERVAL;
        }
        if (inflationRateInitialBps == 0) inflationRateInitialBps = 1_000;
        if (inflationRateMinBps == 0) inflationRateMinBps = 150;
        if (inflationDecayBpsPerYear == 0) inflationDecayBpsPerYear = 1_500;
        inflationLastMintTimestamp = block.timestamp;
        if (pendingSystemRewardAutoRetryCap == 0) pendingSystemRewardAutoRetryCap = 10 ether;

        __Protectable_init_unchained(0x08E68Ec70FA3b629784fDB28887e206ce8561E08);
    }

    function handleSynPackage(
        uint8,
        bytes calldata
    ) external view onlyCrossChainContract whenNotPaused returns (bytes memory) {
        revert("deprecated");
    }

    function handleAckPackage(
        uint8,
        bytes calldata
    ) external view onlyCrossChainContract {
        revert("deprecated");
    }

    function handleFailAckPackage(
        uint8,
        bytes calldata
    ) external view onlyCrossChainContract {
        revert("deprecated");
    }

    function moduleForSelector(
        bytes4 selector
    ) external pure returns (address) {
        return _moduleForSelector(selector);
    }

    function _moduleForSelector(
        bytes4 selector
    ) internal pure returns (address) {
        if (
            selector == StakeHubValidators.updateAgent.selector
                || selector == StakeHubValidators.createValidator.selector
                || selector == StakeHubValidators.editConsensusAddress.selector
                || selector == StakeHubValidators.editCommissionRate.selector
                || selector == StakeHubValidators.editDescription.selector
                || selector == StakeHubValidators.editVoteAddress.selector
                || selector == StakeHubValidators.unjail.selector
                || selector == StakeHubValidators.syncGovToken.selector
                || selector == StakeHubValidators.addNodeIDs.selector
                || selector == StakeHubValidators.removeNodeIDs.selector
        ) {
            return STAKE_HUB_VALIDATORS_MODULE_ADDR;
        }

        if (
            selector == StakeHubValidatorViews.getValidatorRewardRecord.selector
                || selector == StakeHubValidatorViews.getValidatorTotalPooledGILTRecord.selector
                || selector == StakeHubValidatorViews.getValidators.selector
                || selector == StakeHubValidatorViews.getValidatorConsensusAddress.selector
                || selector == StakeHubValidatorViews.getValidatorCreditContract.selector
                || selector == StakeHubValidatorViews.getValidatorVoteAddress.selector
                || selector == StakeHubValidatorViews.getValidatorBasicInfo.selector
                || selector == StakeHubValidatorViews.getValidatorDescription.selector
                || selector == StakeHubValidatorViews.getValidatorCommission.selector
                || selector == StakeHubValidatorViews.getValidatorAgent.selector
                || selector == StakeHubValidatorViews.getValidatorUpdateTime.selector
                || selector == StakeHubValidatorViews.getValidatorElectionInfo.selector
                || selector == StakeHubValidatorViews.getNodeIDs.selector
        ) {
            return STAKE_HUB_VALIDATOR_VIEWS_MODULE_ADDR;
        }

        if (
            selector == StakeHubGiltStaking.delegate.selector || selector == StakeHubGiltStaking.undelegate.selector
                || selector == StakeHubGiltStaking.redelegate.selector || selector == StakeHubGiltStaking.claim.selector
                || selector == StakeHubGiltStaking.claimBatch.selector
        ) {
            return STAKE_HUB_GILT_STAKING_MODULE_ADDR;
        }

        if (
            selector == StakeHubGoldStaking.delegateTokenB1155.selector
                || selector == StakeHubGoldStaking.undelegateTokenB1155.selector
                || selector == StakeHubGoldStaking.claimTokenB.selector
                || selector == StakeHubGoldStaking.claimTokenBBatch.selector
                || selector == StakeHubGoldStaking.claimTokenBReward.selector
                || selector == StakeHubGoldStaking.claimTokenBRewardBatch.selector
                || selector == StakeHubGoldStaking.getDelegatedTokenB.selector
                || selector == StakeHubGoldStaking.getDelegatedTokenBById.selector
                || selector == StakeHubGoldStaking.getLegacyDelegatedTokenB.selector
                || selector == StakeHubGoldStaking.getLegacyDelegatedTokenBById.selector
                || selector == StakeHubGoldStaking.getTokenBDelegators.selector
                || selector == StakeHubGoldStaking.tokenBUnbondRequest.selector
                || selector == StakeHubGoldStaking.tokenB1155UnbondRequest.selector
                || selector == StakeHubGoldStaking.pendingTokenBUnbondRequest.selector
                || selector == StakeHubGoldStaking.claimableTokenBUnbondRequest.selector
                || selector == StakeHubGoldStaking.pendingTokenBReward.selector
        ) {
            return STAKE_HUB_GOLD_STAKING_MODULE_ADDR;
        }

        if (
            selector == StakeHubRewards.distributeReward.selector
                || selector == StakeHubRewards.retryPendingSystemReward.selector
                || selector == StakeHubRewards.sweepPendingSystemReward.selector
        ) {
            return STAKE_HUB_REWARDS_MODULE_ADDR;
        }

        if (
            selector == StakeHubInflation.recordInflationMint.selector
                || selector == StakeHubInflation.currentInflationBps.selector
                || selector == StakeHubInflation.inflationEffectiveSupply.selector
                || selector == StakeHubInflation.expectedInflationMintAmount.selector
        ) {
            return STAKE_HUB_INFLATION_MODULE_ADDR;
        }

        if (
            selector == StakeHubSlashing.settleSlashReserve1155.selector
                || selector == StakeHubSlashing.migrateSelfCustodiedSlashReserve.selector
                || selector == StakeHubSlashing.downtimeSlash.selector
                || selector == StakeHubSlashing.maliciousVoteSlash.selector
                || selector == StakeHubSlashing.doubleSignSlash.selector
                || selector == StakeHubSlashing.slashReserveBalanceById.selector
        ) {
            return STAKE_HUB_SLASHING_MODULE_ADDR;
        }

        if (
            selector == StakeHubMigration.activateTokenBMigration.selector
                || selector == StakeHubMigration.depositTokenBMigrationReserve1155.selector
                || selector == StakeHubMigration.withdrawTokenBMigrationReserve1155.selector
                || selector == StakeHubMigration.hasApprovedTokenBMigration.selector
                || selector == StakeHubMigration.migrateLegacyTokenB.selector
                || selector == StakeHubMigration.migrateLegacyTokenBDelegators.selector
        ) {
            return STAKE_HUB_MIGRATION_MODULE_ADDR;
        }

        if (selector == StakeHubParams.updateParam.selector) {
            return STAKE_HUB_PARAMS_MODULE_ADDR;
        }

        return address(0);
    }

    function _delegateTo(
        address module
    ) internal {
        if (module == address(0)) revert UnknownStakeHubSelector(msg.sig);
        if (module.code.length == 0) revert StakeHubModuleUnavailable(module);

        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), module, 0, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(0, 0, size)

            switch result
            case 0 { revert(0, size) }
            default { return(0, size) }
        }
    }
}
