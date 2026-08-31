pragma solidity 0.5.17;

import {IERC20} from "../../common/oz/token/ERC20/IERC20.sol";
import {Math} from "../../common/oz/math/Math.sol";
import {SafeMath} from "../../common/oz/math/SafeMath.sol";

import {Merkle} from "../../common/lib/Merkle.sol";
import {GovernanceLockable} from "../../common/mixin/GovernanceLockable.sol";
import {DelegateProxyForwarder} from "../../common/misc/DelegateProxyForwarder.sol";
import {IStakeManager} from "./IStakeManager.sol";
import {IValidatorShare} from "../validatorShare/IValidatorShare.sol";
import {StakingInfo} from "../StakingInfo.sol";
import {StakingNFT} from "./StakingNFT.sol";
import {ValidatorShareFactory} from "../validatorShare/ValidatorShareFactory.sol";
import {StakeManagerStorage} from "./StakeManagerStorage.sol";
import {StakeManagerStorageExtension} from "./StakeManagerStorageExtension.sol";
import {RootStakeStateSyncLib} from "./RootStakeStateSyncLib.sol";
import {IGovernance} from "../../common/governance/IGovernance.sol";
import {Initializable} from "../../common/mixin/Initializable.sol";
import {StakeManagerExtension} from "./StakeManagerExtension.sol";
import {IGiltMigration} from "../../common/misc/IGiltMigration.sol";
import {IValidatorSetCommitment} from "../IValidatorSetCommitment.sol";

