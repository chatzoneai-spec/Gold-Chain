pragma solidity 0.5.17;

import {IERC20} from "../../common/oz/token/ERC20/IERC20.sol";
import {SafeMath} from "../../common/oz/math/SafeMath.sol";
import {Math} from "../../common/oz/math/Math.sol";
import {ECVerify} from "../../common/lib/ECVerify.sol";
import {Registry} from "../../common/Registry.sol";
import {GovernanceLockable} from "../../common/mixin/GovernanceLockable.sol";
import {StakeManagerStorage} from "./StakeManagerStorage.sol";
import {StakeManagerStorageExtension} from "./StakeManagerStorageExtension.sol";
import {Initializable} from "../../common/mixin/Initializable.sol";
import {EventsHub} from "../EventsHub.sol";
import {ValidatorShare} from "../validatorShare/ValidatorShare.sol";
import {ValidatorShareFactory} from "../validatorShare/ValidatorShareFactory.sol";
import {StakingInfo} from "../StakingInfo.sol";
import {StakingNFT} from "./StakingNFT.sol";
import {IValidatorSetCommitment} from "../IValidatorSetCommitment.sol";

contract StakeManagerExtension is StakeManagerStorage, Initializable, StakeManagerStorageExtension {
    using SafeMath for uint256;

    struct UnsignedValidatorsContext {
        uint256 unsignedValidatorIndex;
        uint256 validatorIndex;
        uint256[] unsignedValidators;
        address[] validators;
        uint256 totalValidators;
    }

    constructor() public GovernanceLockable(address(0x0)) {}

    function migrateValidatorsData(uint256 validatorIdFrom, uint256 validatorIdTo) external {
        for (uint256 i = validatorIdFrom; i < validatorIdTo; ++i) {
            ValidatorShare contractAddress = ValidatorShare(validators[i].contractAddress);
            if (contractAddress != ValidatorShare(0)) {
                // move validator rewards out from ValidatorShare contract
                validators[i].reward = contractAddress.validatorRewards_deprecated().add(INITIALIZED_AMOUNT);
                validators[i].delegatedAmount = contractAddress.activeAmount();
                validators[i].commissionRate = contractAddress.commissionRate_deprecated();
            } else {
                validators[i].reward = validators[i].reward.add(INITIALIZED_AMOUNT);
            }

            validators[i].delegatorsReward = INITIALIZED_AMOUNT;
        }
    }

    function updateCheckpointRewardParams(
        uint256 _rewardDecreasePerCheckpoint,
        uint256 _maxRewardedCheckpoints,
        uint256 _checkpointRewardDelta
    ) external {
        require(_maxRewardedCheckpoints.mul(_rewardDecreasePerCheckpoint) <= CHK_REWARD_PRECISION);
        require(_checkpointRewardDelta <= CHK_REWARD_PRECISION);

        rewardDecreasePerCheckpoint = _rewardDecreasePerCheckpoint;
        maxRewardedCheckpoints = _maxRewardedCheckpoints;
        checkpointRewardDelta = _checkpointRewardDelta;

        _getOrCacheEventsHub().logRewardParams(
            _rewardDecreasePerCheckpoint, _maxRewardedCheckpoints, _checkpointRewardDelta
        );
    }

    function updateCommissionRate(uint256 validatorId, uint256 newCommissionRate) external {
        uint256 _epoch = currentEpoch;
        uint256 _lastCommissionUpdate = validators[validatorId].lastCommissionUpdate;

        require( // withdrawalDelay == dynasty
            (_lastCommissionUpdate.add(WITHDRAWAL_DELAY) <= _epoch) || _lastCommissionUpdate == 0, // For initial
                // setting of commission rate
            "Cooldown"
        );

        require(newCommissionRate <= MAX_COMMISION_RATE, "Incorrect value");
        _getOrCacheEventsHub().logUpdateCommissionRate(
            validatorId, newCommissionRate, validators[validatorId].commissionRate
        );
        validators[validatorId].commissionRate = newCommissionRate;
        validators[validatorId].lastCommissionUpdate = _epoch;
    }

    function _getOrCacheEventsHub() private returns (EventsHub) {
        EventsHub _eventsHub = EventsHub(eventsHub);
        if (_eventsHub == EventsHub(0x0)) {
            _eventsHub = EventsHub(Registry(registry).contractMap(keccak256("eventsHub")));
            eventsHub = address(_eventsHub);
        }
        return _eventsHub;
    }

    function finalizeCommit() external {
        _finalizeCommit();
    }

    function updateRewards(uint256 validatorId) external {
        _updateRewardsAndCommit(validatorId, rewardPerStake, rewardPerStake);
    }

    function checkSignatures(
        uint256 blockInterval,
        bytes32 voteHash,
        bytes32 stateRoot,
        address proposer,
        uint256[3][] calldata sigs
    ) external returns (uint256) {
        IValidatorSetCommitment commitment = validatorSetCommitment;
        require(address(commitment) != address(0), "no commitment");

        uint256 committedTotalPower = commitment.totalPower();
        require(committedTotalPower > 0, "empty committed set");

        address[] memory committedSigners = commitment.getSigners();
        uint256 signedStakePower;
        address lastAdd;

        UnsignedValidatorsContext memory unsignedCtx;
        unsignedCtx.unsignedValidators = new uint256[](committedSigners.length);
        unsignedCtx.validators = committedSigners;
        unsignedCtx.validatorIndex = 0;
        unsignedCtx.totalValidators = committedSigners.length;

        for (uint256 i = 0; i < sigs.length; ++i) {
            address signer = ECVerify.ecrecovery(voteHash, sigs[i]);

            if (signer == lastAdd) {
                continue;
            }

            require(signer > lastAdd, "signatures not sorted ascending");

            if (!commitment.isActiveSigner(signer)) {
                continue;
            }

            lastAdd = signer;
            signedStakePower = signedStakePower.add(commitment.getSignerPower(signer));
            unsignedCtx = _fillUnsignedValidators(unsignedCtx, signer);
        }

        unsignedCtx = _fillUnsignedValidators(unsignedCtx, address(0));

        return _increaseRewardAndAssertConsensus(
            blockInterval,
            proposer,
            signedStakePower,
            committedTotalPower,
            stateRoot,
            unsignedCtx.unsignedValidators,
            unsignedCtx.unsignedValidatorIndex
        );
    }

    function _fillUnsignedValidators(
        UnsignedValidatorsContext memory context,
        address signer
    ) private view returns (UnsignedValidatorsContext memory) {
        while (context.validatorIndex < context.totalValidators && context.validators[context.validatorIndex] != signer)
        {
            context.unsignedValidators[context.unsignedValidatorIndex] =
                signerToValidator[context.validators[context.validatorIndex]];
            context.unsignedValidatorIndex++;
            context.validatorIndex++;
        }

        context.validatorIndex++;
        return context;
    }

    function _calculateCheckpointReward(
        uint256 blockInterval,
        uint256 signedStakePower,
        uint256 currentTotalStake
    ) private returns (uint256) {
        uint256 targetBlockInterval = checkPointBlockInterval;
        uint256 ckpReward = CHECKPOINT_REWARD;
        uint256 fullIntervals = Math.min(blockInterval / targetBlockInterval, maxRewardedCheckpoints);

        if (fullIntervals > 0 && fullIntervals != prevBlockInterval) {
            if (prevBlockInterval != 0) {
                uint256 delta = (ckpReward * checkpointRewardDelta / CHK_REWARD_PRECISION);

                if (prevBlockInterval > fullIntervals) {
                    ckpReward += delta;
                } else {
                    ckpReward -= delta;
                }
            }

            prevBlockInterval = fullIntervals;
        }

        uint256 reward;

        if (blockInterval > targetBlockInterval) {
            uint256 _rewardDecreasePerCheckpoint = rewardDecreasePerCheckpoint;

            reward = ckpReward.mul(fullIntervals).sub(
                ckpReward.mul(((fullIntervals - 1) * fullIntervals / 2).mul(_rewardDecreasePerCheckpoint)).div(
                    CHK_REWARD_PRECISION
                )
            );
            blockInterval = blockInterval.sub(fullIntervals.mul(targetBlockInterval));
            ckpReward =
                ckpReward.sub(ckpReward.mul(fullIntervals).mul(_rewardDecreasePerCheckpoint).div(CHK_REWARD_PRECISION));
        }

        reward = reward.add(blockInterval.mul(ckpReward).div(targetBlockInterval));
        reward = reward.mul(signedStakePower).div(currentTotalStake);
        return reward;
    }

    function _increaseRewardAndAssertConsensus(
        uint256 blockInterval,
        address proposer,
        uint256 signedStakePower,
        uint256 committedTotalPower,
        bytes32 stateRoot,
        uint256[] memory unsignedValidators,
        uint256 totalUnsignedValidators
    ) private returns (uint256) {
        require(signedStakePower >= committedTotalPower.mul(2).div(3).add(1), "2/3+1 non-majority!");

        uint256 reward = _calculateCheckpointReward(blockInterval, signedStakePower, committedTotalPower);

        uint256 _proposerBonus = reward.mul(proposerBonus).div(MAX_PROPOSER_BONUS);
        uint256 proposerId = signerToValidator[proposer];

        Validator storage _proposer = validators[proposerId];
        _proposer.reward = _proposer.reward.add(_proposerBonus);

        accountStateRoot = stateRoot;

        uint256 newRewardPerStake =
            rewardPerStake.add(reward.sub(_proposerBonus).mul(REWARD_PRECISION).div(signedStakePower));

        _updateValidatorsRewards(unsignedValidators, totalUnsignedValidators, newRewardPerStake);

        rewardPerStake = newRewardPerStake;

        _finalizeCommit();
        return reward;
    }

    function _updateValidatorsRewards(
        uint256[] memory unsignedValidators,
        uint256 totalUnsignedValidators,
        uint256 newRewardPerStake
    ) private {
        uint256 currentRewardPerStake = rewardPerStake;
        for (uint256 i = 0; i < totalUnsignedValidators; ++i) {
            _updateRewardsAndCommit(unsignedValidators[i], currentRewardPerStake, newRewardPerStake);
        }
    }

    function _updateRewardsAndCommit(
        uint256 validatorId,
        uint256 currentRewardPerStake,
        uint256 newRewardPerStake
    ) private {
        uint256 deactivationEpoch = validators[validatorId].deactivationEpoch;
        if (deactivationEpoch != 0 && currentEpoch >= deactivationEpoch) {
            return;
        }

        uint256 initialRewardPerStake = validators[validatorId].initialRewardPerStake;

        if (initialRewardPerStake < currentRewardPerStake) {
            uint256 validatorsStake = validators[validatorId].amount;
            uint256 valDelegatedAmount = validators[validatorId].delegatedAmount;
            if (valDelegatedAmount > 0) {
                uint256 combinedStakePower = validatorsStake.add(valDelegatedAmount);
                _increaseValidatorRewardWithDelegation(
                    validatorId,
                    validatorsStake,
                    valDelegatedAmount,
                    _getEligibleValidatorReward(combinedStakePower, currentRewardPerStake, initialRewardPerStake)
                );
            } else {
                _increaseValidatorReward(
                    validatorId,
                    _getEligibleValidatorReward(validatorsStake, currentRewardPerStake, initialRewardPerStake)
                );
            }
        }

        if (newRewardPerStake > initialRewardPerStake) {
            validators[validatorId].initialRewardPerStake = newRewardPerStake;
        }
    }

    function _getEligibleValidatorReward(
        uint256 validatorStakePower,
        uint256 currentRewardPerStake,
        uint256 initialRewardPerStake
    ) private pure returns (uint256) {
        uint256 eligibleReward = currentRewardPerStake - initialRewardPerStake;
        return eligibleReward.mul(validatorStakePower).div(REWARD_PRECISION);
    }

    function _increaseValidatorReward(uint256 validatorId, uint256 reward) private {
        if (reward > 0) {
            validators[validatorId].reward = validators[validatorId].reward.add(reward);
        }
    }

    function _increaseValidatorRewardWithDelegation(
        uint256 validatorId,
        uint256 validatorsStake,
        uint256 valDelegatedAmount,
        uint256 reward
    ) private {
        uint256 combinedStakePower = valDelegatedAmount.add(validatorsStake);
        (uint256 valReward, uint256 delReward) =
            _getValidatorAndDelegationReward(validatorId, validatorsStake, reward, combinedStakePower);

        if (delReward > 0) {
            validators[validatorId].delegatorsReward = validators[validatorId].delegatorsReward.add(delReward);
        }

        if (valReward > 0) {
            validators[validatorId].reward = validators[validatorId].reward.add(valReward);
        }
    }

    function _getValidatorAndDelegationReward(
        uint256 validatorId,
        uint256 validatorsStake,
        uint256 reward,
        uint256 combinedStakePower
    ) private view returns (uint256, uint256) {
        if (combinedStakePower == 0) {
            return (0, 0);
        }

        uint256 valReward = validatorsStake.mul(reward).div(combinedStakePower);

        uint256 commissionRate = validators[validatorId].commissionRate;
        if (commissionRate > 0) {
            valReward = valReward.add(reward.sub(valReward).mul(commissionRate).div(MAX_COMMISION_RATE));
        }

        uint256 delReward = reward.sub(valReward);
        return (valReward, delReward);
    }

    function _finalizeCommit() private {
        uint256 _currentEpoch = currentEpoch;
        uint256 nextEpoch = _currentEpoch.add(1);

        StateChange memory changes = validatorStateChanges[nextEpoch];
        updateTimeline(changes.amount, changes.stakerCount, 0);

        delete validatorStateChanges[_currentEpoch];

        currentEpoch = nextEpoch;
    }

    function updateTimeline(int256 amount, int256 stakerCount, uint256 targetEpoch) private {
        if (targetEpoch == 0) {
            if (amount > 0) {
                validatorState.amount = validatorState.amount.add(uint256(amount));
            } else if (amount < 0) {
                validatorState.amount = validatorState.amount.sub(uint256(amount * -1));
            }

            if (stakerCount > 0) {
                validatorState.stakerCount = validatorState.stakerCount.add(uint256(stakerCount));
            } else if (stakerCount < 0) {
                validatorState.stakerCount = validatorState.stakerCount.sub(uint256(stakerCount * -1));
            }
        } else {
            validatorStateChanges[targetEpoch].amount += amount;
            validatorStateChanges[targetEpoch].stakerCount += stakerCount;
        }
    }

    function finalizeStakeFor(
        address user,
        uint256 amount,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) private {
        address signer = _getAndAssertSigner(signerPubkey);
        uint256 _currentEpoch = currentEpoch;
        uint256 validatorId = NFTCounter;
        uint256 newTotalStaked = totalStaked.add(amount);
        totalStaked = newTotalStaked;

        _writeValidatorSlot(validatorId, amount, _currentEpoch, signer, acceptDelegation);

        latestSignerUpdateEpoch[validatorId] = _currentEpoch;
        NFTContract.mint(user, validatorId);

        signerToValidator[signer] = validatorId;
        updateTimeline(int256(amount), 1, 0);
        logger.logStaked(signer, signerPubkey, validatorId, _currentEpoch, amount, newTotalStaked);
        NFTCounter = validatorId.add(1);

        _insertSigner(signer);
    }

    function stakeFor(
        address user,
        uint256 amount,
        uint256 giltconsensusFee,
        bool acceptDelegation,
        bytes calldata signerPubkey,
        bool pol
    ) external {
        require(validatorState.stakerCount < validatorThreshold, "no more slots");
        require(amount >= minDeposit, "not enough deposit");
        _transferAndTopUp(user, msg.sender, giltconsensusFee, amount, pol);
        finalizeStakeFor(user, amount, acceptDelegation, signerPubkey);
    }

    function _transferAndTopUp(address user, address from, uint256 fee, uint256 additionalAmount, bool pol) private {
        require(fee >= minGiltConsensusFee, "fee too small");
        _transferTokenFrom(from, address(this), fee.add(additionalAmount), pol);
        totalGiltConsensusFee = totalGiltConsensusFee.add(fee);
        logger.logTopUpFee(user, fee);
    }

    function _transferTokenFrom(address from, address destination, uint256 amount, bool pol) private {
        IERC20 token_ = _getToken(pol);
        require(token_.transferFrom(from, destination, amount), "transfer from failed");
        if (!pol && destination == address(this)) {
            _convertLegacyTokenToPOL(amount);
        }
    }

    function _getToken(bool pol) private view returns (IERC20 token_) {
        token_ = pol ? token : tokenLegacyToken;
    }

    function _convertLegacyTokenToPOL(uint256 amount) private {
        require(tokenLegacyToken.balanceOf(address(this)) >= amount, "Lacking LEGACY_TOKEN");
        tokenLegacyToken.approve(address(migration), amount);
        migration.migrate(amount);
    }

    function _convertPOLToLegacyToken(uint256 amount) private {
        require(token.balanceOf(address(this)) >= amount, "Lacking POL");
        token.approve(address(migration), amount);
        migration.unmigrate(amount);
    }

    function _getAndAssertSigner(bytes memory pub) private view returns (address) {
        require(pub.length == 64, "not pub");
        address signer = address(uint160(uint256(keccak256(pub))));
        require(signer != address(0) && signerToValidator[signer] == 0, "Invalid signer");
        return signer;
    }

    function _writeValidatorSlot(
        uint256 validatorId,
        uint256 amount,
        uint256 _currentEpoch,
        address signer,
        bool acceptDelegation
    ) private {
        StakingInfo _logger = logger;
        validators[validatorId] = Validator({
            reward: INITIALIZED_AMOUNT,
            amount: amount,
            activationEpoch: _currentEpoch,
            deactivationEpoch: 0,
            jailTime: 0,
            signer: signer,
            contractAddress: acceptDelegation
                ? validatorShareFactory.create(validatorId, address(_logger), registry)
                : address(0x0),
            status: Status.Active,
            commissionRate: 0,
            lastCommissionUpdate: 0,
            delegatorsReward: INITIALIZED_AMOUNT,
            delegatedAmount: 0,
            initialRewardPerStake: rewardPerStake
        });
    }

    function _insertSigner(address newSigner) private {
        signers.push(newSigner);

        uint256 lastIndex = signers.length - 1;
        uint256 i = lastIndex;
        for (; i > 0; --i) {
            address signer = signers[i - 1];
            if (signer < newSigner) {
                break;
            }
            signers[i] = signer;
        }

        if (i != lastIndex) {
            signers[i] = newSigner;
        }
    }
}
