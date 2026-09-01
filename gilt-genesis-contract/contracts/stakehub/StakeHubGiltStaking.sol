// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "../interface/0.8.x/IGovToken.sol";
import "../interface/0.8.x/IStakeCredit.sol";
import "./StakeHubCommon.sol";

contract StakeHubGiltStaking is StakeHubCommon {
    function delegate(
        address operatorAddress,
        bool delegateVotePower
    ) external payable onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _requireNativeGiltWritesRetired();
        _requireGiltStakeUnfrozen(operatorAddress);
        _requireGiltCutoverNotFlipped(operatorAddress);

        uint256 giltAmount = msg.value;
        if (giltAmount < minDelegationGILTChange) revert DelegationAmountTooSmall();

        address delegator = msg.sender;
        Validator memory valInfo = _validators[operatorAddress];
        if (valInfo.jailed && delegator != operatorAddress) revert OnlySelfDelegation();

        uint256 shares = IStakeCredit(valInfo.creditContract).delegate{ value: giltAmount }(delegator);
        emit Delegated(operatorAddress, delegator, shares, giltAmount);
        _trackGiltDelegator(operatorAddress, delegator);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, delegator);
        if (delegateVotePower) {
            IGovToken(GOV_TOKEN_ADDR).delegateVote(delegator, operatorAddress);
        }
    }

    function undelegate(
        address operatorAddress,
        uint256 shares
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _requireNativeGiltWritesRetired();
        _requireGiltStakeUnfrozen(operatorAddress);
        _requireGiltCutoverNotFlipped(operatorAddress);

        if (shares == 0) revert ZeroShares();

        address delegator = msg.sender;
        Validator memory valInfo = _validators[operatorAddress];

        uint256 giltAmount = IStakeCredit(valInfo.creditContract).undelegate(delegator, shares);
        emit Undelegated(operatorAddress, delegator, shares, giltAmount);
        _trackGiltDelegator(operatorAddress, delegator);

        if (delegator == operatorAddress) {
            _checkValidatorSelfDelegation(operatorAddress);
        }

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, delegator);
    }

    function redelegate(
        address srcValidator,
        address dstValidator,
        uint256 shares,
        bool delegateVotePower
    )
        external
        onlyStakeHubDelegateCall
        whenNotPaused
        notInBlackList
        validatorExist(srcValidator)
        validatorExist(dstValidator)
        enableReceivingFund
    {
        _requireNativeGiltWritesRetired();
        _requireGiltStakeUnfrozen(srcValidator);
        _requireGiltCutoverNotFlipped(srcValidator);
        _requireGiltStakeUnfrozen(dstValidator);
        _requireGiltCutoverNotFlipped(dstValidator);

        if (shares == 0) revert ZeroShares();
        if (srcValidator == dstValidator) revert SameValidator();

        address delegator = msg.sender;
        Validator memory srcValInfo = _validators[srcValidator];
        Validator memory dstValInfo = _validators[dstValidator];
        if (dstValInfo.jailed && delegator != dstValidator) revert OnlySelfDelegation();

        uint256 giltAmount = IStakeCredit(srcValInfo.creditContract).unbond(delegator, shares);
        if (giltAmount < minDelegationGILTChange) revert DelegationAmountTooSmall();
        // check if the srcValidator has enough self delegation
        if (
            delegator == srcValidator
                && IStakeCredit(srcValInfo.creditContract).getPooledGILT(srcValidator) < minSelfDelegationGILT
        ) {
            revert SelfDelegationNotEnough();
        }

        uint256 feeCharge = giltAmount * redelegateFeeRate / REDELEGATE_FEE_RATE_BASE;
        (bool success,) = dstValInfo.creditContract.call{ value: feeCharge }("");
        if (!success) revert TransferFailed();

        giltAmount -= feeCharge;
        uint256 newShares = IStakeCredit(dstValInfo.creditContract).delegate{ value: giltAmount }(delegator);
        emit Redelegated(srcValidator, dstValidator, delegator, shares, newShares, giltAmount);
        _trackGiltDelegator(srcValidator, delegator);
        _trackGiltDelegator(dstValidator, delegator);

        address[] memory stakeCredits = new address[](2);
        stakeCredits[0] = srcValInfo.creditContract;
        stakeCredits[1] = dstValInfo.creditContract;
        IGovToken(GOV_TOKEN_ADDR).syncBatch(stakeCredits, delegator);
        if (delegateVotePower) {
            IGovToken(GOV_TOKEN_ADDR).delegateVote(delegator, dstValidator);
        }
    }

    function claim(
        address operatorAddress,
        uint256 requestNumber
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList {
        _claim(operatorAddress, requestNumber);
    }

    function claimBatch(
        address[] calldata operatorAddresses,
        uint256[] calldata requestNumbers
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList {
        if (operatorAddresses.length != requestNumbers.length) revert InvalidRequest();
        for (uint256 i; i < operatorAddresses.length; ++i) {
            _claim(operatorAddresses[i], requestNumbers[i]);
        }
    }

    function _claim(
        address operatorAddress,
        uint256 requestNumber
    ) internal validatorExist(operatorAddress) {
        _requireGiltCutoverNotFlipped(operatorAddress);

        uint256 giltAmount = IStakeCredit(_validators[operatorAddress].creditContract).claim(msg.sender, requestNumber);
        emit Claimed(operatorAddress, msg.sender, giltAmount);
        _trackGiltDelegator(operatorAddress, msg.sender);
    }
}