contract StakeManager is
    StakeManagerStorage,
    Initializable,
    IStakeManager,
    DelegateProxyForwarder,
    StakeManagerStorageExtension
{
    using SafeMath for uint256;
    using Merkle for bytes32;

    modifier onlyStaker(uint256 validatorId) {
        _assertStaker(validatorId);
        _;
    }

    function _assertStaker(uint256 validatorId) private view {
        require(NFTContract.ownerOf(validatorId) == msg.sender);
    }

    modifier onlyDelegation(uint256 validatorId) {
        _assertDelegation(validatorId);
        _;
    }

    function _assertDelegation(uint256 validatorId) private view {
        require(validators[validatorId].contractAddress == msg.sender, "Invalid contract address");
    }

    constructor() public GovernanceLockable(address(0x0)) {
        _disableInitializer();
    }

    function initialize(
        address _registry,
        address _rootchain,
        address _tokenLegacy,
        address _NFTContract,
        address _stakingLogger,
        address _validatorShareFactory,
        address _governance,
        address _owner,
        address _extensionCode,
        address _token,
        address _migration,
        address _validatorSetCommitment
    ) external initializer {
        require(isContract(_extensionCode), "extension impl incorrect");
        extensionCode = _extensionCode;
        governance = IGovernance(_governance);
        registry = _registry;
        rootChain = _rootchain;
        token = IERC20(_token);
        tokenLegacyToken = IERC20(_tokenLegacy);
        migration = IGiltMigration(_migration);
        if (_validatorSetCommitment != address(0)) {
            validatorSetCommitment = IValidatorSetCommitment(_validatorSetCommitment);
        }
        NFTContract = StakingNFT(_NFTContract);
        logger = StakingInfo(_stakingLogger);
        validatorShareFactory = ValidatorShareFactory(_validatorShareFactory);
        _transferOwnership(_owner);

        WITHDRAWAL_DELAY = (2 ** 13); // unit: epoch
        currentEpoch = 1;
        dynasty = 886; // unit: epoch 50 days
        CHECKPOINT_REWARD = 20_188 * (10 ** 18); // update via governance
        minDeposit = (10 ** 18); // in ERC20 token
        minGiltConsensusFee = (10 ** 18); // in ERC20 token
        checkPointBlockInterval = 1024;
        signerUpdateLimit = 100;

        validatorThreshold = 7; //128
        NFTCounter = 1;
        proposerBonus = 10; // 10 % of total rewards
        delegationEnabled = true;
    }

    function isOwner() public view returns (bool) {
        address _owner;
        bytes32 position = keccak256("gilt.network.proxy.owner");
        assembly {
            _owner := sload(position)
        }
        return msg.sender == _owner;
    }

    /**
     * Public View Methods
     */
    function getRegistry() public view returns (address) {
        return registry;
    }

    /**
     * @dev Owner of validator slot NFT
     */
    function ownerOf(uint256 tokenId) public view returns (address) {
        return NFTContract.ownerOf(tokenId);
    }

    function epoch() public view returns (uint256) {
        return currentEpoch;
    }

    function withdrawalDelay() public view returns (uint256) {
        return WITHDRAWAL_DELAY;
    }

    function validatorStake(uint256 validatorId) public view returns (uint256) {
        return validators[validatorId].amount;
    }

    function getValidatorId(address user) public view returns (uint256) {
        return NFTContract.tokenOfOwnerByIndex(user, 0);
    }

    function delegatedAmount(uint256 validatorId) public view returns (uint256) {
        return validators[validatorId].delegatedAmount;
    }

    function delegatorsReward(uint256 validatorId) public view returns (uint256) {
        uint256 _delegatorsReward;
        if (validators[validatorId].deactivationEpoch == 0) {
            (, _delegatorsReward) = _evaluateValidatorAndDelegationReward(validatorId);
        }
        return validators[validatorId].delegatorsReward.add(_delegatorsReward).sub(INITIALIZED_AMOUNT);
    }

    function validatorReward(uint256 validatorId) public view returns (uint256) {
        uint256 _validatorReward;
        if (validators[validatorId].deactivationEpoch == 0) {
            (_validatorReward,) = _evaluateValidatorAndDelegationReward(validatorId);
        }
        return validators[validatorId].reward.add(_validatorReward).sub(INITIALIZED_AMOUNT);
    }

    function currentValidatorSetSize() public view returns (uint256) {
        return validatorState.stakerCount;
    }

    function currentValidatorSetTotalStake() public view returns (uint256) {
        return validatorState.amount;
    }

    function getValidatorContract(uint256 validatorId) public view returns (address) {
        return validators[validatorId].contractAddress;
    }

    function isValidator(uint256 validatorId) public view returns (bool) {
        return _isValidator(
            validators[validatorId].status,
            validators[validatorId].amount,
            validators[validatorId].deactivationEpoch,
            currentEpoch
        );
    }

    /**
     * Governance Methods
     */
    function setDelegationEnabled(bool enabled) public onlyGovernance {
        delegationEnabled = enabled;
    }

    function setValidatorSetCommitment(address _commitment) external onlyGovernance {
        require(_commitment != address(0), "zero commitment");
        validatorSetCommitment = IValidatorSetCommitment(_commitment);
    }

    function setRootStakeStateSync(address _stateSender, address _childStakeHub) external onlyGovernance {
        stateSender = _stateSender;
        childStakeHub = _childStakeHub;
    }

    /**
     * @dev Change the number of validators required to allow a passed header root
     */
    function updateValidatorThreshold(uint256 newThreshold) public onlyGovernance {
        require(newThreshold != 0);
        logger.logThresholdChange(newThreshold, validatorThreshold);
        validatorThreshold = newThreshold;
    }

    function updateCheckPointBlockInterval(uint256 _blocks) public onlyGovernance {
        require(_blocks != 0);
        checkPointBlockInterval = _blocks;
    }

    function updateCheckpointReward(uint256 newReward) public onlyGovernance {
        require(newReward != 0);
        logger.logRewardUpdate(newReward, CHECKPOINT_REWARD);
        CHECKPOINT_REWARD = newReward;
    }

    function updateCheckpointRewardParams(
        uint256 _rewardDecreasePerCheckpoint,
        uint256 _maxRewardedCheckpoints,
        uint256 _checkpointRewardDelta
    ) public onlyGovernance {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).updateCheckpointRewardParams.selector,
                _rewardDecreasePerCheckpoint,
                _maxRewardedCheckpoints,
                _checkpointRewardDelta
            )
        );
    }

    // New implementation upgrade

    function migrateValidatorsData(uint256 validatorIdFrom, uint256 validatorIdTo) public onlyOwner {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).migrateValidatorsData.selector, validatorIdFrom, validatorIdTo
            )
        );
    }

    /**
     * @dev Users must exit before this update or all funds may get lost
     */
    function updateValidatorContractAddress(uint256 validatorId, address newContractAddress) public onlyGovernance {
        require(IValidatorShare(newContractAddress).owner() == address(this));
        validators[validatorId].contractAddress = newContractAddress;
    }

    function updateDynastyValue(uint256 newDynasty) public onlyGovernance {
        require(newDynasty > 0);
        logger.logDynastyValueChange(newDynasty, dynasty);
        dynasty = newDynasty;
        WITHDRAWAL_DELAY = newDynasty;
    }

    function updateProposerBonus(uint256 newProposerBonus) public onlyGovernance {
        logger.logProposerBonusChange(newProposerBonus, proposerBonus);
        require(newProposerBonus <= MAX_PROPOSER_BONUS, "too big");
        proposerBonus = newProposerBonus;
    }

    function updateSignerUpdateLimit(uint256 _limit) public onlyGovernance {
        signerUpdateLimit = _limit;
    }

    function updateMinAmounts(uint256 _minDeposit, uint256 _minGiltConsensusFee) public onlyGovernance {
        minDeposit = _minDeposit;
        minGiltConsensusFee = _minGiltConsensusFee;
    }

    /**
     * Public Methods
     */
    function topUpForFee(address user, uint256 giltconsensusFee) public onlyWhenUnlocked {
        _transferAndTopUp(user, msg.sender, giltconsensusFee, 0, true);
    }

    function claimFee(uint256 accumFeeAmount, uint256 index, bytes memory proof) public {
        require(
            keccak256(abi.encode(msg.sender, accumFeeAmount)).checkMembership(index, accountStateRoot, proof),
            "Wrong acc proof"
        );
        uint256 withdrawAmount = accumFeeAmount.sub(userFeeExit[msg.sender]);
        totalGiltConsensusFee = totalGiltConsensusFee.sub(withdrawAmount);
        logger.logClaimFee(msg.sender, withdrawAmount);
        userFeeExit[msg.sender] = accumFeeAmount;
        _transferToken(msg.sender, withdrawAmount, true);
    }

    function totalStakedFor(address user) external view returns (uint256) {
        if (user == address(0x0) || NFTContract.balanceOf(user) == 0) {
            return 0;
        }
        return validators[NFTContract.tokenOfOwnerByIndex(user, 0)].amount;
    }

    function unstake(uint256 validatorId) external onlyStaker(validatorId) {
        _unstakeValidator(validatorId, false);
    }

    function unstakePOL(uint256 validatorId) external onlyStaker(validatorId) {
        _unstakeValidator(validatorId, true);
    }

    function _unstakeValidator(uint256 validatorId, bool pol) internal {
        Status status = validators[validatorId].status;
        require(
            validators[validatorId].activationEpoch > 0 && validators[validatorId].deactivationEpoch == 0
                && (status == Status.Active || status == Status.Locked)
        );

        uint256 exitEpoch = currentEpoch.add(1); // notice period
        _unstake(validatorId, exitEpoch, pol);
    }

    function transferFunds(uint256 validatorId, uint256 amount, address delegator) external returns (bool) {
        return _transferFunds(validatorId, amount, delegator, false);
    }

    function transferFundsPOL(uint256 validatorId, uint256 amount, address delegator) external returns (bool) {
        return _transferFunds(validatorId, amount, delegator, true);
    }

    function _transferFunds(uint256 validatorId, uint256 amount, address delegator, bool pol) internal returns (bool) {
        require(validators[validatorId].contractAddress == msg.sender, "not allowed");
        if (!pol) _convertPOLToLegacyToken(amount);
        IERC20 token_ = _getToken(pol);
        return token_.transfer(delegator, amount);
    }

    function delegationDeposit(
        uint256 validatorId,
        uint256 amount,
        address delegator
    ) external onlyDelegation(validatorId) returns (bool) {
        return _delegationDeposit(amount, delegator, false);
    }

    function delegationDepositPOL(
        uint256 validatorId,
        uint256 amount,
        address delegator
    ) external onlyDelegation(validatorId) returns (bool) {
        return _delegationDeposit(amount, delegator, true);
    }

    function _delegationDeposit(uint256 amount, address delegator, bool pol) internal returns (bool) {
        IERC20 token_ = _getToken(pol);
        bool result = token_.transferFrom(delegator, address(this), amount);
        if (!pol) _convertLegacyTokenToPOL(amount);
        return result;
    }

    function stakeFor(
        address user,
        uint256 amount,
        uint256 giltconsensusFee,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) public onlyWhenUnlocked {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).stakeFor.selector,
                user,
                amount,
                giltconsensusFee,
                acceptDelegation,
                signerPubkey,
                false
            )
        );
    }

    function stakeForPOL(
        address user,
        uint256 amount,
        uint256 giltconsensusFee,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) public onlyWhenUnlocked {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).stakeFor.selector,
                user,
                amount,
                giltconsensusFee,
                acceptDelegation,
                signerPubkey,
                true
            )
        );
    }

    function unstakeClaim(uint256 validatorId) public onlyStaker(validatorId) {
        _unstakeClaim(validatorId, false);
    }

    function unstakeClaimPOL(uint256 validatorId) public onlyStaker(validatorId) {
        _unstakeClaim(validatorId, true);
    }

    function _unstakeClaim(uint256 validatorId, bool pol) internal {
        uint256 deactivationEpoch = validators[validatorId].deactivationEpoch;
        // can only claim stake back after WITHDRAWAL_DELAY
        require(
            deactivationEpoch > 0 && deactivationEpoch.add(WITHDRAWAL_DELAY) <= currentEpoch
                && validators[validatorId].status != Status.Unstaked
        );

        uint256 amount = validators[validatorId].amount;
        uint256 newTotalStaked = totalStaked.sub(amount);
        totalStaked = newTotalStaked;

        // claim last checkpoint reward if it was signed by validator
        _liquidateRewards(validatorId, msg.sender, pol);

        NFTContract.burn(validatorId);

        validators[validatorId].amount = 0;
        validators[validatorId].jailTime = 0;
        address signer = validators[validatorId].signer;
        validators[validatorId].signer = address(0);

        signerToValidator[signer] = INCORRECT_VALIDATOR_ID;
        validators[validatorId].status = Status.Unstaked;

        _transferToken(msg.sender, amount, pol);
        logger.logUnstaked(msg.sender, validatorId, amount, newTotalStaked);
        _maybeSyncRootStakeWithSigner(validatorId, signer, 0, 2);
    }

    function restake(
        uint256 validatorId,
        uint256 amount,
        bool stakeRewards
    ) public onlyWhenUnlocked onlyStaker(validatorId) {
        _restake(validatorId, amount, stakeRewards, false);
    }

    function restakePOL(
        uint256 validatorId,
        uint256 amount,
        bool stakeRewards
    ) public onlyWhenUnlocked onlyStaker(validatorId) {
        _restake(validatorId, amount, stakeRewards, true);
    }

    function _restake(uint256 validatorId, uint256 amount, bool stakeRewards, bool pol) internal {
        require(validators[validatorId].deactivationEpoch == 0, "No restaking");

        if (amount > 0) {
            _transferTokenFrom(msg.sender, address(this), amount, pol);
        }

        _updateRewards(validatorId);

        if (stakeRewards) {
            amount = amount.add(validators[validatorId].reward).sub(INITIALIZED_AMOUNT);
            validators[validatorId].reward = INITIALIZED_AMOUNT;
        }

        uint256 newTotalStaked = totalStaked.add(amount);
        totalStaked = newTotalStaked;
        validators[validatorId].amount = validators[validatorId].amount.add(amount);

        updateTimeline(int256(amount), 0, 0);

        logger.logStakeUpdate(validatorId);
        logger.logRestaked(validatorId, validators[validatorId].amount, newTotalStaked);
        _maybeSyncRootStake(validatorId);
    }

    function withdrawRewards(uint256 validatorId) public onlyStaker(validatorId) {
        _withdrawRewards(validatorId, false);
    }

    function withdrawRewardsPOL(uint256 validatorId) public onlyStaker(validatorId) {
        _withdrawRewards(validatorId, true);
    }

    function _withdrawRewards(uint256 validatorId, bool pol) internal {
        _updateRewards(validatorId);
        _liquidateRewards(validatorId, msg.sender, pol);
    }

    function migrateDelegation(uint256 fromValidatorId, uint256 toValidatorId, uint256 amount) public {
        // allow to move to any non-foundation node
        require(toValidatorId > 7, "Invalid migration");
        IValidatorShare(validators[fromValidatorId].contractAddress).migrateOut(msg.sender, amount);
        IValidatorShare(validators[toValidatorId].contractAddress).migrateIn(msg.sender, amount);
    }

    function updateValidatorState(uint256 validatorId, int256 amount) public onlyDelegation(validatorId) {
        if (amount > 0) {
            // deposit during shares purchase
            require(delegationEnabled, "Delegation is disabled");
        }

        uint256 deactivationEpoch = validators[validatorId].deactivationEpoch;

        if (deactivationEpoch == 0) {
            // modify timeline only if validator didn't unstake
            updateTimeline(amount, 0, 0);
        } else if (deactivationEpoch > currentEpoch) {
            // validator just unstaked, need to wait till next checkpoint
            revert("unstaking");
        }

        if (amount >= 0) {
            increaseValidatorDelegatedAmount(validatorId, uint256(amount));
        } else {
            decreaseValidatorDelegatedAmount(validatorId, uint256(amount * -1));
        }
    }

    function increaseValidatorDelegatedAmount(uint256 validatorId, uint256 amount) private {
        validators[validatorId].delegatedAmount = validators[validatorId].delegatedAmount.add(amount);
    }

    function decreaseValidatorDelegatedAmount(uint256 validatorId, uint256 amount) public onlyDelegation(validatorId) {
        validators[validatorId].delegatedAmount = validators[validatorId].delegatedAmount.sub(amount);
    }

    function updateSigner(uint256 validatorId, bytes memory signerPubkey) public onlyStaker(validatorId) {
        address signer = _getAndAssertSigner(signerPubkey);
        uint256 _currentEpoch = currentEpoch;
        require(_currentEpoch >= latestSignerUpdateEpoch[validatorId].add(signerUpdateLimit), "Not allowed");

        address currentSigner = validators[validatorId].signer;
        // update signer event
        logger.logSignerChange(validatorId, currentSigner, signer, signerPubkey);

        if (validators[validatorId].deactivationEpoch == 0) {
            // didn't unstake, swap signer in the list
            _removeSigner(currentSigner);
            _insertSigner(signer);
        }

        signerToValidator[currentSigner] = INCORRECT_VALIDATOR_ID;
        signerToValidator[signer] = validatorId;
        validators[validatorId].signer = signer;

        // reset update time to current time
        latestSignerUpdateEpoch[validatorId] = _currentEpoch;
        _maybeSyncRootStake(validatorId);
    }

    function setRootSlashRelayEnabled(bool enabled) external onlyGovernance {
        rootSlashRelayEnabled = enabled;
    }

    function setSlashAmounts(uint256 _downtimeSlashAmount, uint256 _felonySlashAmount) external onlyGovernance {
        require(_downtimeSlashAmount > 0, "zero downtime slash");
        require(_felonySlashAmount > 0, "zero felony slash");
        downtimeSlashAmount = _downtimeSlashAmount;
        felonySlashAmount = _felonySlashAmount;
    }

    function applyCutoverShares(
        uint256 validatorId,
        address[] calldata delegators,
        uint256[] calldata amounts
    ) external onlyGovernance {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerCutover(extensionCode).applyCutoverShares.selector, validatorId, delegators, amounts
            )
        );
    }

    function relaySlash(bytes calldata data, uint256[3][] calldata sigs) external {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(StakeManagerExtension(extensionCode).relaySlash.selector, data, sigs)
        );
    }

    function checkSignatures(
        uint256 blockInterval,
        bytes32 voteHash,
        bytes32 stateRoot,
        address proposer,
        uint256[3][] calldata sigs
    ) external onlyRootChain returns (uint256) {
        require(address(validatorSetCommitment) != address(0), "no commitment");
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).checkSignatures.selector,
                blockInterval,
                voteHash,
                stateRoot,
                proposer,
                sigs
            )
        );
    }

    function updateCommissionRate(uint256 validatorId, uint256 newCommissionRate) external onlyStaker(validatorId) {
        _updateRewards(validatorId);

        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(
                StakeManagerExtension(extensionCode).updateCommissionRate.selector, validatorId, newCommissionRate
            )
        );
    }

    function withdrawDelegatorsReward(uint256 validatorId) public onlyDelegation(validatorId) returns (uint256) {
        _updateRewards(validatorId);

        uint256 totalReward = validators[validatorId].delegatorsReward.sub(INITIALIZED_AMOUNT);
        validators[validatorId].delegatorsReward = INITIALIZED_AMOUNT;
        return totalReward;
    }

    function updateTimeline(int256 amount, int256 stakerCount, uint256 targetEpoch) internal {
        if (targetEpoch == 0) {
            // update total stake and validator count
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

    function updateValidatorDelegation(bool delegation) external {
        uint256 validatorId = signerToValidator[msg.sender];
        require(
            _isValidator(
                validators[validatorId].status,
                validators[validatorId].amount,
                validators[validatorId].deactivationEpoch,
                currentEpoch
            ),
            "not validator"
        );

        address contractAddr = validators[validatorId].contractAddress;
        require(contractAddr != address(0x0), "Delegation is disabled");

        IValidatorShare(contractAddr).updateDelegation(delegation);
    }

    /**
     * Private Methods
     */
    function _getAndAssertSigner(bytes memory pub) private view returns (address) {
        require(pub.length == 64, "not pub");
        address signer = address(uint160(uint256(keccak256(pub))));
        require(signer != address(0) && signerToValidator[signer] == 0, "Invalid signer");
        return signer;
    }

    function _isValidator(
        Status status,
        uint256 amount,
        uint256 deactivationEpoch,
        uint256 _currentEpoch
    ) private pure returns (bool) {
        return (amount > 0 && (deactivationEpoch == 0 || deactivationEpoch > _currentEpoch) && status == Status.Active);
    }

    function _updateRewards(uint256 validatorId) private {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(StakeManagerExtension(extensionCode).updateRewards.selector, validatorId)
        );
    }

    function _getValidatorAndDelegationReward(
        uint256 validatorId,
        uint256 validatorsStake,
        uint256 reward,
        uint256 combinedStakePower
    ) internal view returns (uint256, uint256) {
        if (combinedStakePower == 0) {
            return (0, 0);
        }

        uint256 valReward = validatorsStake.mul(reward).div(combinedStakePower);

        // add validator commission from delegation reward
        uint256 commissionRate = validators[validatorId].commissionRate;
        if (commissionRate > 0) {
            valReward = valReward.add(reward.sub(valReward).mul(commissionRate).div(MAX_COMMISION_RATE));
        }

        uint256 delReward = reward.sub(valReward);
        return (valReward, delReward);
    }

    function _evaluateValidatorAndDelegationReward(uint256 validatorId)
        private
        view
        returns (uint256 valReward, uint256 delReward)
    {
        uint256 validatorsStake = validators[validatorId].amount;
        uint256 combinedStakePower = validatorsStake.add(validators[validatorId].delegatedAmount);
        uint256 eligibleReward = rewardPerStake - validators[validatorId].initialRewardPerStake;
        return _getValidatorAndDelegationReward(
            validatorId,
            validatorsStake,
            eligibleReward.mul(combinedStakePower).div(REWARD_PRECISION),
            combinedStakePower
        );
    }

    function _unstake(uint256 validatorId, uint256 exitEpoch, bool pol) internal {
        require(validators[validatorId].deactivationEpoch == 0);

        _updateRewards(validatorId);

        uint256 amount = validators[validatorId].amount;
        address validator = ownerOf(validatorId);

        validators[validatorId].deactivationEpoch = exitEpoch;

        // unbond all delegators in future
        int256 delegationAmount = int256(validators[validatorId].delegatedAmount);

        address delegationContract = validators[validatorId].contractAddress;
        if (delegationContract != address(0)) {
            IValidatorShare(delegationContract).lock();
        }

        _removeSigner(validators[validatorId].signer);
        _liquidateRewards(validatorId, validator, pol);

        uint256 targetEpoch = exitEpoch <= currentEpoch ? 0 : exitEpoch;
        updateTimeline(-(int256(amount) + delegationAmount), -1, targetEpoch);

        logger.logUnstakeInit(validator, validatorId, exitEpoch, amount);
        _maybeSyncRootStake(validatorId, amount);
    }

    function _finalizeCommit() internal {
        delegatedFwd(
            extensionCode,
            abi.encodeWithSelector(StakeManagerExtension(extensionCode).finalizeCommit.selector)
        );
    }

    function _liquidateRewards(uint256 validatorId, address validatorUser, bool pol) private {
        uint256 reward = validators[validatorId].reward.sub(INITIALIZED_AMOUNT);
        totalRewardsLiquidated = totalRewardsLiquidated.add(reward);
        validators[validatorId].reward = INITIALIZED_AMOUNT;
        _transferToken(validatorUser, reward, pol);
        logger.logClaimRewards(validatorId, reward, totalRewardsLiquidated);
    }

    function _transferToken(address destination, uint256 amount, bool pol) private {
        if (!pol) _convertPOLToLegacyToken(amount);
        IERC20 token_ = _getToken(pol);
        require(token_.transfer(destination, amount), "transfer failed");
    }

    // Do not use this function to transfer from self.
    function _transferTokenFrom(address from, address destination, uint256 amount, bool pol) private {
        IERC20 token_ = _getToken(pol);
        require(token_.transferFrom(from, destination, amount), "transfer from failed");
        if (!pol && destination == address(this)) _convertLegacyTokenToPOL(amount);
    }

    function _transferAndTopUp(address user, address from, uint256 fee, uint256 additionalAmount, bool pol) private {
        require(fee >= minGiltConsensusFee, "fee too small");
        _transferTokenFrom(from, address(this), fee.add(additionalAmount), pol);
        totalGiltConsensusFee = totalGiltConsensusFee.add(fee);
        logger.logTopUpFee(user, fee);
    }

    function _insertSigner(address newSigner) internal {
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

    function _removeSigner(address signerToDelete) internal {
        uint256 totalSigners = signers.length;
        address swapSigner = signers[totalSigners - 1];
        delete signers[totalSigners - 1];

        // bubble last element to the beginning until target signer is met
        for (uint256 i = totalSigners - 1; i > 0; --i) {
            if (swapSigner == signerToDelete) {
                break;
            }

            (swapSigner, signers[i - 1]) = (signers[i - 1], swapSigner);
        }

        signers.length = totalSigners - 1;
    }

    function convertLegacyTokenToPOL(uint256 amount) external onlyGovernance {
        _convertLegacyTokenToPOL(amount);
    }

    function _convertLegacyTokenToPOL(uint256 amount) internal {
        require(tokenLegacyToken.balanceOf(address(this)) >= amount, "Lacking LEGACY_TOKEN");
        tokenLegacyToken.approve(address(migration), amount);
        migration.migrate(amount);
    }

    function _convertPOLToLegacyToken(uint256 amount) internal {
        require(token.balanceOf(address(this)) >= amount, "Lacking POL");
        token.approve(address(migration), amount);
        migration.unmigrate(amount);
    }

    function _getToken(bool pol) internal view returns (IERC20 token_) {
        token_ = pol ? token : tokenLegacyToken;
    }

    function _maybeSyncRootStake(uint256 validatorId) private {
        StakeManagerStorage.Validator storage validator = validators[validatorId];
        RootStakeStateSyncLib.maybeSync(
            stateSender,
            childStakeHub,
            address(this),
            validatorId,
            validator.signer,
            logger.totalValidatorStake(validatorId),
            logger.validatorNonce(validatorId),
            RootStakeStateSyncLib.rootStakeStatus(validator.status)
        );
    }

    function _maybeSyncRootStake(uint256 validatorId, uint256 amount) private {
        StakeManagerStorage.Validator storage validator = validators[validatorId];
        RootStakeStateSyncLib.maybeSync(
            stateSender,
            childStakeHub,
            address(this),
            validatorId,
            validator.signer,
            amount,
            logger.validatorNonce(validatorId),
            RootStakeStateSyncLib.rootStakeStatus(validator.status)
        );
    }

    function _maybeSyncRootStakeWithSigner(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint8 status
    ) private {
        RootStakeStateSyncLib.maybeSync(
            stateSender,
            childStakeHub,
            address(this),
            validatorId,
            signer,
            amount,
            logger.validatorNonce(validatorId),
            status
        );
    }
}
