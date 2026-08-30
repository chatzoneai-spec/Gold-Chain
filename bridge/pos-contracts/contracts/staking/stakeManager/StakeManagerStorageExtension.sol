pragma solidity 0.5.17;

import {IGiltMigration} from "../../common/misc/IGiltMigration.sol";
import {IERC20} from "../../common/oz/token/ERC20/IERC20.sol";
import {IValidatorSetCommitment} from "../IValidatorSetCommitment.sol";

contract StakeManagerStorageExtension {
    address public eventsHub;
    uint256 public rewardPerStake;
    address public extensionCode;
    address[] public signers;

    uint256 internal constant CHK_REWARD_PRECISION = 100;
    uint256 public prevBlockInterval;
    // how much less reward per skipped checkpoint, 0 - 100%
    uint256 public rewardDecreasePerCheckpoint;
    // how many checkpoints to reward
    uint256 public maxRewardedCheckpoints;
    // increase / decrease value for faster or slower checkpoints, 0 - 100%
    uint256 public checkpointRewardDelta;

    IERC20 public tokenLegacyToken;
    IGiltMigration public migration;
    IValidatorSetCommitment public validatorSetCommitment;

    address public stateSender;
    address public childStakeHub;
}
