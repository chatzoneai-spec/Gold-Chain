// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "../interface/0.8.x/IGiltValidatorSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./StakeHubCommon.sol";

contract StakeHubRootStake is StakeHubCommon {
    using EnumerableSet for EnumerableSet.AddressSet;
    uint8 internal constant ROOT_STAKE_STATUS_ACTIVE = 0;
    uint8 internal constant ROOT_STAKE_STATUS_JAILED = 1;
    uint8 internal constant ROOT_STAKE_STATUS_UNSTAKED = 2;

    error RootStakeInvalidNonce(uint256 validatorId, uint256 got, uint256 want);
    error RootStakeInvalidStatus(uint8 status);
    error RootStakeAnchorDisabled();

    function onStateReceive(
        uint256 stateId,
        bytes calldata data
    ) external onlyStateReceiver onlyStakeHubDelegateCall {
        if (!rootAnchoredGiltStakingEnabled) revert RootStakeAnchorDisabled();

        (uint256 validatorId, address signer, uint256 amount, uint256 nonce, uint8 status) =
            abi.decode(data, (uint256, address, uint256, uint256, uint8));
        if (status > ROOT_STAKE_STATUS_UNSTAKED) revert RootStakeInvalidStatus(status);

        RootStakeRecord storage rec = _rootStakeByValidatorId[validatorId];
        uint256 expectedNonce = rec.nonce + 1;
        if (nonce != expectedNonce) revert RootStakeInvalidNonce(validatorId, nonce, expectedNonce);

        _adjustRootStakeTotal(rec.amount, rec.status, amount, status);

        if (rec.signer != address(0) && rec.signer != signer) {
            delete _rootValidatorIdBySigner[rec.signer];
        }
        rec.signer = signer;
        rec.amount = amount;
        rec.nonce = nonce;
        rec.status = status;
        _rootValidatorIdBySigner[signer] = validatorId;

        emit RootStakeSnapshotApplied(stateId, validatorId, signer, amount, nonce, status);
        _checkRootStakeDivergence(signer);
    }

    function getRootStakeRecord(
        uint256 validatorId
    )
        external
        view
        onlyStakeHubDelegateCall
        returns (address signer, uint256 amount, uint256 nonce, uint8 status)
    {
        RootStakeRecord storage rec = _rootStakeByValidatorId[validatorId];
        return (rec.signer, rec.amount, rec.nonce, rec.status);
    }

    function getRootStakeAmountByConsensus(
        address consensusAddress
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        return _rootAnchoredStakeAmount(consensusAddress);
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
            address consensusAddress = _validators[operatorAddress].consensusAddress;
            trackedTotal += _rootAnchoredStakeAmount(consensusAddress);
        }
        if (trackedTotal != rootStakeSnapshotTotal) {
            emit RootStakeDivergenceDetected(rootStakeSnapshotTotal, trackedTotal, reporter);
            IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).activateConsensusEmergencyHalt(reporter);
        }
    }
}
