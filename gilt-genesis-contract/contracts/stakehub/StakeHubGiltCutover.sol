// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

// GILT live-cutover runbook (locked order):
// 1. Governance enables giltStakeFreeze — blocks new delegate/undelegate/redelegate/join.
// 2. Governance calls takeGiltCutoverSnapshot at one block — records each validator's total native GILT.
// 3. Validator locks matching wGILT on root StakeManager; finalized root stake syncs via onStateReceive.
// 4. cutoverValidatorToRoot flips one validator atomically: StakeCredit shares -> migrated claims,
//    election authority -> root-derived only (never both native + root for the same validator).
// 5. No window where StakeHub-native and root-derived power both count for the same validator.
// 6. Delegator StakeCredit -> pending root ValidatorShare claims are recorded 1:1 during that validator's flip.

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interface/0.8.x/IStakeCredit.sol";
import "./StakeHubCommon.sol";

contract StakeHubGiltCutover is StakeHubCommon {
    using EnumerableSet for EnumerableSet.AddressSet;

    function takeGiltCutoverSnapshot() external onlyStakeHubDelegateCall onlyGov {
        if (!giltStakeFreezeEnabled) revert GiltCutoverFreezeRequired();
        if (giltCutoverFlippedCount != 0) revert GiltCutoverSnapshotImmutable();

        uint256 validatorCount = _validatorSet.length();
        for (uint256 i; i < validatorCount; ++i) {
            address operatorAddress = _validatorSet.at(i);
            address creditContract = _validators[operatorAddress].creditContract;
            giltCutoverSnapshotGilt[operatorAddress] = IStakeCredit(creditContract).totalPooledGILT();
        }

        giltCutoverSnapshotBlock = block.number;
        emit GiltCutoverSnapshotTaken(block.number, validatorCount);
    }

    function cutoverValidatorToRoot(
        address operatorAddress
    ) external onlyStakeHubDelegateCall whenNotPaused validatorExist(operatorAddress) {
        if (!giltStakeFreezeEnabled) revert GiltCutoverFreezeRequired();
        if (giltCutoverSnapshotBlock == 0) revert GiltCutoverSnapshotNotTaken();
        if (giltCutoverFlipped[operatorAddress]) revert GiltCutoverAlreadyFlipped();
        if (!rootAnchoredGiltStakingEnabled) revert RootStakeAnchorDisabled();

        uint256 snapshotGilt = giltCutoverSnapshotGilt[operatorAddress];
        if (snapshotGilt == 0) revert InvalidRequest();

        Validator storage valInfo = _validators[operatorAddress];
        address consensusAddress = valInfo.consensusAddress;
        uint256 rootValidatorId = _rootValidatorIdBySigner[consensusAddress];
        if (rootValidatorId == 0) revert GiltCutoverInsufficientRootStake(snapshotGilt, 0);

        RootStakeRecord storage rec = _rootStakeByValidatorId[rootValidatorId];
        if (rec.status != ROOT_STAKE_STATUS_ACTIVE) {
            revert GiltCutoverInsufficientRootStake(snapshotGilt, 0);
        }
        if (rec.amount < snapshotGilt) {
            revert GiltCutoverInsufficientRootStake(snapshotGilt, rec.amount);
        }

        address creditContract = valInfo.creditContract;
        uint256 delegatorCount = _giltDelegators[operatorAddress].length();
        for (uint256 i; i < delegatorCount; ++i) {
            address delegator = _giltDelegators[operatorAddress].at(i);
            uint256 shares = IStakeCredit(creditContract).balanceOf(delegator);
            if (shares == 0) {
                continue;
            }
            uint256 giltAmount = IStakeCredit(creditContract).getPooledGILTByShares(shares);
            if (giltAmount == 0) {
                continue;
            }
            giltCutoverMigratedGilt[operatorAddress][delegator] = giltAmount;
            emit GiltCutoverDelegatorMigrated(operatorAddress, delegator, giltAmount);
        }

        giltCutoverFlipped[operatorAddress] = true;
        giltCutoverRootValidatorId[operatorAddress] = rootValidatorId;
        giltCutoverFlippedCount += 1;

        if (rec.status == ROOT_STAKE_STATUS_ACTIVE) {
            rootStakeSnapshotTotal += rec.amount;
        }

        emit GiltCutoverValidatorFlipped(
            operatorAddress, consensusAddress, snapshotGilt, rootValidatorId, rec.amount, delegatorCount
        );
        _checkRootStakeDivergence(consensusAddress);
    }

    function getGiltCutoverMigratedGilt(
        address operatorAddress,
        address delegator
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        return giltCutoverMigratedGilt[operatorAddress][delegator];
    }

    function isGiltCutoverFlipped(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (bool) {
        return giltCutoverFlipped[operatorAddress];
    }

    function getGiltCutoverSnapshotGilt(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        return giltCutoverSnapshotGilt[operatorAddress];
    }
}
