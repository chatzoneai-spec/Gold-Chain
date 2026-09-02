pragma solidity ^0.5.2;

import {Registry} from "../common/Registry.sol";
import {Ownable} from "../common/oz/ownership/Ownable.sol";

contract StakingInfo is Ownable {
    mapping(uint256 => uint256) public validatorNonce;

    /// @dev Emitted when validator stakes in '_stakeFor()'.
    /// @param signer validator address.
    /// @param validatorId unique integer to identify a validator.
    /// @param nonce to synchronize the events in heimdal.
    /// @param activationEpoch validator's first epoch as proposer.
    /// @param amount staking amount.
    /// @param total total staking amount.
    /// @param signerPubkey public key of the validator
    event Staked(
        address indexed signer,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 indexed activationEpoch,
        uint256 amount,
        uint256 total,
        bytes signerPubkey
    );

    /// @dev Emitted when validator unstakes in 'unstakeClaim()'
    /// @param user address of the validator.
    /// @param validatorId unique integer to identify a validator.
    /// @param amount staking amount.
    /// @param total total staking amount.
    event Unstaked(
        address indexed user,
        uint256 indexed validatorId,
        uint256 amount,
        uint256 total
    );

    /// @dev Emitted when validator unstakes in '_unstake()'.
    /// @param user address of the validator.
    /// @param validatorId unique integer to identify a validator.
    /// @param nonce to synchronize the events in heimdal.
    /// @param deactivationEpoch last epoch for validator.
    /// @param amount staking amount.
    event UnstakeInit(
        address indexed user,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 deactivationEpoch,
        uint256 indexed amount
    );

    /// @dev Emitted when the validator public key is updated in 'updateSigner()'.
    /// @param validatorId unique integer to identify a validator.
    /// @param nonce to synchronize the events in heimdal.
    /// @param oldSigner old address of the validator.
    /// @param newSigner new address of the validator.
    /// @param signerPubkey public key of the validator.
    event SignerChange(
        uint256 indexed validatorId,
        uint256 nonce,
        address indexed oldSigner,
        address indexed newSigner,
        bytes signerPubkey
    );
    event Restaked(uint256 indexed validatorId, uint256 amount, uint256 total);
    event ThresholdChange(uint256 newThreshold, uint256 oldThreshold);
    event DynastyValueChange(uint256 newDynasty, uint256 oldDynasty);
    event ProposerBonusChange(
        uint256 newProposerBonus,
        uint256 oldProposerBonus
    );

    event RewardUpdate(uint256 newReward, uint256 oldReward);

    /// @dev Emitted when validator confirms the auction bid and at the time of restaking in confirmAuctionBid() and restake().
    /// @param validatorId unique integer to identify a validator.
    /// @param nonce to synchronize the events in heimdal.
    /// @param newAmount the updated stake amount.
    event StakeUpdate(
        uint256 indexed validatorId,
        uint256 indexed nonce,
        uint256 indexed newAmount
    );
    event ClaimRewards(
        uint256 indexed validatorId,
        uint256 indexed amount,
        uint256 indexed totalAmount
    );
    event StartAuction(
        uint256 indexed validatorId,
        uint256 indexed amount,
        uint256 indexed auctionAmount
    );
    event ConfirmAuction(
        uint256 indexed newValidatorId,
        uint256 indexed oldValidatorId,
        uint256 indexed amount
    );
    event TopUpFee(address indexed user, uint256 indexed fee);
    event ClaimFee(address indexed user, uint256 indexed fee);
    // Delegator events
    event ShareMinted(
        uint256 indexed validatorId,
        address indexed user,
        uint256 indexed amount,
        uint256 tokens
    );
    event ShareBurned(
        uint256 indexed validatorId,
        address indexed user,
        uint256 indexed amount,
        uint256 tokens
    );
    event DelegatorClaimedRewards(
        uint256 indexed validatorId,
        address indexed user,
        uint256 indexed rewards
    );
    event DelegatorRestaked(
        uint256 indexed validatorId,
        address indexed user,
        uint256 indexed totalStaked
    );
    event DelegatorUnstaked(
        uint256 indexed validatorId,
        address indexed user,
        uint256 amount
    );
    event UpdateCommissionRate(
        uint256 indexed validatorId,
        uint256 indexed newCommissionRate,
        uint256 indexed oldCommissionRate
    );

    /// @dev Emitted when slashing is recorded on the root chain.
    /// @param nonce slash tick nonce for orchestrator replay protection.
    /// @param amount slashed amount.
    event Slashed(uint256 indexed nonce, uint256 indexed amount);

    /// @dev Emitted when a validator is released from jail.
    /// @param validatorId unique integer to identify a validator.
    /// @param signer validator address.
    event UnJailed(uint256 indexed validatorId, address indexed signer);

    Registry public registry;

    constructor(address _registry) public {
        registry = Registry(_registry);
    }

    function updateNonce(
        uint256[] calldata validatorIds,
        uint256[] calldata nonces
    ) external onlyOwner {
        require(validatorIds.length == nonces.length, "args length mismatch");

        for (uint256 i = 0; i < validatorIds.length; ++i) {
            validatorNonce[validatorIds[i]] = nonces[i];
        }
    }
}
