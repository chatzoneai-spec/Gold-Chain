pragma solidity 0.5.17;

import {IGovernance} from "../../common/governance/IGovernance.sol";
import {StakeManagerCutover} from "./StakeManagerCutover.sol";
import {StakingInfo} from "../StakingInfo.sol";
import {ValidatorShareFactory} from "../validatorShare/ValidatorShareFactory.sol";
import {MockPOLToken} from "./MockPOLToken.sol";

/// @notice Minimal harness for isolated Wave 5 cutover-share tests.
///         Does not pull DeploySystem.s.sol into the compile graph.
contract CutoverSharesHarness is StakeManagerCutover {
    function wire(
        address _governance,
        address _registry,
        address _logger,
        address _factory
    ) external {
        governance = IGovernance(_governance);
        registry = _registry;
        logger = StakingInfo(_logger);
        validatorShareFactory = ValidatorShareFactory(_factory);
        delegationEnabled = true;
        currentEpoch = 1;
    }

    function plantValidator(uint256 validatorId, address signer, uint256 amount) external {
        validators[validatorId].amount = amount;
        validators[validatorId].signer = signer;
        validators[validatorId].status = Status.Active;
        validators[validatorId].delegatorsReward = INITIALIZED_AMOUNT;
        validators[validatorId].reward = INITIALIZED_AMOUNT;
        validators[validatorId].activationEpoch = currentEpoch;
        signerToValidator[signer] = validatorId;
        totalStaked = totalStaked.add(amount);
    }

    function plantValidatorWithDelegation(uint256 validatorId, address signer, uint256 amount) external {
        address shareContract = validatorShareFactory.create(validatorId, address(logger), registry);
        validators[validatorId].contractAddress = shareContract;
        validators[validatorId].amount = amount;
        validators[validatorId].signer = signer;
        validators[validatorId].status = Status.Active;
        validators[validatorId].delegatorsReward = INITIALIZED_AMOUNT;
        validators[validatorId].reward = INITIALIZED_AMOUNT;
        validators[validatorId].activationEpoch = currentEpoch;
        signerToValidator[signer] = validatorId;
        totalStaked = totalStaked.add(amount);
    }

    function validatorStake(uint256 validatorId) external view returns (uint256) {
        return validators[validatorId].amount;
    }

    function delegatedAmount(uint256 validatorId) external view returns (uint256) {
        return validators[validatorId].delegatedAmount;
    }

    function getRegistry() external view returns (address) {
        return registry;
    }

    function withdrawDelegatorsReward(uint256 validatorId) external returns (uint256) {
        require(validators[validatorId].contractAddress == msg.sender, "Invalid contract address");
        uint256 totalReward = validators[validatorId].delegatorsReward.sub(INITIALIZED_AMOUNT);
        validators[validatorId].delegatorsReward = INITIALIZED_AMOUNT;
        return totalReward;
    }

    function updateValidatorState(uint256 validatorId, int256 amount) external {
        require(validators[validatorId].contractAddress == msg.sender, "Invalid contract address");
        if (amount > 0) {
            require(delegationEnabled, "Delegation is disabled");
            validators[validatorId].delegatedAmount = validators[validatorId].delegatedAmount.add(uint256(amount));
        } else if (amount < 0) {
            validators[validatorId].delegatedAmount =
                validators[validatorId].delegatedAmount.sub(uint256(amount * -1));
        }
    }
}
