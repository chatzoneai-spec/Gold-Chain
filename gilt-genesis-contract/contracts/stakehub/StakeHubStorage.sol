// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../SystemV2.sol";
import "../extension/Protectable.sol";

abstract contract StakeHubStorage is SystemV2, Initializable, Protectable, ERC1155Holder {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*----------------- constants -----------------*/
    uint256 internal constant BLS_PUBKEY_LENGTH = 48;
    uint256 internal constant BLS_SIG_LENGTH = 96;

    address public constant DEAD_ADDRESS = address(0xdEaD);
    uint256 public constant LOCK_AMOUNT = 1 ether;
    uint256 public constant REDELEGATE_FEE_RATE_BASE = 100000; // 100%

    uint256 public constant BREATHE_BLOCK_INTERVAL = 1 days;
    uint256 internal constant ROUGHNET_CHAIN_ID = 714;
    uint256 internal constant ROUGHNET_UNBOND_PERIOD = 120 seconds;
    uint8 internal constant _MIGRATION_STATE_ACTIVE = 2;

    uint256 public constant INIT_MAX_NUMBER_NODE_ID = 5;

    // receive fund status
    uint8 internal constant _DISABLE = 0;
    uint8 internal constant _ENABLE = 1;
    uint8 internal constant _REWARD_FORWARD_REASON_INVALID_VALIDATOR = 1;
    uint8 internal constant _REWARD_FORWARD_REASON_INFLATION_REDIRECT = 2;
    uint8 internal constant _REWARD_FORWARD_REASON_AUTO_RETRY = 3;
    uint8 internal constant _REWARD_FORWARD_REASON_MANUAL_RETRY = 4;

    /*----------------- errors -----------------*/
    // @notice signature: 0x5f28f62b
    error ValidatorExisted();
    // @notice signature: 0x056e8811
    error ValidatorNotExisted();
    // @notice signature: 0x4b6b857d
    error ValidatorNotJailed();
    // @notice signature: 0x3cdeb0ea
    error DuplicateConsensusAddress();
    // @notice signature: 0x11fdb947
    error DuplicateVoteAddress();
    // @notice signature: 0xc0bf4143
    error DuplicateMoniker();
    // @notice signature: 0x2f64097e
    error SelfDelegationNotEnough();
    // @notice signature: 0xdc81db85
    error InvalidCommission();
    // @notice signature: 0x5dba5ad7
    error InvalidMoniker();
    // @notice signature: 0x2c8fc796
    error InvalidVoteAddress();
    // @notice signature: 0xca40c236
    error InvalidConsensusAddress();
    // @notice signature: 0x3f259b7a
    error UpdateTooFrequently();
    // @notice signature: 0x5c32dd9c
    error JailTimeNotExpired();
    // @notice signature: 0xdc6f0bdd
    error DelegationAmountTooSmall();
    // @notice signature: 0x64689203
    error OnlySelfDelegation();
    // @notice signature: 0x9811e0c7
    error ZeroShares();
    // @notice signature: 0xf0e3e629
    error SameValidator();
    // @notice signature: 0xbd52fcdb
    error NoMoreFelonyAllowed();
    // @notice signature: 0x37233762
    error AlreadySlashed();
    // @notice signature: 0x90b8ec18
    error TransferFailed();
    // @notice signature: 0x41abc801
    error InvalidRequest();
    // @notice signature: 0x1898eb6b
    error VoteAddressExpired();
    // @notice signature: 0xc2aee074
    error ConsensusAddressExpired();
    // @notice signature: 0x0d7b78d4
    error InvalidSynPackage();
    // @notice signature: 0xbebdc757
    error InvalidAgent();
    // @notice signature: 0x682a6e7c
    error InvalidValidator();
    // @notice signature: 0x6490ffd3
    error InvalidNodeID();
    // @notice signature: 0x246be614
    error ExceedsMaxNodeIDs();
    // @notice signature: 0x440bc78e
    error DuplicateNodeID();
    error TokenBMigrationNotAvailable();
    error InsufficientTokenBMigrationReserve();
    error SlashReserveNotConfigured();
    error InflationScheduleExceeded();
    error InvalidInflationMintAmount(uint256 expectedAmount, uint256 actualAmount);
    error InflationAlreadyRecorded(uint256 dayIndex);
    error StakeHubModuleDirectCall();
    error GiltStakeFrozen();
    error GiltCutoverSnapshotNotTaken();
    error GiltCutoverSnapshotImmutable();
    error GiltCutoverAlreadyFlipped();
    error GiltCutoverNotFlipped();
    error GiltCutoverInsufficientRootStake(uint256 required, uint256 available);
    error GiltCutoverFreezeRequired();
    error GiltCutoverDelegatorNotMigrated();
    error RootStakeAnchorDisabled();
    error NativeGiltWritesRetired();

    /*----------------- storage -----------------*/
    uint8 internal _receiveFundStatus;
    uint256 public transferGasLimit;

    // stake params
    uint256 public minSelfDelegationGILT;
    uint256 public minDelegationGILTChange;
    uint256 public maxElectedValidators;
    uint256 public unbondPeriod;
    uint256 public redelegateFeeRate;

    // slash params
    uint256 public downtimeSlashAmount;
    uint256 public felonySlashAmount;
    uint256 public downtimeJailTime;
    uint256 public felonyJailTime;

    // validator operator address set
    EnumerableSet.AddressSet internal _validatorSet;
    // validator operator address => validator info
    mapping(address => Validator) internal _validators;
    // validator moniker set(hash of the moniker)
    mapping(bytes32 => bool) internal _monikerSet;
    // validator consensus address => validator operator address
    mapping(address => address) public consensusToOperator;
    // validator consensus address => expiry date
    mapping(address => uint256) public consensusExpiration;
    // validator vote address => validator operator address
    mapping(bytes => address) public voteToOperator;
    // validator vote address => expiry date
    mapping(bytes => uint256) public voteExpiration;

    // legacy addresses of BC
    mapping(address => bool) internal _legacyConsensusAddress; // @dev deprecated
    mapping(bytes => bool) internal _legacyVoteAddress; // @dev deprecated

    // total number of current jailed validators
    uint256 public numOfJailed;
    // max number of jailed validators between breathe block(only for malicious vote and double sign)
    uint256 public maxFelonyBetweenBreatheBlock;
    // index(timestamp / breatheBlockInterval) => number of malicious vote and double sign slash
    mapping(uint256 => uint256) internal _felonyMap;
    // slash key => slash jail time
    mapping(bytes32 => uint256) internal _felonyRecords;

    // agent => validator operator address
    mapping(address => address) public agentToOperator;

    // network related values //

    // governance controlled maximum number of NodeIDs per validator (default is 5).
    uint256 public maxNodeIDs;

    // mapping from a validator's operator address to an array of their registered NodeIDs,
    // where each NodeID is stored as a fixed 32-byte value.
    mapping(address => bytes32[]) internal validatorNodeIDs;

    // dual-token power params
    uint256 public constant POWER_SCALE = 10_000; // 100%
    uint256 public constant MIN_RATIO_BPS = 1_000; // 10%
    uint256 public constant MAX_RATIO_BPS = 5_000; // 50%
    uint256 internal constant TOKEN_B_REWARD_PRECISION = 1e24;
    address public stakeTokenB;
    uint256 public stakeWeightA;
    uint256 public stakeWeightB;
    uint256 public maxBPowerRatioBps;
    bool public ratioEnabled;
    uint256 public minBtoARatioBps;
    uint256 public tokenBRewardSplitBps;
    bool public inflationEnabled;
    uint256 public inflationStartDayIndex;
    uint256 public inflationRateInitialBps;
    uint256 public inflationRateMinBps;
    uint256 public inflationDecayBpsPerYear;
    uint256 public inflationBaseSupply;
    uint256 public inflationMintedAmount;
    uint256 public inflationLastMintTimestamp;
    uint256 public inflationDistributedAmount;
    uint256 public inflationRedirectedAmount;
    uint256 public inflationPendingAmount;
    mapping(uint256 => uint256) public inflationMintedByDay;
    mapping(uint256 => address) public inflationRecorderByDay;
    address public slashReserveVault;
    mapping(uint256 => uint256) public slashReserveAmountById;
    bool public slashReserveSelfMigrationCompleted;
    uint256 public pendingSystemReward;
    uint256 public pendingSystemRewardAutoRetryCap;
    uint256 public pendingInflationSystemReward;

    // validator operator => delegator => token B amount
    mapping(address => mapping(address => uint256)) internal _delegatedTokenB;
    // validator operator => total delegated token B amount
    mapping(address => uint256) public totalDelegatedTokenB;
    // validator operator => accumulated token B reward per delegated token B
    mapping(address => uint256) internal _accTokenBRewardPerShare;
    // validator operator => delegator => reward debt
    mapping(address => mapping(address => uint256)) internal _tokenBRewardDebt;
    // validator operator => delegator => pending token B reward amount
    mapping(address => mapping(address => uint256)) internal _pendingTokenBReward;

    // validator operator => delegator => unbond request sequence => request
    mapping(address => mapping(address => mapping(uint256 => TokenBUnbondRequest))) internal _tokenBUnbondRequests;
    // validator operator => delegator => queue head (inclusive)
    mapping(address => mapping(address => uint256)) internal _tokenBUnbondHead;
    // validator operator => delegator => queue tail (exclusive)
    mapping(address => mapping(address => uint256)) internal _tokenBUnbondTail;
    // Deprecated storage slot kept to avoid breaking layout after removing the old ERC20 GOLD mode.
    uint8 internal _deprecatedStakeTokenBStandard;
    address public legacyStakeTokenB;
    address public legacyTokenBReserveVault;
    uint256 public tokenBCutoverVersion;
    uint256 public tokenBMigrationReserve;
    uint256 public tokenBMigrationProposalId;
    address public pendingTokenBMigrationStakeTokenB;
    address public pendingTokenBMigrationReserveVault;
    uint256 public pendingTokenBMigrationApprovalCount;
    uint256 public pendingTokenBMigrationRequiredApprovals;
    // validator operator => total delegated legacy token B amount
    mapping(address => uint256) public totalLegacyDelegatedTokenB;
    // validator operator => delegator => migration version
    mapping(address => mapping(address => uint256)) internal _tokenBDelegationVersion;
    // validator operator => delegator => unbond request sequence => migration version
    mapping(address => mapping(address => mapping(uint256 => uint256))) internal _tokenBUnbondRequestVersion;
    // validator operator => current token B delegators
    mapping(address => EnumerableSet.AddressSet) internal _tokenBDelegators;
    // migration proposal id => validator operator => approved
    mapping(uint256 => mapping(address => bool)) internal _tokenBMigrationApprovals;

    uint256 public stakeTokenBPrimaryId;
    uint256 public stakeTokenBSecondaryId;
    // validator operator => delegator => token id => token B amount
    mapping(address => mapping(address => mapping(uint256 => uint256))) internal _delegatedTokenBById;
    // validator operator => total delegated token B amount by token id
    mapping(address => mapping(uint256 => uint256)) public totalDelegatedTokenBById;
    // validator operator => delegator => queue head (inclusive) for ERC1155 mode
    mapping(address => mapping(address => uint256)) internal _tokenB1155UnbondHead;
    // validator operator => delegator => queue tail (exclusive) for ERC1155 mode
    mapping(address => mapping(address => uint256)) internal _tokenB1155UnbondTail;
    // validator operator => delegator => unbond request sequence => request for ERC1155 mode
    mapping(address => mapping(address => mapping(uint256 => TokenB1155UnbondRequest))) internal
        _tokenB1155UnbondRequests;
    // active token B migration reserve by ERC1155 token id
    mapping(uint256 => uint256) public tokenBMigrationReserveById;
    // canonical migration controller used for both wallet and staking legacy GOLD conversions
    address public tokenBMigrationController;
    // validator operator => token B reward accumulator frozen at token B migration cutover
    mapping(address => uint256) internal _tokenBRewardAccAtMigration;

    // root-anchored GILT stake snapshot (finalized root StakingInfo events via state sync)
    bool public rootAnchoredGiltStakingEnabled;
    uint256 public rootStakeSnapshotTotal;
    mapping(uint256 => RootStakeRecord) internal _rootStakeByValidatorId;
    mapping(address => uint256) internal _rootValidatorIdBySigner;

    // Wave 5 live-cutover: freeze, snapshot, per-validator flip to root-derived GILT power
    bool public giltStakeFreezeEnabled;
    uint256 public giltCutoverSnapshotBlock;
    uint256 public giltCutoverFlippedCount;
    mapping(address => uint256) public giltCutoverSnapshotGilt;
    mapping(address => bool) public giltCutoverFlipped;
    mapping(address => uint256) public giltCutoverRootValidatorId;
    mapping(address => mapping(address => uint256)) public giltCutoverMigratedGilt;
    mapping(address => EnumerableSet.AddressSet) internal _giltDelegators;

    /*----------------- structs and events -----------------*/
    struct StakeMigrationPackage {
        address operatorAddress; // the operator address of the target validator to delegate to
        address delegator; // the beneficiary of the delegation
        address refundAddress; // the Beacon Chain address to refund the fund if migration failed
        uint256 amount; // the amount of GILT to be migrated(decimal: 18)
    }

    enum StakeMigrationRespCode {
        MIGRATE_SUCCESS,
        CLAIM_FUND_FAILED,
        VALIDATOR_NOT_EXISTED,
        VALIDATOR_JAILED,
        INVALID_DELEGATOR
    }

    struct Validator {
        address consensusAddress;
        address operatorAddress;
        address creditContract;
        uint256 createdTime;
        bytes voteAddress;
        Description description;
        Commission commission;
        bool jailed;
        uint256 jailUntil;
        uint256 updateTime;
        // The agent can perform transactions on behalf of the operatorAddress in certain scenarios.
        address agent;
        uint256[19] __reservedSlots;
    }

    struct Description {
        string moniker;
        string identity;
        string website;
        string details;
    }

    struct Commission {
        uint64 rate; // the commission rate charged to delegators(10000 is 100%)
        uint64 maxRate; // maximum commission rate which validator can ever charge
        uint64 maxChangeRate; // maximum daily increase of the validator commission
    }

    struct TokenBUnbondRequest {
        uint256 tokenBAmount;
        uint256 unlockTime;
    }

    struct TokenB1155UnbondRequest {
        uint256 tokenId;
        uint256 tokenBAmount;
        uint256 unlockTime;
    }

    struct RootStakeRecord {
        address signer;
        uint256 amount;
        uint256 nonce;
        uint8 status;
    }

    enum SlashType {
        DoubleSign,
        DownTime,
        MaliciousVote
    }

    event ValidatorCreated(
        address indexed consensusAddress,
        address indexed operatorAddress,
        address indexed creditContract,
        bytes voteAddress
    );
    event StakeCreditInitialized(address indexed operatorAddress, address indexed creditContract);
    event ConsensusAddressEdited(address indexed operatorAddress, address indexed newConsensusAddress);
    event CommissionRateEdited(address indexed operatorAddress, uint64 newCommissionRate);
    event DescriptionEdited(address indexed operatorAddress);
    event VoteAddressEdited(address indexed operatorAddress, bytes newVoteAddress);
    event Delegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount);
    event Undelegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount);
    event Redelegated(
        address indexed srcValidator,
        address indexed dstValidator,
        address indexed delegator,
        uint256 oldShares,
        uint256 newShares,
        uint256 giltAmount
    );
    event RewardDistributed(address indexed operatorAddress, uint256 reward);
    event RewardDistributeFailed(address indexed operatorAddress, bytes failReason);
    event ValidatorSlashed(
        address indexed operatorAddress, uint256 jailUntil, uint256 slashAmount, SlashType slashType
    );
    event RootSlashIntent(
        uint256 indexed rootValidatorId,
        address indexed consensusAddress,
        uint8 slashType,
        bytes32 evidenceRef,
        uint256 finalizedHeight
    );
    event ValidatorJailed(address indexed operatorAddress);
    event ValidatorEmptyJailed(address indexed operatorAddress);
    event ValidatorUnjailed(address indexed operatorAddress);
    event Claimed(address indexed operatorAddress, address indexed delegator, uint256 giltAmount);
    event TokenBDelegated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenB1155Delegated(
        address indexed operatorAddress, address indexed delegator, uint256 indexed tokenId, uint256 tokenBAmount
    );
    event TokenBUndelegated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenB1155Undelegated(
        address indexed operatorAddress, address indexed delegator, uint256 indexed tokenId, uint256 tokenBAmount
    );
    event TokenBClaimed(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenB1155Claimed(
        address indexed operatorAddress, address indexed delegator, uint256 indexed tokenId, uint256 tokenBAmount
    );
    event TokenBSlashed(address indexed operatorAddress, uint256 tokenBAmount, uint8 slashType);
    event TokenB1155Slashed(
        address indexed operatorAddress, uint256 indexed tokenId, uint256 tokenBAmount, uint8 slashType
    );
    event SlashReserveCredited(
        address indexed operatorAddress,
        SlashType slashType,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 settlementEpoch
    );
    event SlashReserveSettled(
        address indexed recipient, uint256 indexed tokenId, uint256 amount, uint256 settlementEpoch
    );
    event SlashReserveMigratedFromSelf(address indexed vault, uint256 indexed tokenId, uint256 amount);
    event SlashReserveSelfMigrationFinalized(address indexed vault, uint256 migratedTokenCount);
    event TokenBRewardDistributed(address indexed operatorAddress, uint256 reward);
    event TokenBRewardClaimed(address indexed operatorAddress, address indexed delegator, uint256 reward);
    event LegacyTokenBClaimed(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event LegacyTokenB1155Claimed(
        address indexed operatorAddress, address indexed delegator, uint256 indexed tokenId, uint256 tokenBAmount
    );
    event LegacyTokenBMigrated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event LegacyTokenB1155Migrated(
        address indexed operatorAddress, address indexed delegator, uint256 indexed tokenId, uint256 tokenBAmount
    );
    event TokenBMigrationActivated(
        address indexed legacyToken, address indexed newToken, address indexed reserveVault, uint256 cutoverVersion
    );
    event TokenBMigrationProposed(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed legacyToken,
        address newToken,
        address reserveVault,
        uint256 requiredApprovals
    );
    event TokenBMigrationApproved(
        uint256 indexed proposalId, address indexed operatorAddress, uint256 approvalCount, uint256 requiredApprovals
    );
    event TokenBMigrationReserveFunded(address indexed sender, uint256 amount);
    event TokenBMigrationReserveFunded1155(address indexed sender, uint256 indexed tokenId, uint256 amount);
    event TokenBMigrationReserveWithdrawn(address indexed recipient, uint256 amount);
    event TokenBMigrationReserveWithdrawn1155(address indexed recipient, uint256 indexed tokenId, uint256 amount);
    event TokenBMigrationControllerUpdated(address indexed previousController, address indexed newController);
    event InflationMintRecorded(
        uint256 amount, uint256 inflationBps, uint256 totalMintedAmount, uint256 effectiveSupply
    );
    event InflationRecordedV2(
        uint256 mintedAmount,
        uint256 distributedAmount,
        uint256 redirectedAmount,
        uint256 pendingAmount,
        uint256 inflationBps,
        uint256 totalMintedAmount,
        uint256 effectiveSupply
    );
    event InflationIntervalRecorded(uint256 indexed dayIndex, address indexed consensusAddress, uint256 amount);
    event InflationRedirected(address indexed consensusAddress, address indexed operatorAddress, uint256 amount);
    event RewardForwardQueued(address indexed operatorAddress, uint256 amount, uint8 reasonCode, bytes failReason);
    event RewardForwardRetried(address indexed caller, uint256 amount, bool success, bytes failReason);
    event RewardForwardSwept(
        address indexed caller, address indexed recipient, uint256 amount, uint256 inflationAmount
    );
    event ConsensusEmergencyHalt(
        address indexed operatorAddress, address indexed consensusAddress, uint256 triggerBlock
    );
    event AgentChanged(address indexed operatorAddress, address indexed oldAgent, address indexed newAgent);

    // Events for adding and removing NodeIDs.
    event NodeIDAdded(address indexed validator, bytes32 nodeID);
    event NodeIDRemoved(address indexed validator, bytes32 nodeID);
    event RootStakeSnapshotApplied(
        uint256 indexed stateId,
        uint256 indexed validatorId,
        address indexed signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    );
    event RootStakeDivergenceDetected(uint256 rootTotal, uint256 trackedTotal, address indexed reporter);

    event GiltStakeFreezeToggled(bool enabled);
    event GiltCutoverSnapshotTaken(uint256 blockNumber, uint256 validatorCount);
    event GiltCutoverValidatorFlipped(
        address indexed operatorAddress,
        address indexed consensusAddress,
        uint256 snapshotGilt,
        uint256 rootValidatorId,
        uint256 rootStakeAmount,
        uint256 delegatorCount
    );
    event GiltCutoverDelegatorMigrated(address indexed operatorAddress, address indexed delegator, uint256 giltAmount);

    event MigrateSuccess(
        address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount
    ); // @dev deprecated
    event MigrateFailed(
        address indexed operatorAddress, address indexed delegator, uint256 giltAmount, StakeMigrationRespCode respCode
    ); // @dev deprecated
    event UnexpectedPackage(uint8 channelId, bytes msgBytes); // @dev deprecated

    /*----------------- modifiers -----------------*/
    modifier validatorExist(
        address operatorAddress
    ) {
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted();
        _;
    }

    modifier enableReceivingFund() {
        _receiveFundStatus = _ENABLE;
        _;
        _receiveFundStatus = _DISABLE;
    }

    modifier onlyCurrentValidatorOperator() {
        if (!_isCurrentValidatorOperator(msg.sender)) revert InvalidValidator();
        _;
    }

    modifier onlyStakeHubDelegateCall() {
        if (address(this) != STAKE_HUB_ADDR) revert StakeHubModuleDirectCall();
        _;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes memory data
    ) public virtual override onlyStakeHubDelegateCall returns (bytes4) {
        return super.onERC1155Received(operator, from, id, value, data);
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) public virtual override onlyStakeHubDelegateCall returns (bytes4) {
        return super.onERC1155BatchReceived(operator, from, ids, values, data);
    }

    function _isCurrentValidatorOperator(
        address operatorAddress
    ) internal view virtual returns (bool);

    function _activeTotalDelegatedTokenB(
        address operatorAddress
    ) internal view virtual returns (uint256);

    function _autoRetryPendingSystemReward() internal virtual;

    function _forwardSystemRewardOrQueue(
        address operatorAddress,
        uint256 amount,
        uint8 reasonCode,
        bool isInflation
    ) internal virtual returns (uint256 redirectedAmount, uint256 pendingAmount);

    function _distributeValidatorReward(
        address operatorAddress,
        Validator memory valInfo,
        uint256 totalReward
    ) internal virtual;
}
