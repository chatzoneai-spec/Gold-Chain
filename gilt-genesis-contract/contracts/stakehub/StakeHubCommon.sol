// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interface/0.8.x/IGiltValidatorSet.sol";
import "../interface/0.8.x/IGoldMigrationController.sol";
import "../interface/0.8.x/IGovToken.sol";
import "../interface/0.8.x/IStakeCredit.sol";
import "../lib/0.8.x/StakeHubMath.sol";
import "./StakeHubStorage.sol";

abstract contract StakeHubCommon is StakeHubStorage {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint8 internal constant ROOT_STAKE_STATUS_ACTIVE = 0;
    uint8 internal constant ROOT_STAKE_STATUS_JAILED = 1;
    uint8 internal constant ROOT_STAKE_STATUS_UNSTAKED = 2;

    function _checkValidatorSelfDelegation(
        address operatorAddress
    ) internal {
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.jailed) {
            return;
        }
        if (IStakeCredit(valInfo.creditContract).getPooledGILT(operatorAddress) < minSelfDelegationGILT) {
            _jailValidator(valInfo, block.timestamp + downtimeJailTime);
            IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).felony(valInfo.consensusAddress);
        }
    }

    function _checkFelonyRecord(
        address operatorAddress,
        SlashType slashType
    ) internal returns (bool, uint256) {
        bytes32 slashKey = keccak256(abi.encodePacked(operatorAddress, slashType));
        uint256 jailUntil = _felonyRecords[slashKey];
        // for double sign and malicious vote slash
        // if the validator is already jailed, no need to slash again
        if (jailUntil > block.timestamp) {
            return (false, 0);
        }
        jailUntil = block.timestamp + felonyJailTime;
        _felonyRecords[slashKey] = jailUntil;
        return (true, jailUntil);
    }

    function _jailValidator(
        Validator storage valInfo,
        uint256 jailUntil
    ) internal {
        if (jailUntil > valInfo.jailUntil) {
            valInfo.jailUntil = jailUntil;
        }

        if (!valInfo.jailed) {
            valInfo.jailed = true;
            numOfJailed += 1;

            emit ValidatorJailed(valInfo.operatorAddress);

            uint256 validatorCount = _validatorSet.length();
            if (validatorCount != 0 && numOfJailed >= validatorCount) {
                IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).activateConsensusEmergencyHalt(valInfo.consensusAddress);
                emit ConsensusEmergencyHalt(valInfo.operatorAddress, valInfo.consensusAddress, block.number);
            }
        }
    }

    function _isCurrentValidatorOperator(
        address operatorAddress
    ) internal view override returns (bool) {
        if (!_validatorSet.contains(operatorAddress)) {
            return false;
        }

        address consensusAddress = _validators[operatorAddress].consensusAddress;
        if (consensusAddress == address(0)) {
            return false;
        }

        return IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).isCurrentValidator(consensusAddress);
    }

    function _activeTotalDelegatedTokenB(
        address operatorAddress
    ) internal view virtual override returns (uint256) {
        uint256 totalTokenB = totalDelegatedTokenB[operatorAddress];
        uint256 legacyTokenB = totalLegacyDelegatedTokenB[operatorAddress];
        if (legacyTokenB >= totalTokenB) {
            return 0;
        }
        return totalTokenB - legacyTokenB;
    }

    function _activeDelegatedTokenB(
        address operatorAddress,
        address delegator
    ) internal view returns (uint256) {
        uint256 delegatedAmount = _delegatedTokenB[operatorAddress][delegator];
        uint256 legacyAmount = _legacyDelegatedTokenBAmount(operatorAddress, delegator);
        if (legacyAmount >= delegatedAmount) {
            return 0;
        }
        return delegatedAmount - legacyAmount;
    }

    function _legacyDelegatedTokenBAmount(
        address operatorAddress,
        address delegator
    ) internal view returns (uint256) {
        if (tokenBCutoverVersion == 0 || _tokenBDelegationVersion[operatorAddress][delegator] >= tokenBCutoverVersion) {
            return 0;
        }
        return _delegatedTokenB[operatorAddress][delegator];
    }

    function _isSupportedTokenBId(
        uint256 tokenId
    ) internal view returns (bool) {
        return tokenId == stakeTokenBPrimaryId || tokenId == stakeTokenBSecondaryId;
    }

    function _settleTokenBReward(
        address operatorAddress,
        address delegator
    ) internal {
        (uint256 delegatedAmount, uint256 rewardAcc) = _rewardedTokenBPosition(operatorAddress, delegator);
        _settleTokenBRewardAt(operatorAddress, delegator, delegatedAmount, rewardAcc);
    }

    function _settleTokenBRewardAt(
        address operatorAddress,
        address delegator,
        uint256 delegatedAmount,
        uint256 rewardAcc
    ) internal {
        if (delegatedAmount == 0) {
            _tokenBRewardDebt[operatorAddress][delegator] = 0;
            return;
        }

        uint256 accumulated = (delegatedAmount * rewardAcc) / TOKEN_B_REWARD_PRECISION;
        uint256 debt = _tokenBRewardDebt[operatorAddress][delegator];
        if (accumulated > debt) {
            _pendingTokenBReward[operatorAddress][delegator] += accumulated - debt;
        }
        _tokenBRewardDebt[operatorAddress][delegator] = accumulated;
    }

    function _syncTokenBRewardDebt(
        address operatorAddress,
        address delegator
    ) internal {
        (uint256 delegatedAmount, uint256 rewardAcc) = _rewardedTokenBPosition(operatorAddress, delegator);
        _tokenBRewardDebt[operatorAddress][delegator] = (delegatedAmount * rewardAcc) / TOKEN_B_REWARD_PRECISION;
    }

    function _rewardedTokenBPosition(
        address operatorAddress,
        address delegator
    ) internal view returns (uint256 delegatedAmount, uint256 rewardAcc) {
        uint256 legacyAmount = _legacyDelegatedTokenBAmount(operatorAddress, delegator);
        if (legacyAmount != 0) {
            return (_delegatedTokenB[operatorAddress][delegator], _tokenBRewardAccAtMigration[operatorAddress]);
        }

        return (_activeDelegatedTokenB(operatorAddress, delegator), _accTokenBRewardPerShare[operatorAddress]);
    }

    function _pendingTokenBRewardAt(
        address operatorAddress,
        address delegator,
        uint256 delegatedAmount,
        uint256 rewardAcc
    ) internal view returns (uint256) {
        uint256 pending = _pendingTokenBReward[operatorAddress][delegator];
        if (delegatedAmount == 0) {
            return pending;
        }

        uint256 accumulated = (delegatedAmount * rewardAcc) / TOKEN_B_REWARD_PRECISION;
        uint256 debt = _tokenBRewardDebt[operatorAddress][delegator];
        if (accumulated > debt) {
            pending += accumulated - debt;
        }
        return pending;
    }

    function _activateTokenBMigration(
        address newStakeTokenB,
        address reserveVault
    ) internal {
        address currentStakeTokenB = stakeTokenB;
        if (currentStakeTokenB == address(0) || newStakeTokenB == address(0) || reserveVault == address(0)) {
            revert InvalidRequest();
        }
        if (legacyStakeTokenB != address(0) || newStakeTokenB == currentStakeTokenB) revert InvalidRequest();

        legacyStakeTokenB = currentStakeTokenB;
        stakeTokenB = newStakeTokenB;
        legacyTokenBReserveVault = reserveVault;
        tokenBCutoverVersion += 1;
        if (tokenBMigrationController != address(0)) {
            IERC1155(currentStakeTokenB).setApprovalForAll(tokenBMigrationController, true);
        }

        uint256 validatorCount = _validatorSet.length();
        for (uint256 i; i < validatorCount; ++i) {
            address validator = _validatorSet.at(i);
            _tokenBRewardAccAtMigration[validator] = _accTokenBRewardPerShare[validator];
            totalLegacyDelegatedTokenB[validator] = totalDelegatedTokenB[validator];
        }

        emit TokenBMigrationActivated(currentStakeTokenB, newStakeTokenB, reserveVault, tokenBCutoverVersion);
    }

    function _requireActiveGoldMigrationController(
        address expectedLegacyGold,
        address expectedFinalGold,
        address expectedReserveVault
    ) internal view returns (IGoldMigrationController migrationController) {
        address migrationControllerAddress = tokenBMigrationController;
        if (
            migrationControllerAddress == address(0) || expectedLegacyGold == address(0)
                || expectedFinalGold == address(0) || expectedReserveVault == address(0)
        ) {
            revert TokenBMigrationNotAvailable();
        }

        migrationController = IGoldMigrationController(migrationControllerAddress);
        if (migrationController.lifecycleState() != _MIGRATION_STATE_ACTIVE || migrationController.migrationPaused()) {
            revert TokenBMigrationNotAvailable();
        }
        if (
            migrationController.legacyGold() != expectedLegacyGold
                || migrationController.finalGold() != expectedFinalGold
                || migrationController.reserveVault() != expectedReserveVault
                || migrationController.stakeMigrationCaller() != address(this)
        ) {
            revert InvalidRequest();
        }
    }

    function _consumePendingInflation(
        uint256 amount
    ) internal returns (uint256 resolvedAmount) {
        uint256 pendingInflation = pendingInflationSystemReward;
        if (pendingInflation == 0 || amount == 0) {
            return 0;
        }

        resolvedAmount = amount > pendingInflation ? pendingInflation : amount;
        pendingInflationSystemReward = pendingInflation - resolvedAmount;
        inflationPendingAmount -= resolvedAmount;
    }

    function _distributeTokenBReward(
        address operatorAddress,
        uint256 reward,
        uint256 totalTokenB
    ) internal {
        _accTokenBRewardPerShare[operatorAddress] += (reward * TOKEN_B_REWARD_PRECISION) / totalTokenB;
    }

    function _distributeValidatorReward(
        address operatorAddress,
        Validator memory valInfo,
        uint256 totalReward
    ) internal override {
        uint256 tokenBReward;
        // After migration, legacy external-backed GOLD is excluded from new reward accrual.
        uint256 totalTokenB = _activeTotalDelegatedTokenB(operatorAddress);
        if (tokenBRewardSplitBps != 0 && totalTokenB != 0) {
            tokenBReward = (totalReward * tokenBRewardSplitBps) / POWER_SCALE;
            if (tokenBReward != 0) {
                _distributeTokenBReward(operatorAddress, tokenBReward, totalTokenB);
                emit TokenBRewardDistributed(operatorAddress, tokenBReward);
            }
        }

        uint256 tokenAReward = totalReward - tokenBReward;
        if (tokenAReward != 0) {
            IStakeCredit(valInfo.creditContract).distributeReward{ value: tokenAReward }(valInfo.commission.rate);
        }
        emit RewardDistributed(operatorAddress, totalReward);
        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    function _autoRetryPendingSystemReward() internal override {
        uint256 cap = pendingSystemRewardAutoRetryCap;
        if (cap == 0 || pendingSystemReward == 0) {
            return;
        }
        uint256 amount = pendingSystemReward > cap ? cap : pendingSystemReward;
        (bool success, bytes memory failReason) = _retryPendingSystemReward(amount, _REWARD_FORWARD_REASON_AUTO_RETRY);
        emit RewardForwardRetried(msg.sender, amount, success, failReason);
    }

    function _retryPendingSystemReward(
        uint256 amount,
        uint8 reasonCode
    ) internal returns (bool success, bytes memory) {
        bytes memory failReason;
        (success, failReason) = _forwardSystemReward(amount);
        if (!success) {
            emit RewardForwardQueued(address(0), amount, reasonCode, failReason);
            return (false, failReason);
        }

        pendingSystemReward -= amount;
        uint256 resolvedInflation = _consumePendingInflation(amount);
        if (resolvedInflation != 0) {
            inflationRedirectedAmount += resolvedInflation;
        }
        return (true, bytes(""));
    }

    function _forwardSystemRewardOrQueue(
        address operatorAddress,
        uint256 amount,
        uint8 reasonCode,
        bool isInflation
    ) internal override returns (uint256 redirectedAmount, uint256 pendingAmount) {
        if (amount == 0) {
            return (0, 0);
        }

        (bool success, bytes memory failReason) = _forwardSystemReward(amount);
        if (success) {
            if (isInflation) {
                inflationRedirectedAmount += amount;
            }
            return (amount, 0);
        }

        pendingSystemReward += amount;
        if (isInflation) {
            pendingInflationSystemReward += amount;
            inflationPendingAmount += amount;
        }
        emit RewardForwardQueued(operatorAddress, amount, reasonCode, failReason);
        return (0, amount);
    }

    function _forwardSystemReward(
        uint256 amount
    ) internal returns (bool success, bytes memory failReason) {
        if (amount == 0) {
            return (true, bytes(""));
        }
        (success, failReason) = payable(SYSTEM_REWARD_ADDR).call{ value: amount }("");
    }

    function _effectiveVotingPower(
        uint256 stakeA,
        uint256 stakeB
    ) internal view returns (uint256) {
        return StakeHubMath.effectiveVotingPower(
            stakeA, stakeB, stakeWeightA, stakeWeightB, POWER_SCALE, ratioEnabled, minBtoARatioBps, maxBPowerRatioBps
        );
    }

    function _electionStakeA(
        address operatorAddress,
        address consensusAddress,
        address creditContract
    ) internal view returns (uint256) {
        if (rootAnchoredGiltStakingEnabled) {
            if (!giltCutoverFlipped[operatorAddress]) {
                return 0;
            }
            return _rootAnchoredStakeAmount(consensusAddress);
        }
        if (giltCutoverFlipped[operatorAddress]) {
            return _rootAnchoredStakeAmount(consensusAddress);
        }
        if (giltStakeFreezeEnabled && giltCutoverSnapshotBlock != 0) {
            return 0;
        }
        return IStakeCredit(creditContract).totalPooledGILT();
    }

    function _rootAnchoredStakeAmount(
        address consensusAddress
    ) internal view returns (uint256) {
        uint256 validatorId = _rootValidatorIdBySigner[consensusAddress];
        if (validatorId == 0) {
            return 0;
        }
        RootStakeRecord storage rec = _rootStakeByValidatorId[validatorId];
        if (rec.status != ROOT_STAKE_STATUS_ACTIVE) {
            return 0;
        }
        return rec.amount;
    }

    function _adjustRootStakeTotal(
        uint256 previousAmount,
        uint8 previousStatus,
        uint256 newAmount,
        uint8 newStatus
    ) internal {
        if (previousStatus == ROOT_STAKE_STATUS_ACTIVE) {
            rootStakeSnapshotTotal -= previousAmount;
        }
        if (newStatus == ROOT_STAKE_STATUS_ACTIVE) {
            rootStakeSnapshotTotal += newAmount;
        }
    }

    function _checkRootStakeDivergence(
        address reporter
    ) internal {
        uint256 trackedTotal;
        uint256 validatorCount = _validatorSet.length();
        for (uint256 i; i < validatorCount; ++i) {
            address operatorAddress = _validatorSet.at(i);
            if (!giltCutoverFlipped[operatorAddress]) {
                continue;
            }
            address consensusAddress = _validators[operatorAddress].consensusAddress;
            trackedTotal += _rootAnchoredStakeAmount(consensusAddress);
        }
        if (trackedTotal != rootStakeSnapshotTotal) {
            emit RootStakeDivergenceDetected(rootStakeSnapshotTotal, trackedTotal, reporter);
            IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).activateConsensusEmergencyHalt(reporter);
        }
    }

    function _trackGiltDelegator(
        address operatorAddress,
        address delegator
    ) internal {
        if (delegator == DEAD_ADDRESS) {
            return;
        }
        if (IStakeCredit(_validators[operatorAddress].creditContract).balanceOf(delegator) > 0) {
            _giltDelegators[operatorAddress].add(delegator);
        } else {
            _giltDelegators[operatorAddress].remove(delegator);
        }
    }

    function _requireGiltStakeUnfrozen(
        address operatorAddress
    ) internal view {
        if (giltStakeFreezeEnabled && !giltCutoverFlipped[operatorAddress]) {
            revert GiltStakeFrozen();
        }
    }

    function _requireGiltCutoverNotFlipped(
        address operatorAddress
    ) internal view {
        if (giltCutoverFlipped[operatorAddress]) {
            revert GiltCutoverAlreadyFlipped();
        }
    }

    function _nativeGiltStakeTotal() internal view returns (uint256) {
        uint256 totalLength = _validatorSet.length();
        uint256 total;
        for (uint256 i; i < totalLength; ++i) {
            address operatorAddress = _validatorSet.at(i);
            total += IStakeCredit(_validators[operatorAddress].creditContract).totalPooledGILT();
        }
        return total;
    }
}
