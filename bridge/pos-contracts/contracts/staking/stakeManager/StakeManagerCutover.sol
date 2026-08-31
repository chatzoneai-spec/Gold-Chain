pragma solidity 0.5.17;

import {SafeMath} from "../../common/oz/math/SafeMath.sol";
import {GovernanceLockable} from "../../common/mixin/GovernanceLockable.sol";
import {StakeManagerStorage} from "./StakeManagerStorage.sol";
import {StakeManagerStorageExtension} from "./StakeManagerStorageExtension.sol";
import {ValidatorShare} from "../validatorShare/ValidatorShare.sol";
import {StakingInfo} from "../StakingInfo.sol";

/// @notice Wave 5 root cutover: mint ValidatorShare 1:1 from already-locked validator wGILT.
contract StakeManagerCutover is StakeManagerStorage, StakeManagerStorageExtension {
    using SafeMath for uint256;

    constructor() public GovernanceLockable(address(0x0)) {}

    function applyCutoverShares(
        uint256 validatorId,
        address[] calldata delegators,
        uint256[] calldata amounts
    ) external onlyGovernance {
        require(delegators.length == amounts.length, "length mismatch");

        Validator storage validator = validators[validatorId];
        require(validator.amount > 0, "no stake");
        require(validator.status == Status.Active, "not active");
        require(validator.deactivationEpoch == 0, "unstaking");

        uint256 totalDelegatorAmount;
        for (uint256 i = 0; i < delegators.length; ++i) {
            require(delegators[i] != address(0), "zero delegator");
            require(amounts[i] > 0, "zero amount");
            require(!cutoverShareApplied[validatorId][delegators[i]], "already applied");
            totalDelegatorAmount = totalDelegatorAmount.add(amounts[i]);
        }
        require(totalDelegatorAmount <= validator.amount, "exceeds locked wGILT");

        if (validator.contractAddress == address(0)) {
            validator.contractAddress =
                validatorShareFactory.create(validatorId, address(logger), registry);
        }

        for (uint256 i = 0; i < delegators.length; ++i) {
            cutoverShareApplied[validatorId][delegators[i]] = true;
            ValidatorShare(validator.contractAddress).migrateIn(delegators[i], amounts[i]);
            emit CutoverSharesApplied(validatorId, delegators[i], amounts[i]);
        }

        validator.amount = validator.amount.sub(totalDelegatorAmount);
        cutoverSharesAppliedTotal[validatorId] =
            cutoverSharesAppliedTotal[validatorId].add(totalDelegatorAmount);
    }
}
