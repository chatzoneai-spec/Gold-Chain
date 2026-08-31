// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "../lib/0.8.x/Utils.sol";
import "./StakeHubCommon.sol";

contract StakeHubParams is StakeHubCommon {
    using Utils for string;
    using Utils for bytes;

    function updateParam(
        string calldata key,
        bytes calldata value
    ) external onlyStakeHubDelegateCall onlyGov {
        if (
            _updateCoreParam(key, value) || _updateSlashParam(key, value) || _updateGoldParam(key, value)
                || _updatePowerParam(key, value) || _updateInflationParam(key, value) || _updateAdminParam(key, value)
        ) {
            emit ParamChange(key, value);
            return;
        }

        revert UnknownParam(key, value);
    }

    function _updateCoreParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("transferGasLimit")) {
            uint256 newTransferGasLimit = _uint256Param(key, value);
            if (newTransferGasLimit < 2300 || newTransferGasLimit > 10_000) revert InvalidValue(key, value);
            transferGasLimit = newTransferGasLimit;
            return true;
        }
        if (key.compareStrings("minSelfDelegationGILT")) {
            uint256 newMinSelfDelegationGILT = _uint256Param(key, value);
            if (newMinSelfDelegationGILT < 1000 ether || newMinSelfDelegationGILT > 100_000 ether) {
                revert InvalidValue(key, value);
            }
            minSelfDelegationGILT = newMinSelfDelegationGILT;
            return true;
        }
        if (key.compareStrings("minDelegationGILTChange")) {
            uint256 newMinDelegationGILTChange = _uint256Param(key, value);
            if (newMinDelegationGILTChange < 0.1 ether || newMinDelegationGILTChange > 10 ether) {
                revert InvalidValue(key, value);
            }
            minDelegationGILTChange = newMinDelegationGILTChange;
            return true;
        }
        if (key.compareStrings("maxElectedValidators")) {
            uint256 newMaxElectedValidators = _uint256Param(key, value);
            if (newMaxElectedValidators == 0 || newMaxElectedValidators > 500) revert InvalidValue(key, value);
            maxElectedValidators = newMaxElectedValidators;
            return true;
        }
        if (key.compareStrings("unbondPeriod")) {
            uint256 newUnbondPeriod = _uint256Param(key, value);
            if (newUnbondPeriod < 3 days || newUnbondPeriod > 30 days) revert InvalidValue(key, value);
            unbondPeriod = newUnbondPeriod;
            return true;
        }
        if (key.compareStrings("redelegateFeeRate")) {
            uint256 newRedelegateFeeRate = _uint256Param(key, value);
            if (newRedelegateFeeRate > 100) revert InvalidValue(key, value);
            redelegateFeeRate = newRedelegateFeeRate;
            return true;
        }
        if (key.compareStrings("maxNodeIDs")) {
            uint256 newMaxNodeIDs = _uint256Param(key, value);
            if (newMaxNodeIDs == 0) revert InvalidValue(key, value);
            maxNodeIDs = newMaxNodeIDs;
            return true;
        }
        return false;
    }

    function _updateSlashParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("downtimeSlashAmount")) {
            uint256 newDowntimeSlashAmount = _uint256Param(key, value);
            if (newDowntimeSlashAmount < 1 ether || newDowntimeSlashAmount >= felonySlashAmount) {
                revert InvalidValue(key, value);
            }
            downtimeSlashAmount = newDowntimeSlashAmount;
            return true;
        }
        if (key.compareStrings("felonySlashAmount")) {
            uint256 newFelonySlashAmount = _uint256Param(key, value);
            if (newFelonySlashAmount < 10 ether || newFelonySlashAmount <= downtimeSlashAmount) {
                revert InvalidValue(key, value);
            }
            felonySlashAmount = newFelonySlashAmount;
            return true;
        }
        if (key.compareStrings("downtimeJailTime")) {
            uint256 newDowntimeJailTime = _uint256Param(key, value);
            if (newDowntimeJailTime < 1 days || newDowntimeJailTime >= felonyJailTime) {
                revert InvalidValue(key, value);
            }
            downtimeJailTime = newDowntimeJailTime;
            return true;
        }
        if (key.compareStrings("felonyJailTime")) {
            uint256 newFelonyJailTime = _uint256Param(key, value);
            if (newFelonyJailTime < 3 days || newFelonyJailTime <= downtimeJailTime) revert InvalidValue(key, value);
            felonyJailTime = newFelonyJailTime;
            return true;
        }
        if (key.compareStrings("maxFelonyBetweenBreatheBlock")) {
            uint256 newJailedPerDay = _uint256Param(key, value);
            if (newJailedPerDay == 0) revert InvalidValue(key, value);
            maxFelonyBetweenBreatheBlock = newJailedPerDay;
            return true;
        }
        if (key.compareStrings("slashReserveVault")) {
            address newSlashReserveVault = _addressParam(key, value);
            if (
                newSlashReserveVault == address(0) || newSlashReserveVault == DEAD_ADDRESS
                    || newSlashReserveVault == address(this)
            ) {
                revert InvalidValue(key, value);
            }
            slashReserveVault = newSlashReserveVault;
            return true;
        }
        return false;
    }

    function _updateGoldParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("stakeTokenB")) {
            address newStakeTokenB = _addressParam(key, value);
            if (newStakeTokenB == address(0) || stakeTokenB != address(0) || legacyStakeTokenB != address(0)) {
                revert InvalidValue(key, value);
            }
            stakeTokenB = newStakeTokenB;
            return true;
        }
        if (key.compareStrings("stakeTokenBStandard")) {
            revert InvalidValue(key, value);
        }
        if (key.compareStrings("stakeTokenBPrimaryId")) {
            uint256 newStakeTokenBPrimaryId = _uint256Param(key, value);
            if (newStakeTokenBPrimaryId == 0 || newStakeTokenBPrimaryId == stakeTokenBSecondaryId) {
                revert InvalidValue(key, value);
            }
            if (stakeTokenB != address(0) || legacyStakeTokenB != address(0)) revert InvalidValue(key, value);
            stakeTokenBPrimaryId = newStakeTokenBPrimaryId;
            return true;
        }
        if (key.compareStrings("stakeTokenBSecondaryId")) {
            uint256 newStakeTokenBSecondaryId = _uint256Param(key, value);
            if (newStakeTokenBSecondaryId == 0 || newStakeTokenBSecondaryId == stakeTokenBPrimaryId) {
                revert InvalidValue(key, value);
            }
            if (stakeTokenB != address(0) || legacyStakeTokenB != address(0)) revert InvalidValue(key, value);
            stakeTokenBSecondaryId = newStakeTokenBSecondaryId;
            return true;
        }
        return false;
    }

    function _updatePowerParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("stakeWeightA")) {
            uint256 newStakeWeightA = _uint256Param(key, value);
            if (newStakeWeightA > 10 * POWER_SCALE) revert InvalidValue(key, value);
            stakeWeightA = newStakeWeightA;
            return true;
        }
        if (key.compareStrings("stakeWeightB")) {
            uint256 newStakeWeightB = _uint256Param(key, value);
            if (newStakeWeightB > 10 * POWER_SCALE) revert InvalidValue(key, value);
            stakeWeightB = newStakeWeightB;
            return true;
        }
        if (key.compareStrings("maxBPowerRatioBps")) {
            uint256 newMaxBPowerRatioBps = _uint256Param(key, value);
            if (newMaxBPowerRatioBps == 0 || newMaxBPowerRatioBps > MAX_RATIO_BPS) revert InvalidValue(key, value);
            maxBPowerRatioBps = newMaxBPowerRatioBps;
            return true;
        }
        if (key.compareStrings("ratioEnabled")) {
            ratioEnabled = _boolParam(key, value);
            return true;
        }
        if (key.compareStrings("minBtoARatioBps")) {
            uint256 newMinBtoARatioBps = _uint256Param(key, value);
            if (newMinBtoARatioBps < MIN_RATIO_BPS || newMinBtoARatioBps > MAX_RATIO_BPS) {
                revert InvalidValue(key, value);
            }
            minBtoARatioBps = newMinBtoARatioBps;
            return true;
        }
        if (key.compareStrings("tokenBRewardSplitBps")) {
            uint256 newTokenBRewardSplitBps = _uint256Param(key, value);
            if (newTokenBRewardSplitBps > POWER_SCALE) revert InvalidValue(key, value);
            if (newTokenBRewardSplitBps != 0 && stakeTokenB == address(0)) revert InvalidValue(key, value);
            tokenBRewardSplitBps = newTokenBRewardSplitBps;
            return true;
        }
        if (key.compareStrings("rootAnchoredGiltStakingEnabled")) {
            rootAnchoredGiltStakingEnabled = _boolParam(key, value);
            return true;
        }
        if (key.compareStrings("giltStakeFreezeEnabled")) {
            bool enabled = _boolParam(key, value);
            giltStakeFreezeEnabled = enabled;
            emit GiltStakeFreezeToggled(enabled);
            return true;
        }
        return false;
    }

    function _updateInflationParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("inflationEnabled")) {
            bool enableInflation = _boolParam(key, value);
            if (enableInflation && inflationBaseSupply == 0) revert InvalidValue(key, value);
            inflationEnabled = enableInflation;
            if (enableInflation) {
                inflationLastMintTimestamp = block.timestamp;
            }
            return true;
        }
        if (key.compareStrings("inflationStartDayIndex")) {
            inflationStartDayIndex = _uint256Param(key, value);
            inflationLastMintTimestamp = block.timestamp;
            return true;
        }
        if (key.compareStrings("inflationRateInitialBps")) {
            uint256 newInflationRateInitialBps = _uint256Param(key, value);
            if (
                newInflationRateInitialBps == 0 || newInflationRateInitialBps > POWER_SCALE
                    || newInflationRateInitialBps < inflationRateMinBps
            ) {
                revert InvalidValue(key, value);
            }
            inflationRateInitialBps = newInflationRateInitialBps;
            return true;
        }
        if (key.compareStrings("inflationRateMinBps")) {
            uint256 newInflationRateMinBps = _uint256Param(key, value);
            if (newInflationRateMinBps == 0 || newInflationRateMinBps > inflationRateInitialBps) {
                revert InvalidValue(key, value);
            }
            inflationRateMinBps = newInflationRateMinBps;
            return true;
        }
        if (key.compareStrings("inflationDecayBpsPerYear")) {
            uint256 newInflationDecayBpsPerYear = _uint256Param(key, value);
            if (newInflationDecayBpsPerYear > POWER_SCALE) revert InvalidValue(key, value);
            inflationDecayBpsPerYear = newInflationDecayBpsPerYear;
            return true;
        }
        if (key.compareStrings("inflationBaseSupply")) {
            uint256 newInflationBaseSupply = _uint256Param(key, value);
            if (newInflationBaseSupply == 0) revert InvalidValue(key, value);
            inflationBaseSupply = newInflationBaseSupply;
            inflationLastMintTimestamp = block.timestamp;
            return true;
        }
        if (key.compareStrings("pendingSystemRewardAutoRetryCap")) {
            pendingSystemRewardAutoRetryCap = _uint256Param(key, value);
            return true;
        }
        return false;
    }

    function _updateAdminParam(
        string calldata key,
        bytes calldata value
    ) internal returns (bool) {
        if (key.compareStrings("stakeHubProtector")) {
            address newStakeHubProtector = _addressParam(key, value);
            if (newStakeHubProtector == address(0)) revert InvalidValue(key, value);
            _setProtector(newStakeHubProtector);
            return true;
        }
        if (key.compareStrings("tokenBMigrationController")) {
            address newMigrationController = _addressParam(key, value);
            if (newMigrationController == address(0)) revert InvalidValue(key, value);
            address previousMigrationController = tokenBMigrationController;
            tokenBMigrationController = newMigrationController;
            if (legacyStakeTokenB != address(0)) {
                IERC1155(legacyStakeTokenB).setApprovalForAll(newMigrationController, true);
            }
            emit TokenBMigrationControllerUpdated(previousMigrationController, newMigrationController);
            return true;
        }
        if (key.compareStrings("activateTokenBMigration")) {
            if (value.length != 64) revert InvalidValue(key, value);
            (address newStakeTokenB, address reserveVault) = abi.decode(value, (address, address));
            _requireActiveGoldMigrationController(stakeTokenB, newStakeTokenB, reserveVault);
            _activateTokenBMigration(newStakeTokenB, reserveVault);
            return true;
        }
        return false;
    }

    function _uint256Param(
        string calldata key,
        bytes calldata value
    ) internal pure returns (uint256) {
        if (value.length != 32) revert InvalidValue(key, value);
        return value.bytesToUint256(32);
    }

    function _addressParam(
        string calldata key,
        bytes calldata value
    ) internal pure returns (address) {
        if (value.length != 20) revert InvalidValue(key, value);
        return value.bytesToAddress(20);
    }

    function _boolParam(
        string calldata key,
        bytes calldata value
    ) internal pure returns (bool) {
        if (value.length != 1) revert InvalidValue(key, value);
        uint8 flag = uint8(value[0]);
        if (flag > 1) revert InvalidValue(key, value);
        return flag == 1;
    }
}
