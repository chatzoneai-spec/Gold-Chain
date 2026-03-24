// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./SystemV2.sol";
import "./extension/Protectable.sol";
import "./interface/0.8.x/IBSCValidatorSet.sol";
import "./interface/0.8.x/IGovToken.sol";
import "./interface/0.8.x/IStakeCredit.sol";
import "./lib/0.8.x/Utils.sol";

contract StakeHub is SystemV2, Initializable, Protectable {
    using Utils for string;
    using Utils for bytes;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /*----------------- constants -----------------*/
    uint256 private constant BLS_PUBKEY_LENGTH = 48;
    uint256 private constant BLS_SIG_LENGTH = 96;

    address public constant DEAD_ADDRESS = address(0xdEaD);
    uint256 public constant LOCK_AMOUNT = 1 ether;
    uint256 public constant REDELEGATE_FEE_RATE_BASE = 100000; // 100%

    uint256 public constant BREATHE_BLOCK_INTERVAL = 1 days;
    uint256 private constant ROUGHNET_CHAIN_ID = 714;
    uint256 private constant ROUGHNET_UNBOND_PERIOD = 120 seconds;

    uint256 public constant INIT_MAX_NUMBER_NODE_ID = 5;

    // receive fund status
    uint8 private constant _DISABLE = 0;
    uint8 private constant _ENABLE = 1;

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

    /*----------------- storage -----------------*/
    uint8 private _receiveFundStatus;
    uint256 public transferGasLimit;

    // stake params
    uint256 public minSelfDelegationBNB;
    uint256 public minDelegationBNBChange;
    uint256 public maxElectedValidators;
    uint256 public unbondPeriod;
    uint256 public redelegateFeeRate;

    // slash params
    uint256 public downtimeSlashAmount;
    uint256 public felonySlashAmount;
    uint256 public downtimeJailTime;
    uint256 public felonyJailTime;

    // validator operator address set
    EnumerableSet.AddressSet private _validatorSet;
    // validator operator address => validator info
    mapping(address => Validator) private _validators;
    // validator moniker set(hash of the moniker)
    mapping(bytes32 => bool) private _monikerSet;
    // validator consensus address => validator operator address
    mapping(address => address) public consensusToOperator;
    // validator consensus address => expiry date
    mapping(address => uint256) public consensusExpiration;
    // validator vote address => validator operator address
    mapping(bytes => address) public voteToOperator;
    // validator vote address => expiry date
    mapping(bytes => uint256) public voteExpiration;

    // legacy addresses of BC
    mapping(address => bool) private _legacyConsensusAddress; // @dev deprecated
    mapping(bytes => bool) private _legacyVoteAddress; // @dev deprecated

    // total number of current jailed validators
    uint256 public numOfJailed;
    // max number of jailed validators between breathe block(only for malicious vote and double sign)
    uint256 public maxFelonyBetweenBreatheBlock;
    // index(timestamp / breatheBlockInterval) => number of malicious vote and double sign slash
    mapping(uint256 => uint256) private _felonyMap;
    // slash key => slash jail time
    mapping(bytes32 => uint256) private _felonyRecords;

    // agent => validator operator address
    mapping(address => address) public agentToOperator;

    // network related values //

    // governance controlled maximum number of NodeIDs per validator (default is 5).
    uint256 public maxNodeIDs;

    // mapping from a validator's operator address to an array of their registered NodeIDs,
    // where each NodeID is stored as a fixed 32-byte value.
    mapping(address => bytes32[]) private validatorNodeIDs;

    // dual-token power params
    uint256 public constant POWER_SCALE = 10_000; // 100%
    uint256 public constant MIN_RATIO_BPS = 1_000; // 10%
    uint256 public constant MAX_RATIO_BPS = 5_000; // 50%
    uint256 private constant TOKEN_B_REWARD_PRECISION = 1e24;
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

    // validator operator => delegator => token B amount
    mapping(address => mapping(address => uint256)) private _delegatedTokenB;
    // validator operator => total delegated token B amount
    mapping(address => uint256) public totalDelegatedTokenB;
    // validator operator => accumulated token B reward per delegated token B
    mapping(address => uint256) private _accTokenBRewardPerShare;
    // validator operator => delegator => reward debt
    mapping(address => mapping(address => uint256)) private _tokenBRewardDebt;
    // validator operator => delegator => pending token B reward amount
    mapping(address => mapping(address => uint256)) private _pendingTokenBReward;

    // validator operator => delegator => unbond request sequence => request
    mapping(address => mapping(address => mapping(uint256 => TokenBUnbondRequest))) private _tokenBUnbondRequests;
    // validator operator => delegator => queue head (inclusive)
    mapping(address => mapping(address => uint256)) private _tokenBUnbondHead;
    // validator operator => delegator => queue tail (exclusive)
    mapping(address => mapping(address => uint256)) private _tokenBUnbondTail;
    address public legacyStakeTokenB;
    address public legacyTokenBReserveVault;
    uint256 public tokenBCutoverVersion;
    uint256 public tokenBMigrationReserve;
    // validator operator => total delegated legacy token B amount
    mapping(address => uint256) public totalLegacyDelegatedTokenB;
    // validator operator => delegator => migration version
    mapping(address => mapping(address => uint256)) private _tokenBDelegationVersion;
    // validator operator => delegator => unbond request sequence => migration version
    mapping(address => mapping(address => mapping(uint256 => uint256))) private _tokenBUnbondRequestVersion;
    // validator operator => current token B delegators
    mapping(address => EnumerableSet.AddressSet) private _tokenBDelegators;

    /*----------------- structs and events -----------------*/
    struct StakeMigrationPackage {
        address operatorAddress; // the operator address of the target validator to delegate to
        address delegator; // the beneficiary of the delegation
        address refundAddress; // the Beacon Chain address to refund the fund if migration failed
        uint256 amount; // the amount of BNB to be migrated(decimal: 18)
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
    event Delegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 bnbAmount);
    event Undelegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 bnbAmount);
    event Redelegated(
        address indexed srcValidator,
        address indexed dstValidator,
        address indexed delegator,
        uint256 oldShares,
        uint256 newShares,
        uint256 bnbAmount
    );
    event RewardDistributed(address indexed operatorAddress, uint256 reward);
    event RewardDistributeFailed(address indexed operatorAddress, bytes failReason);
    event ValidatorSlashed(
        address indexed operatorAddress, uint256 jailUntil, uint256 slashAmount, SlashType slashType
    );
    event ValidatorJailed(address indexed operatorAddress);
    event ValidatorEmptyJailed(address indexed operatorAddress);
    event ValidatorUnjailed(address indexed operatorAddress);
    event Claimed(address indexed operatorAddress, address indexed delegator, uint256 bnbAmount);
    event TokenBDelegated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenBUndelegated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenBClaimed(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenBSlashed(address indexed operatorAddress, uint256 tokenBAmount, uint8 slashType);
    event TokenBRewardDistributed(address indexed operatorAddress, uint256 reward);
    event TokenBRewardClaimed(address indexed operatorAddress, address indexed delegator, uint256 reward);
    event LegacyTokenBClaimed(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event LegacyTokenBMigrated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenBMigrationActivated(
        address indexed legacyToken,
        address indexed newToken,
        address indexed reserveVault,
        uint256 cutoverVersion
    );
    event TokenBMigrationReserveFunded(address indexed sender, uint256 amount);
    event TokenBMigrationReserveWithdrawn(address indexed recipient, uint256 amount);
    event InflationMintRecorded(uint256 amount, uint256 inflationBps, uint256 totalMintedAmount, uint256 effectiveSupply);
    event AgentChanged(address indexed operatorAddress, address indexed oldAgent, address indexed newAgent);

    // Events for adding and removing NodeIDs.
    event NodeIDAdded(address indexed validator, bytes32 nodeID);
    event NodeIDRemoved(address indexed validator, bytes32 nodeID);

    event MigrateSuccess(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 bnbAmount); // @dev deprecated
    event MigrateFailed(
        address indexed operatorAddress, address indexed delegator, uint256 bnbAmount, StakeMigrationRespCode respCode
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

    receive() external payable {
        // to prevent BNB from being lost
        if (_receiveFundStatus != _ENABLE) revert();
    }

    /**
     * @dev this function is invoked by BSC Parlia consensus engine during the hard fork
     */
    function initialize() external initializer onlyCoinbase onlyZeroGasPrice {
        transferGasLimit = 5000;
        minSelfDelegationBNB = 2_000 ether;
        minDelegationBNBChange = 1 ether;
        maxElectedValidators = 45;
        unbondPeriod = block.chainid == ROUGHNET_CHAIN_ID ? ROUGHNET_UNBOND_PERIOD : 7 days;
        redelegateFeeRate = 2;
        downtimeSlashAmount = 10 ether;
        felonySlashAmount = 200 ether;
        downtimeJailTime = 2 days;
        felonyJailTime = 30 days;
        maxFelonyBetweenBreatheBlock = 2;
        stakeWeightA = POWER_SCALE;
        stakeWeightB = 6_000;
        maxBPowerRatioBps = MAX_RATIO_BPS;
        ratioEnabled = false;
        minBtoARatioBps = MIN_RATIO_BPS;
        tokenBRewardSplitBps = 0;
        inflationEnabled = false;
        inflationStartDayIndex = block.timestamp / BREATHE_BLOCK_INTERVAL;
        inflationRateInitialBps = 1_000; // 10%
        inflationRateMinBps = 150; // 1.5%
        inflationDecayBpsPerYear = 1_500; // 15% yearly decay
        inflationLastMintTimestamp = block.timestamp;
        // Different address will be set depending on the environment
        __Protectable_init_unchained(0x08E68Ec70FA3b629784fDB28887e206ce8561E08);
    }

    /*----------------- Implement cross chain app -----------------*/
    function handleSynPackage(
        uint8,
        bytes calldata msgBytes
    ) external onlyCrossChainContract whenNotPaused enableReceivingFund returns (bytes memory) {
        revert("deprecated");
    }

    function handleAckPackage(uint8 channelId, bytes calldata msgBytes) external onlyCrossChainContract {
        revert("deprecated");
    }

    function handleFailAckPackage(uint8 channelId, bytes calldata msgBytes) external onlyCrossChainContract {
        revert("deprecated");
    }

    /*----------------- external functions -----------------*/
    /**
     * @param newAgent the new agent address of the validator, updating to address(0) means remove the old agent.
     */
    function updateAgent(
        address newAgent
    ) external validatorExist(msg.sender) whenNotPaused notInBlackList {
        if (agentToOperator[newAgent] != address(0)) revert InvalidAgent();
        if (_validatorSet.contains(newAgent)) revert InvalidAgent();

        address operatorAddress = msg.sender;
        address oldAgent = _validators[operatorAddress].agent;
        if (oldAgent == newAgent) revert InvalidAgent();

        if (oldAgent != address(0)) {
            delete agentToOperator[oldAgent];
        }

        _validators[operatorAddress].agent = newAgent;

        if (newAgent != address(0)) {
            agentToOperator[newAgent] = operatorAddress;
        }

        emit AgentChanged(operatorAddress, oldAgent, newAgent);
    }

    /**
     * @param consensusAddress the consensus address of the validator
     * @param voteAddress the vote address of the validator
     * @param blsProof the bls proof of the vote address
     * @param commission the commission of the validator
     * @param description the description of the validator
     */
    function createValidator(
        address consensusAddress,
        bytes calldata voteAddress,
        bytes calldata blsProof,
        Commission calldata commission,
        Description calldata description
    ) external payable whenNotPaused notInBlackList {
        // basic check
        address operatorAddress = msg.sender;
        if (_validatorSet.contains(operatorAddress)) revert ValidatorExisted();
        if (agentToOperator[operatorAddress] != address(0)) revert InvalidValidator();

        if (consensusToOperator[consensusAddress] != address(0)) {
            revert DuplicateConsensusAddress();
        }
        if (voteToOperator[voteAddress] != address(0)) {
            revert DuplicateVoteAddress();
        }
        bytes32 monikerHash = keccak256(abi.encodePacked(description.moniker));
        if (_monikerSet[monikerHash]) revert DuplicateMoniker();

        uint256 delegation = msg.value - LOCK_AMOUNT; // create validator need to lock 1 BNB
        if (delegation < minSelfDelegationBNB) revert SelfDelegationNotEnough();

        if (consensusAddress == address(0)) revert InvalidConsensusAddress();
        if (
            commission.maxRate > 5_000 || commission.rate > commission.maxRate
                || commission.maxChangeRate > commission.maxRate
        ) revert InvalidCommission();
        if (!_checkMoniker(description.moniker)) revert InvalidMoniker();
        // proof-of-possession verify
        if (!_checkVoteAddress(operatorAddress, voteAddress, blsProof)) revert InvalidVoteAddress();

        // deploy stake credit proxy contract
        address creditContract = _deployStakeCredit(operatorAddress, description.moniker);

        _validatorSet.add(operatorAddress);
        _monikerSet[monikerHash] = true;
        Validator storage valInfo = _validators[operatorAddress];
        valInfo.consensusAddress = consensusAddress;
        valInfo.operatorAddress = operatorAddress;
        valInfo.creditContract = creditContract;
        valInfo.createdTime = block.timestamp;
        valInfo.voteAddress = voteAddress;
        valInfo.description = description;
        valInfo.commission = commission;
        valInfo.updateTime = block.timestamp;
        consensusToOperator[consensusAddress] = operatorAddress;
        voteToOperator[voteAddress] = operatorAddress;

        emit ValidatorCreated(consensusAddress, operatorAddress, creditContract, voteAddress);
        emit Delegated(operatorAddress, operatorAddress, delegation, delegation);
        emit Delegated(operatorAddress, DEAD_ADDRESS, LOCK_AMOUNT, LOCK_AMOUNT);

        IGovToken(GOV_TOKEN_ADDR).sync(creditContract, operatorAddress);
    }

    /**
     * @param newConsensusAddress the new consensus address of the validator
     */
    function editConsensusAddress(
        address newConsensusAddress
    ) external whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        if (newConsensusAddress == address(0)) revert InvalidConsensusAddress();
        if (consensusToOperator[newConsensusAddress] != address(0)) {
            revert DuplicateConsensusAddress();
        }

        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        consensusExpiration[valInfo.consensusAddress] = block.timestamp;
        valInfo.consensusAddress = newConsensusAddress;
        valInfo.updateTime = block.timestamp;
        consensusToOperator[newConsensusAddress] = operatorAddress;

        emit ConsensusAddressEdited(operatorAddress, newConsensusAddress);
    }

    /**
     * @param commissionRate the new commission rate of the validator
     */
    function editCommissionRate(
        uint64 commissionRate
    ) external whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        if (commissionRate > valInfo.commission.maxRate) revert InvalidCommission();
        uint256 changeRate = commissionRate >= valInfo.commission.rate
            ? commissionRate - valInfo.commission.rate
            : valInfo.commission.rate - commissionRate;
        if (changeRate > valInfo.commission.maxChangeRate) revert InvalidCommission();

        valInfo.commission.rate = commissionRate;
        valInfo.updateTime = block.timestamp;

        emit CommissionRateEdited(operatorAddress, commissionRate);
    }

    /**
     * @notice the moniker of the validator will be ignored as it is not editable
     * @param description the new description of the validator
     */
    function editDescription(
        Description memory description
    ) external whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        description.moniker = valInfo.description.moniker;
        valInfo.description = description;
        valInfo.updateTime = block.timestamp;

        emit DescriptionEdited(operatorAddress);
    }

    /**
     * @param newVoteAddress the new vote address of the validator
     * @param blsProof the bls proof of the vote address
     */
    function editVoteAddress(
        bytes calldata newVoteAddress,
        bytes calldata blsProof
    ) external whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        // proof-of-possession verify
        address operatorAddress = _bep410MsgSender();
        if (!_checkVoteAddress(operatorAddress, newVoteAddress, blsProof)) revert InvalidVoteAddress();
        if (voteToOperator[newVoteAddress] != address(0)) {
            revert DuplicateVoteAddress();
        }

        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        voteExpiration[valInfo.voteAddress] = block.timestamp;
        valInfo.voteAddress = newVoteAddress;
        valInfo.updateTime = block.timestamp;
        voteToOperator[newVoteAddress] = operatorAddress;

        emit VoteAddressEdited(operatorAddress, newVoteAddress);
    }

    /**
     * @param operatorAddress the operator address of the validator to be unjailed
     */
    function unjail(
        address operatorAddress
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        Validator storage valInfo = _validators[operatorAddress];
        if (!valInfo.jailed) revert ValidatorNotJailed();

        if (IStakeCredit(valInfo.creditContract).getPooledBNB(operatorAddress) < minSelfDelegationBNB) {
            revert SelfDelegationNotEnough();
        }
        if (valInfo.jailUntil > block.timestamp) revert JailTimeNotExpired();

        valInfo.jailed = false;
        numOfJailed -= 1;
        emit ValidatorUnjailed(operatorAddress);
    }

    /**
     * @param operatorAddress the operator address of the validator to be delegated to
     * @param delegateVotePower whether to delegate vote power to the validator
     */
    function delegate(
        address operatorAddress,
        bool delegateVotePower
    ) external payable whenNotPaused notInBlackList validatorExist(operatorAddress) {
        uint256 bnbAmount = msg.value;
        if (bnbAmount < minDelegationBNBChange) revert DelegationAmountTooSmall();

        address delegator = msg.sender;
        Validator memory valInfo = _validators[operatorAddress];
        if (valInfo.jailed && delegator != operatorAddress) revert OnlySelfDelegation();

        uint256 shares = IStakeCredit(valInfo.creditContract).delegate{ value: bnbAmount }(delegator);
        emit Delegated(operatorAddress, delegator, shares, bnbAmount);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, delegator);
        if (delegateVotePower) {
            IGovToken(GOV_TOKEN_ADDR).delegateVote(delegator, operatorAddress);
        }
    }

    /**
     * @dev Undelegate BNB from a validator, fund is only claimable few days later
     * @param operatorAddress the operator address of the validator to be undelegated from
     * @param shares the shares to be undelegated
     */
    function undelegate(
        address operatorAddress,
        uint256 shares
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        if (shares == 0) revert ZeroShares();

        address delegator = msg.sender;
        Validator memory valInfo = _validators[operatorAddress];

        uint256 bnbAmount = IStakeCredit(valInfo.creditContract).undelegate(delegator, shares);
        emit Undelegated(operatorAddress, delegator, shares, bnbAmount);

        if (delegator == operatorAddress) {
            _checkValidatorSelfDelegation(operatorAddress);
        }

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, delegator);
    }

    /**
     * @notice Delegate token B to a validator for election power calculation.
     * @param operatorAddress validator operator address
     * @param tokenBAmount amount of token B to delegate
     */
    function delegateTokenB(
        address operatorAddress,
        uint256 tokenBAmount
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        if (stakeTokenB == address(0) || tokenBAmount == 0) revert InvalidRequest();

        _migrateLegacyTokenBPosition(operatorAddress, msg.sender);
        _settleTokenBReward(operatorAddress, msg.sender);
        IERC20(stakeTokenB).safeTransferFrom(msg.sender, address(this), tokenBAmount);
        if (_delegatedTokenB[operatorAddress][msg.sender] == 0) {
            _tokenBDelegators[operatorAddress].add(msg.sender);
        }
        _delegatedTokenB[operatorAddress][msg.sender] += tokenBAmount;
        totalDelegatedTokenB[operatorAddress] += tokenBAmount;
        _tokenBDelegationVersion[operatorAddress][msg.sender] = tokenBCutoverVersion;
        _syncTokenBRewardDebt(operatorAddress, msg.sender);

        emit TokenBDelegated(operatorAddress, msg.sender, tokenBAmount);
    }

    /**
     * @notice Undelegate token B from a validator.
     * @param operatorAddress validator operator address
     * @param tokenBAmount amount of token B to undelegate
     */
    function undelegateTokenB(
        address operatorAddress,
        uint256 tokenBAmount
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _migrateLegacyTokenBPosition(operatorAddress, msg.sender);
        uint256 delegatedAmount = _delegatedTokenB[operatorAddress][msg.sender];
        if (tokenBAmount == 0 || tokenBAmount > delegatedAmount) revert InvalidRequest();

        _settleTokenBReward(operatorAddress, msg.sender);
        uint256 remainingAmount = delegatedAmount - tokenBAmount;
        _delegatedTokenB[operatorAddress][msg.sender] = remainingAmount;
        totalDelegatedTokenB[operatorAddress] -= tokenBAmount;
        _syncTokenBRewardDebt(operatorAddress, msg.sender);
        _queueTokenBUnbond(operatorAddress, msg.sender, tokenBAmount);
        if (remainingAmount == 0) {
            _tokenBDelegators[operatorAddress].remove(msg.sender);
        }

        emit TokenBUndelegated(operatorAddress, msg.sender, tokenBAmount);
    }

    /**
     * @param srcValidator the operator address of the validator to be redelegated from
     * @param dstValidator the operator address of the validator to be redelegated to
     * @param shares the shares to be redelegated
     * @param delegateVotePower whether to delegate vote power to the dstValidator
     */
    function redelegate(
        address srcValidator,
        address dstValidator,
        uint256 shares,
        bool delegateVotePower
    )
        external
        whenNotPaused
        notInBlackList
        validatorExist(srcValidator)
        validatorExist(dstValidator)
        enableReceivingFund
    {
        if (shares == 0) revert ZeroShares();
        if (srcValidator == dstValidator) revert SameValidator();

        address delegator = msg.sender;
        Validator memory srcValInfo = _validators[srcValidator];
        Validator memory dstValInfo = _validators[dstValidator];
        if (dstValInfo.jailed && delegator != dstValidator) revert OnlySelfDelegation();

        uint256 bnbAmount = IStakeCredit(srcValInfo.creditContract).unbond(delegator, shares);
        if (bnbAmount < minDelegationBNBChange) revert DelegationAmountTooSmall();
        // check if the srcValidator has enough self delegation
        if (
            delegator == srcValidator
                && IStakeCredit(srcValInfo.creditContract).getPooledBNB(srcValidator) < minSelfDelegationBNB
        ) {
            revert SelfDelegationNotEnough();
        }

        uint256 feeCharge = bnbAmount * redelegateFeeRate / REDELEGATE_FEE_RATE_BASE;
        (bool success,) = dstValInfo.creditContract.call{ value: feeCharge }("");
        if (!success) revert TransferFailed();

        bnbAmount -= feeCharge;
        uint256 newShares = IStakeCredit(dstValInfo.creditContract).delegate{ value: bnbAmount }(delegator);
        emit Redelegated(srcValidator, dstValidator, delegator, shares, newShares, bnbAmount);

        address[] memory stakeCredits = new address[](2);
        stakeCredits[0] = srcValInfo.creditContract;
        stakeCredits[1] = dstValInfo.creditContract;
        IGovToken(GOV_TOKEN_ADDR).syncBatch(stakeCredits, delegator);
        if (delegateVotePower) {
            IGovToken(GOV_TOKEN_ADDR).delegateVote(delegator, dstValidator);
        }
    }

    /**
     * @dev Claim the undelegated BNB from the pool after unbondPeriod
     * @param operatorAddress the operator address of the validator
     * @param requestNumber the request number of the undelegation. 0 means claim all
     */
    function claim(address operatorAddress, uint256 requestNumber) external whenNotPaused notInBlackList {
        _claim(operatorAddress, requestNumber);
    }

    /**
     * @dev Claim the undelegated BNB from the pools after unbondPeriod
     * @param operatorAddresses the operator addresses of the validator
     * @param requestNumbers numbers of the undelegation requests. 0 means claim all
     */
    function claimBatch(
        address[] calldata operatorAddresses,
        uint256[] calldata requestNumbers
    ) external whenNotPaused notInBlackList {
        if (operatorAddresses.length != requestNumbers.length) revert InvalidRequest();
        for (uint256 i; i < operatorAddresses.length; ++i) {
            _claim(operatorAddresses[i], requestNumbers[i]);
        }
    }

    /**
     * @dev Claim undelegated token B after unbondPeriod.
     * @param operatorAddress the operator address of the validator
     * @param requestNumber number of unbond requests to claim. 0 means claim all.
     */
    function claimTokenB(
        address operatorAddress,
        uint256 requestNumber
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _claimTokenB(operatorAddress, msg.sender, requestNumber);
    }

    /**
     * @dev Batch claim undelegated token B after unbondPeriod.
     * @param operatorAddresses the operator addresses of the validators
     * @param requestNumbers number of unbond requests to claim for each validator. 0 means claim all.
     */
    function claimTokenBBatch(
        address[] calldata operatorAddresses,
        uint256[] calldata requestNumbers
    ) external whenNotPaused notInBlackList {
        if (operatorAddresses.length != requestNumbers.length) revert InvalidRequest();

        for (uint256 i; i < operatorAddresses.length; ++i) {
            if (!_validatorSet.contains(operatorAddresses[i])) revert ValidatorNotExisted();
            _claimTokenB(operatorAddresses[i], msg.sender, requestNumbers[i]);
        }
    }

    /**
     * @dev Claim accumulated token B reward for one validator.
     * @param operatorAddress validator operator address
     */
    function claimTokenBReward(
        address operatorAddress
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _claimTokenBReward(operatorAddress, msg.sender);
    }

    /**
     * @dev Batch claim accumulated token B rewards.
     * @param operatorAddresses validator operator addresses
     */
    function claimTokenBRewardBatch(
        address[] calldata operatorAddresses
    ) external whenNotPaused notInBlackList {
        for (uint256 i; i < operatorAddresses.length; ++i) {
            if (!_validatorSet.contains(operatorAddresses[i])) revert ValidatorNotExisted();
            _claimTokenBReward(operatorAddresses[i], msg.sender);
        }
    }

    /**
     * @notice Activates token B migration by freezing the current token as legacy and switching to a new token.
     * @param newStakeTokenB the new token B address used for active staking
     * @param reserveVault the vault that will hold legacy token B after migration
     */
    function activateTokenBMigration(address newStakeTokenB, address reserveVault) external onlyGov {
        _activateTokenBMigration(newStakeTokenB, reserveVault);
    }

    function _activateTokenBMigration(address newStakeTokenB, address reserveVault) internal {
        address currentStakeTokenB = stakeTokenB;
        if (currentStakeTokenB == address(0) || newStakeTokenB == address(0) || reserveVault == address(0)) {
            revert InvalidRequest();
        }
        if (legacyStakeTokenB != address(0) || newStakeTokenB == currentStakeTokenB) revert InvalidRequest();

        legacyStakeTokenB = currentStakeTokenB;
        stakeTokenB = newStakeTokenB;
        legacyTokenBReserveVault = reserveVault;
        tokenBCutoverVersion += 1;

        uint256 validatorCount = _validatorSet.length();
        for (uint256 i; i < validatorCount; ++i) {
            address validator = _validatorSet.at(i);
            totalLegacyDelegatedTokenB[validator] = totalDelegatedTokenB[validator];
        }

        emit TokenBMigrationActivated(currentStakeTokenB, newStakeTokenB, reserveVault, tokenBCutoverVersion);
    }

    /**
     * @notice Adds active token B reserves used to back migrated legacy staking positions.
     * @param amount amount of active token B to add
     */
    function depositTokenBMigrationReserve(uint256 amount) external whenNotPaused {
        if (legacyStakeTokenB == address(0) || stakeTokenB == address(0) || amount == 0) revert InvalidRequest();

        IERC20(stakeTokenB).safeTransferFrom(msg.sender, address(this), amount);
        tokenBMigrationReserve += amount;

        emit TokenBMigrationReserveFunded(msg.sender, amount);
    }

    /**
     * @notice Withdraws unused active token B migration reserve.
     * @param recipient recipient address
     * @param amount amount to withdraw
     */
    function withdrawTokenBMigrationReserve(address recipient, uint256 amount) external onlyGov {
        if (recipient == address(0) || amount == 0 || amount > tokenBMigrationReserve) revert InvalidRequest();

        tokenBMigrationReserve -= amount;
        IERC20(stakeTokenB).safeTransfer(recipient, amount);

        emit TokenBMigrationReserveWithdrawn(recipient, amount);
    }

    /**
     * @notice Migrates the caller's delegated legacy token B position to the active token B.
     * @param operatorAddress validator operator address
     */
    function migrateLegacyTokenB(
        address operatorAddress
    ) external whenNotPaused notInBlackList validatorExist(operatorAddress) {
        _migrateLegacyTokenBPosition(operatorAddress, msg.sender);
    }

    /**
     * @notice Migrates a slice of token B delegators for a validator.
     * @param operatorAddress validator operator address
     * @param offset start offset
     * @param limit max number of delegators to migrate, 0 means all remaining
     */
    function migrateLegacyTokenBDelegators(
        address operatorAddress,
        uint256 offset,
        uint256 limit
    ) external whenNotPaused validatorExist(operatorAddress) {
        if (tokenBCutoverVersion == 0) revert TokenBMigrationNotAvailable();

        uint256 totalLength = _tokenBDelegators[operatorAddress].length();
        if (offset >= totalLength) {
            return;
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        for (uint256 i; i < count; ++i) {
            _migrateLegacyTokenBPosition(operatorAddress, _tokenBDelegators[operatorAddress].at(offset + i));
        }
    }

    /**
     * @dev Sync the gov tokens of validators in operatorAddresses
     * @param operatorAddresses the operator addresses of the validators
     * @param account the account to sync gov tokens to
     */
    function syncGovToken(
        address[] calldata operatorAddresses,
        address account
    ) external whenNotPaused notInBlackList {
        uint256 _length = operatorAddresses.length;
        address[] memory stakeCredits = new address[](_length);
        address credit;
        for (uint256 i = 0; i < _length; ++i) {
            if (!_validatorSet.contains(operatorAddresses[i])) revert ValidatorNotExisted();
            credit = _validators[operatorAddresses[i]].creditContract;
            stakeCredits[i] = credit;
        }

        IGovToken(GOV_TOKEN_ADDR).syncBatch(stakeCredits, account);
    }

    /*----------------- system functions -----------------*/
    /**
     * @dev This function will be called by consensus engine. So it should never revert.
     */
    function distributeReward(
        address consensusAddress
    ) external payable onlyValidatorContract {
        address operatorAddress = consensusToOperator[consensusAddress];
        Validator memory valInfo = _validators[operatorAddress];
        if (valInfo.creditContract == address(0) || valInfo.jailed) {
            SYSTEM_REWARD_ADDR.call{ value: msg.value }("");
            emit RewardDistributeFailed(operatorAddress, "INVALID_VALIDATOR");
            return;
        }

        uint256 totalReward = msg.value;

        uint256 tokenBReward;
        uint256 totalTokenB = totalDelegatedTokenB[operatorAddress];
        if (tokenBRewardSplitBps != 0 && totalTokenB != 0) {
            tokenBReward = (totalReward * tokenBRewardSplitBps) / POWER_SCALE;
            if (tokenBReward != 0) {
                _distributeTokenBReward(operatorAddress, tokenBReward, totalTokenB);
                emit TokenBRewardDistributed(operatorAddress, tokenBReward);
            }
        }

        uint256 tokenAReward = totalReward - tokenBReward;
        if (tokenAReward != 0) {
            IStakeCredit(valInfo.creditContract).distributeReward{ value: tokenAReward }(valInfo.commission.rate);
        }
        emit RewardDistributed(operatorAddress, totalReward);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    function recordInflationMint(
        uint256 amount
    ) external onlyValidatorContract {
        if (amount == 0) {
            return;
        }

        inflationMintedAmount += amount;
        inflationLastMintTimestamp = block.timestamp;

        uint256 inflationBps = _currentInflationBps(block.timestamp / BREATHE_BLOCK_INTERVAL);
        emit InflationMintRecorded(amount, inflationBps, inflationMintedAmount, inflationBaseSupply + inflationMintedAmount);
    }

    /**
     * @dev Downtime slash. Only the `SlashIndicator` contract can call this function.
     */
    function downtimeSlash(
        address consensusAddress
    ) external onlySlash {
        address operatorAddress = consensusToOperator[consensusAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 slashAmount =
            _slashWithTokenBFirst(operatorAddress, valInfo.creditContract, downtimeSlashAmount, SlashType.DownTime);
        uint256 jailUntil = block.timestamp + downtimeJailTime;
        _jailValidator(valInfo, jailUntil);

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.DownTime);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    /**
     * @dev Malicious vote slash. Only the `SlashIndicator` contract can call this function.
     */
    function maliciousVoteSlash(
        bytes calldata voteAddress
    ) external onlySlash whenNotPaused {
        address operatorAddress = voteToOperator[voteAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 index = block.timestamp / BREATHE_BLOCK_INTERVAL;
        // This is to prevent many honest validators being slashed at the same time because of implementation bugs
        if (_felonyMap[index] >= maxFelonyBetweenBreatheBlock) revert NoMoreFelonyAllowed();
        _felonyMap[index] += 1;

        // check if the voteAddress has already expired
        if (voteExpiration[voteAddress] != 0 && voteExpiration[voteAddress] + BREATHE_BLOCK_INTERVAL < block.timestamp)
        {
            revert VoteAddressExpired();
        }

        // slash
        (bool canSlash, uint256 jailUntil) = _checkFelonyRecord(operatorAddress, SlashType.MaliciousVote);
        if (!canSlash) revert AlreadySlashed();
        uint256 slashAmount =
            _slashWithTokenBFirst(operatorAddress, valInfo.creditContract, felonySlashAmount, SlashType.MaliciousVote);
        _jailValidator(valInfo, jailUntil);

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.MaliciousVote);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    /**
     * @dev Double sign slash. Only the `SlashIndicator` contract can call this function.
     */
    function doubleSignSlash(
        address consensusAddress
    ) external onlySlash whenNotPaused {
        address operatorAddress = consensusToOperator[consensusAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 index = block.timestamp / BREATHE_BLOCK_INTERVAL;
        // This is to prevent many honest validators being slashed at the same time because of implementation bugs
        if (_felonyMap[index] >= maxFelonyBetweenBreatheBlock) revert NoMoreFelonyAllowed();
        _felonyMap[index] += 1;

        // check if the consensusAddress has already expired
        if (
            consensusExpiration[consensusAddress] != 0
                && consensusExpiration[consensusAddress] + BREATHE_BLOCK_INTERVAL < block.timestamp
        ) {
            revert ConsensusAddressExpired();
        }

        // slash
        (bool canSlash, uint256 jailUntil) = _checkFelonyRecord(operatorAddress, SlashType.DoubleSign);
        if (!canSlash) revert AlreadySlashed();
        uint256 slashAmount =
            _slashWithTokenBFirst(operatorAddress, valInfo.creditContract, felonySlashAmount, SlashType.DoubleSign);
        _jailValidator(valInfo, jailUntil);

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.DoubleSign);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    /**
     * @param key the key of the param
     * @param value the value of the param
     */
    function updateParam(string calldata key, bytes calldata value) external onlyGov {
        if (key.compareStrings("transferGasLimit")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newTransferGasLimit = value.bytesToUint256(32);
            if (newTransferGasLimit < 2300 || newTransferGasLimit > 10_000) revert InvalidValue(key, value);
            transferGasLimit = newTransferGasLimit;
        } else if (key.compareStrings("minSelfDelegationBNB")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMinSelfDelegationBNB = value.bytesToUint256(32);
            if (newMinSelfDelegationBNB < 1000 ether || newMinSelfDelegationBNB > 100_000 ether) {
                revert InvalidValue(key, value);
            }
            minSelfDelegationBNB = newMinSelfDelegationBNB;
        } else if (key.compareStrings("minDelegationBNBChange")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMinDelegationBNBChange = value.bytesToUint256(32);
            if (newMinDelegationBNBChange < 0.1 ether || newMinDelegationBNBChange > 10 ether) {
                revert InvalidValue(key, value);
            }
            minDelegationBNBChange = newMinDelegationBNBChange;
        } else if (key.compareStrings("maxElectedValidators")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMaxElectedValidators = value.bytesToUint256(32);
            if (newMaxElectedValidators == 0 || newMaxElectedValidators > 500) revert InvalidValue(key, value);
            maxElectedValidators = newMaxElectedValidators;
        } else if (key.compareStrings("unbondPeriod")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newUnbondPeriod = value.bytesToUint256(32);
            if (newUnbondPeriod < 3 days || newUnbondPeriod > 30 days) revert InvalidValue(key, value);
            unbondPeriod = newUnbondPeriod;
        } else if (key.compareStrings("redelegateFeeRate")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newRedelegateFeeRate = value.bytesToUint256(32);
            if (newRedelegateFeeRate > 100) {
                revert InvalidValue(key, value);
            }
            redelegateFeeRate = newRedelegateFeeRate;
        } else if (key.compareStrings("downtimeSlashAmount")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newDowntimeSlashAmount = value.bytesToUint256(32);
            if (newDowntimeSlashAmount < 1 ether || newDowntimeSlashAmount >= felonySlashAmount) {
                revert InvalidValue(key, value);
            }
            downtimeSlashAmount = newDowntimeSlashAmount;
        } else if (key.compareStrings("felonySlashAmount")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newFelonySlashAmount = value.bytesToUint256(32);
            if (newFelonySlashAmount < 10 ether || newFelonySlashAmount <= downtimeSlashAmount) {
                revert InvalidValue(key, value);
            }
            felonySlashAmount = newFelonySlashAmount;
        } else if (key.compareStrings("downtimeJailTime")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newDowntimeJailTime = value.bytesToUint256(32);
            if (newDowntimeJailTime < 1 days || newDowntimeJailTime >= felonyJailTime) revert InvalidValue(key, value);
            downtimeJailTime = newDowntimeJailTime;
        } else if (key.compareStrings("felonyJailTime")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newFelonyJailTime = value.bytesToUint256(32);
            if (newFelonyJailTime < 3 days || newFelonyJailTime <= downtimeJailTime) revert InvalidValue(key, value);
            felonyJailTime = newFelonyJailTime;
        } else if (key.compareStrings("maxFelonyBetweenBreatheBlock")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newJailedPerDay = value.bytesToUint256(32);
            if (newJailedPerDay == 0) revert InvalidValue(key, value);
            maxFelonyBetweenBreatheBlock = newJailedPerDay;
        } else if (key.compareStrings("stakeHubProtector")) {
            if (value.length != 20) revert InvalidValue(key, value);
            address newStakeHubProtector = value.bytesToAddress(20);
            if (newStakeHubProtector == address(0)) revert InvalidValue(key, value);
            _setProtector(newStakeHubProtector);
        } else if (key.compareStrings("maxNodeIDs")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMaxNodeIDs = value.bytesToUint256(32);
            if (newMaxNodeIDs == 0) revert InvalidValue(key, value);
            maxNodeIDs = newMaxNodeIDs;
        } else if (key.compareStrings("stakeTokenB")) {
            if (value.length != 20) revert InvalidValue(key, value);
            address newStakeTokenB = value.bytesToAddress(20);
            if (newStakeTokenB == address(0) || legacyStakeTokenB != address(0)) revert InvalidValue(key, value);
            stakeTokenB = newStakeTokenB;
        } else if (key.compareStrings("activateTokenBMigration")) {
            if (value.length != 64) revert InvalidValue(key, value);
            (address newStakeTokenB, address reserveVault) = abi.decode(value, (address, address));
            _activateTokenBMigration(newStakeTokenB, reserveVault);
        } else if (key.compareStrings("stakeWeightA")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newStakeWeightA = value.bytesToUint256(32);
            if (newStakeWeightA > 10 * POWER_SCALE) revert InvalidValue(key, value);
            stakeWeightA = newStakeWeightA;
        } else if (key.compareStrings("stakeWeightB")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newStakeWeightB = value.bytesToUint256(32);
            if (newStakeWeightB > 10 * POWER_SCALE) revert InvalidValue(key, value);
            stakeWeightB = newStakeWeightB;
        } else if (key.compareStrings("maxBPowerRatioBps")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMaxBPowerRatioBps = value.bytesToUint256(32);
            if (newMaxBPowerRatioBps == 0 || newMaxBPowerRatioBps > MAX_RATIO_BPS) revert InvalidValue(key, value);
            maxBPowerRatioBps = newMaxBPowerRatioBps;
        } else if (key.compareStrings("ratioEnabled")) {
            if (value.length != 1) revert InvalidValue(key, value);
            if (uint8(value[0]) > 1) revert InvalidValue(key, value);
            ratioEnabled = uint8(value[0]) == 1;
        } else if (key.compareStrings("minBtoARatioBps")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newMinBtoARatioBps = value.bytesToUint256(32);
            if (newMinBtoARatioBps < MIN_RATIO_BPS || newMinBtoARatioBps > MAX_RATIO_BPS) {
                revert InvalidValue(key, value);
            }
            minBtoARatioBps = newMinBtoARatioBps;
        } else if (key.compareStrings("tokenBRewardSplitBps")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newTokenBRewardSplitBps = value.bytesToUint256(32);
            if (newTokenBRewardSplitBps > POWER_SCALE) revert InvalidValue(key, value);
            if (newTokenBRewardSplitBps != 0 && stakeTokenB == address(0)) revert InvalidValue(key, value);
            tokenBRewardSplitBps = newTokenBRewardSplitBps;
        } else if (key.compareStrings("inflationEnabled")) {
            if (value.length != 1) revert InvalidValue(key, value);
            if (uint8(value[0]) > 1) revert InvalidValue(key, value);
            bool enableInflation = uint8(value[0]) == 1;
            if (enableInflation && inflationBaseSupply == 0) revert InvalidValue(key, value);
            inflationEnabled = enableInflation;
            if (enableInflation) {
                inflationLastMintTimestamp = block.timestamp;
            }
        } else if (key.compareStrings("inflationStartDayIndex")) {
            if (value.length != 32) revert InvalidValue(key, value);
            inflationStartDayIndex = value.bytesToUint256(32);
            inflationLastMintTimestamp = block.timestamp;
        } else if (key.compareStrings("inflationRateInitialBps")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newInflationRateInitialBps = value.bytesToUint256(32);
            if (
                newInflationRateInitialBps == 0 || newInflationRateInitialBps > POWER_SCALE
                    || newInflationRateInitialBps < inflationRateMinBps
            ) {
                revert InvalidValue(key, value);
            }
            inflationRateInitialBps = newInflationRateInitialBps;
        } else if (key.compareStrings("inflationRateMinBps")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newInflationRateMinBps = value.bytesToUint256(32);
            if (newInflationRateMinBps == 0 || newInflationRateMinBps > inflationRateInitialBps) {
                revert InvalidValue(key, value);
            }
            inflationRateMinBps = newInflationRateMinBps;
        } else if (key.compareStrings("inflationDecayBpsPerYear")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newInflationDecayBpsPerYear = value.bytesToUint256(32);
            if (newInflationDecayBpsPerYear > POWER_SCALE) revert InvalidValue(key, value);
            inflationDecayBpsPerYear = newInflationDecayBpsPerYear;
        } else if (key.compareStrings("inflationBaseSupply")) {
            if (value.length != 32) revert InvalidValue(key, value);
            uint256 newInflationBaseSupply = value.bytesToUint256(32);
            if (newInflationBaseSupply == 0) revert InvalidValue(key, value);
            inflationBaseSupply = newInflationBaseSupply;
            inflationLastMintTimestamp = block.timestamp;
        } else {
            revert UnknownParam(key, value);
        }
        emit ParamChange(key, value);
    }

    /*----------------- view functions -----------------*/
    /**
     * @param operatorAddress the operator address of the validator
     * @param index the index of the day to query(timestamp / 1 days)
     *
     * @return the validator's reward of the day
     */
    function getValidatorRewardRecord(address operatorAddress, uint256 index) external view returns (uint256) {
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted();
        return IStakeCredit(_validators[operatorAddress].creditContract).rewardRecord(index);
    }

    /**
     * @param operatorAddress the operator address of the validator
     * @param index the index of the day to query(timestamp / 1 days)
     *
     * @return the validator's total pooled BNB of the day
     */
    function getValidatorTotalPooledBNBRecord(address operatorAddress, uint256 index) external view returns (uint256) {
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted();
        return IStakeCredit(_validators[operatorAddress].creditContract).totalPooledBNBRecord(index);
    }

    /**
     * @notice pagination query all validators' operator address and credit contract address
     *
     * @param offset the offset of the query
     * @param limit the limit of the query
     *
     * @return operatorAddrs operator addresses
     * @return creditAddrs credit contract addresses
     * @return totalLength total number of validators
     */
    function getValidators(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory operatorAddrs, address[] memory creditAddrs, uint256 totalLength) {
        totalLength = _validatorSet.length();
        if (offset >= totalLength) {
            return (operatorAddrs, creditAddrs, totalLength);
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        operatorAddrs = new address[](count);
        creditAddrs = new address[](count);
        for (uint256 i; i < count; ++i) {
            operatorAddrs[i] = _validatorSet.at(offset + i);
            creditAddrs[i] = _validators[operatorAddrs[i]].creditContract;
        }
    }

    /**
     * @notice get the consensus address of a validator
     *
     * @param operatorAddress the operator address of the validator
     *
     * @return consensusAddress the consensus address of the validator
     */
    function getValidatorConsensusAddress(
        address operatorAddress
    ) external view returns (address consensusAddress) {
        Validator memory valInfo = _validators[operatorAddress];
        consensusAddress = valInfo.consensusAddress;
    }

    /**
     * @notice get the credit contract address of a validator
     *
     * @param operatorAddress the operator address of the validator
     *
     * @return creditContract the credit contract address of the validator
     */
    function getValidatorCreditContract(
        address operatorAddress
    ) external view returns (address creditContract) {
        Validator memory valInfo = _validators[operatorAddress];
        creditContract = valInfo.creditContract;
    }

    /**
     * @notice get the vote address of a validator
     *
     * @param operatorAddress the operator address of the validator
     *
     * @return voteAddress the vote address of the validator
     */
    function getValidatorVoteAddress(
        address operatorAddress
    ) external view returns (bytes memory voteAddress) {
        Validator memory valInfo = _validators[operatorAddress];
        voteAddress = valInfo.voteAddress;
    }

    /**
     * @notice get the basic info of a validator
     *
     * @param operatorAddress the operator address of the validator
     *
     * @return createdTime the creation time of the validator
     * @return jailed whether the validator is jailed
     * @return jailUntil the jail time of the validator
     */
    function getValidatorBasicInfo(
        address operatorAddress
    ) external view returns (uint256 createdTime, bool jailed, uint256 jailUntil) {
        Validator memory valInfo = _validators[operatorAddress];
        createdTime = valInfo.createdTime;
        jailed = valInfo.jailed;
        jailUntil = valInfo.jailUntil;
    }

    /**
     * @param operatorAddress the operator address of the validator
     *
     * @return the description of a validator
     */
    function getValidatorDescription(
        address operatorAddress
    ) external view validatorExist(operatorAddress) returns (Description memory) {
        return _validators[operatorAddress].description;
    }

    /**
     * @param operatorAddress the operator address of the validator
     *
     * @return the commission of a validator
     */
    function getValidatorCommission(
        address operatorAddress
    ) external view validatorExist(operatorAddress) returns (Commission memory) {
        return _validators[operatorAddress].commission;
    }

    /**
     * @param operatorAddress the operator address of the validator
     *
     * @return the agent of a validator
     */
    function getValidatorAgent(
        address operatorAddress
    ) external view validatorExist(operatorAddress) returns (address) {
        return _validators[operatorAddress].agent;
    }

    /**
     * @param operatorAddress the operator address of the validator
     *
     * @return the updateTime of a validator
     */
    function getValidatorUpdateTime(
        address operatorAddress
    ) external view validatorExist(operatorAddress) returns (uint256) {
        return _validators[operatorAddress].updateTime;
    }

    /**
     * @dev this function will be used by Parlia consensus engine.
     *
     * @notice get the election info of a validator
     *
     * @param offset the offset of the query
     * @param limit the limit of the query
     *
     * @return consensusAddrs the consensus addresses of the validators
     * @return votingPowers the voting powers of the validators. The voting power will be 0 if the validator is jailed.
     * @return voteAddrs the vote addresses of the validators
     * @return totalLength the total number of validators
     */
    function getValidatorElectionInfo(
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            address[] memory consensusAddrs,
            uint256[] memory votingPowers,
            bytes[] memory voteAddrs,
            uint256 totalLength
        )
    {
        totalLength = _validatorSet.length();
        if (offset >= totalLength) {
            return (consensusAddrs, votingPowers, voteAddrs, totalLength);
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        consensusAddrs = new address[](count);
        votingPowers = new uint256[](count);
        voteAddrs = new bytes[](count);
        for (uint256 i; i < count; ++i) {
            address operatorAddress = _validatorSet.at(offset + i);
            Validator memory valInfo = _validators[operatorAddress];
            consensusAddrs[i] = valInfo.consensusAddress;
            if (valInfo.jailed) {
                votingPowers[i] = 0;
            } else {
                uint256 stakeA = IStakeCredit(valInfo.creditContract).totalPooledBNB();
                uint256 stakeB = totalDelegatedTokenB[operatorAddress];
                votingPowers[i] = _effectiveVotingPower(stakeA, stakeB);
            }
            voteAddrs[i] = valInfo.voteAddress;
        }
    }

    /**
     * @notice Returns delegated token B amount for a validator/delegator pair.
     */
    function getDelegatedTokenB(address operatorAddress, address delegator) external view returns (uint256) {
        return _delegatedTokenB[operatorAddress][delegator];
    }

    /**
     * @notice Returns remaining delegated legacy token B amount for a validator/delegator pair.
     */
    function getLegacyDelegatedTokenB(address operatorAddress, address delegator) external view returns (uint256) {
        return _legacyDelegatedTokenBAmount(operatorAddress, delegator);
    }

    /**
     * @notice Returns token B delegators for a validator.
     */
    function getTokenBDelegators(
        address operatorAddress,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory delegators, uint256 totalLength) {
        totalLength = _tokenBDelegators[operatorAddress].length();
        if (offset >= totalLength) {
            return (delegators, totalLength);
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        delegators = new address[](count);
        for (uint256 i; i < count; ++i) {
            delegators[i] = _tokenBDelegators[operatorAddress].at(offset + i);
        }
    }

    /**
     * @notice Returns token B unbond request by queue index for a validator/delegator pair.
     */
    function tokenBUnbondRequest(
        address operatorAddress,
        address delegator,
        uint256 index
    ) external view returns (uint256 tokenBAmount, uint256 unlockTime) {
        uint256 head = _tokenBUnbondHead[operatorAddress][delegator];
        uint256 tail = _tokenBUnbondTail[operatorAddress][delegator];
        if (head + index >= tail) revert InvalidRequest();

        TokenBUnbondRequest memory request = _tokenBUnbondRequests[operatorAddress][delegator][head + index];
        tokenBAmount = request.tokenBAmount;
        unlockTime = request.unlockTime;
    }

    /**
     * @notice Returns total pending token B unbond requests for a validator/delegator pair.
     */
    function pendingTokenBUnbondRequest(address operatorAddress, address delegator) external view returns (uint256) {
        return _tokenBUnbondTail[operatorAddress][delegator] - _tokenBUnbondHead[operatorAddress][delegator];
    }

    /**
     * @notice Returns total claimable token B unbond requests for a validator/delegator pair.
     */
    function claimableTokenBUnbondRequest(address operatorAddress, address delegator) external view returns (uint256) {
        uint256 head = _tokenBUnbondHead[operatorAddress][delegator];
        uint256 tail = _tokenBUnbondTail[operatorAddress][delegator];
        uint256 count;

        while (head < tail) {
            TokenBUnbondRequest memory request = _tokenBUnbondRequests[operatorAddress][delegator][head];
            if (block.timestamp < request.unlockTime) {
                break;
            }
            ++count;
            ++head;
        }

        return count;
    }

    /**
     * @notice Returns claimable token B reward amount for validator/delegator.
     */
    function pendingTokenBReward(address operatorAddress, address delegator) external view returns (uint256) {
        uint256 pending = _pendingTokenBReward[operatorAddress][delegator];
        uint256 delegatedAmount = _delegatedTokenB[operatorAddress][delegator];
        if (delegatedAmount == 0) {
            return pending;
        }

        uint256 accumulated = (delegatedAmount * _accTokenBRewardPerShare[operatorAddress]) / TOKEN_B_REWARD_PRECISION;
        uint256 debt = _tokenBRewardDebt[operatorAddress][delegator];
        if (accumulated > debt) {
            pending += accumulated - debt;
        }
        return pending;
    }

    /**
     * @notice Returns effective inflation bps for a given day index.
     */
    function currentInflationBps(
        uint256 dayIndex
    ) external view returns (uint256) {
        return _currentInflationBps(dayIndex);
    }

    function inflationEffectiveSupply() external view returns (uint256) {
        return inflationBaseSupply + inflationMintedAmount;
    }

    /**
     * @notice Adds multiple new NodeIDs to the validator's registry.
     * @param nodeIDs Array of NodeIDs to be added.
     */
    function addNodeIDs(
        bytes32[] calldata nodeIDs
    ) external whenNotPaused notInBlackList validatorExist(_bep563MsgSender()) {
        maxNodeIDsInitializer();

        if (nodeIDs.length == 0) {
            revert InvalidNodeID();
        }

        address operatorAddress = _bep563MsgSender();
        bytes32[] storage existingNodeIDs = validatorNodeIDs[operatorAddress];
        uint256 currentLength = existingNodeIDs.length;

        if (currentLength + nodeIDs.length > maxNodeIDs) {
            revert ExceedsMaxNodeIDs();
        }

        // Check for duplicates in new NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            if (nodeIDs[i] == bytes32(0)) {
                revert InvalidNodeID();
            }
            for (uint256 j = i + 1; j < nodeIDs.length; j++) {
                if (nodeIDs[i] == nodeIDs[j]) {
                    revert DuplicateNodeID();
                }
            }
        }

        // Check for duplicates in existing NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            for (uint256 j = 0; j < currentLength; j++) {
                if (nodeIDs[i] == existingNodeIDs[j]) {
                    revert DuplicateNodeID();
                }
            }
        }

        // Add new NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            existingNodeIDs.push(nodeIDs[i]);
            emit NodeIDAdded(operatorAddress, nodeIDs[i]);
        }
    }

    /**
     * @notice Removes multiple NodeIDs from the validator's registry.
     * @param targetNodeIDs Array of NodeIDs to be removed.
     */
    function removeNodeIDs(
        bytes32[] calldata targetNodeIDs
    ) external whenNotPaused notInBlackList validatorExist(_bep563MsgSender()) {
        address validator = _bep563MsgSender();
        bytes32[] storage nodeIDs = validatorNodeIDs[validator];
        uint256 length = nodeIDs.length;

        // If targetNodeIDs is empty, remove all NodeIDs
        if (targetNodeIDs.length == 0) {
            for (uint256 i = 0; i < length; i++) {
                emit NodeIDRemoved(validator, nodeIDs[i]);
            }
            delete validatorNodeIDs[validator];
            return;
        }

        // Otherwise, remove specific NodeIDs
        for (uint256 i = 0; i < targetNodeIDs.length; i++) {
            bytes32 nodeID = targetNodeIDs[i];
            for (uint256 j = 0; j < length; j++) {
                if (nodeIDs[j] == nodeID) {
                    // Swap and pop
                    nodeIDs[j] = nodeIDs[length - 1];
                    nodeIDs.pop();
                    length--;
                    emit NodeIDRemoved(validator, nodeID);
                    break;
                }
            }
        }

        // Clean up storage if no NodeIDs left
        if (nodeIDs.length == 0) {
            delete validatorNodeIDs[validator];
        }
    }

    /**
     * @notice Returns all validators with their consensus addresses and registered NodeIDs.
     * @param validatorsToQuery The operator addresses of the validators.
     * @return consensusAddresses Array of consensus addresses corresponding to the validators.
     * @return nodeIDsList Array of NodeIDs for each validator.
     */
    function getNodeIDs(
        address[] calldata validatorsToQuery
    ) external view returns (address[] memory consensusAddresses, bytes32[][] memory nodeIDsList) {
        uint256 len = validatorsToQuery.length;
        consensusAddresses = new address[](len);
        nodeIDsList = new bytes32[][](len);

        for (uint256 i = 0; i < len; i++) {
            address operator = validatorsToQuery[i];
            Validator memory valInfo = _validators[operator];
            consensusAddresses[i] = valInfo.consensusAddress;
            nodeIDsList[i] = validatorNodeIDs[operator];
        }

        return (consensusAddresses, nodeIDsList);
    }

    /*----------------- internal functions -----------------*/
    function _checkMoniker(
        string memory moniker
    ) internal pure returns (bool) {
        bytes memory bz = bytes(moniker);

        // 1. moniker length should be between 3 and 9
        if (bz.length < 3 || bz.length > 9) {
            return false;
        }

        // 2. first character should be uppercase
        if (uint8(bz[0]) < 65 || uint8(bz[0]) > 90) {
            return false;
        }

        // 3. only alphanumeric characters are allowed
        for (uint256 i = 1; i < bz.length; ++i) {
            // Check if the ASCII value of the character falls outside the range of alphanumeric characters
            if (
                (uint8(bz[i]) < 48 || uint8(bz[i]) > 57) && (uint8(bz[i]) < 65 || uint8(bz[i]) > 90)
                    && (uint8(bz[i]) < 97 || uint8(bz[i]) > 122)
            ) {
                // Character is a special character
                return false;
            }
        }

        // No special characters found
        return true;
    }

    function _checkVoteAddress(
        address operatorAddress,
        bytes calldata voteAddress,
        bytes calldata blsProof
    ) internal view returns (bool) {
        if (voteAddress.length != BLS_PUBKEY_LENGTH || blsProof.length != BLS_SIG_LENGTH) {
            return false;
        }

        // get msg hash
        bytes32 msgHash = keccak256(abi.encodePacked(operatorAddress, voteAddress, block.chainid));
        bytes memory msgBz = new bytes(32);
        assembly {
            mstore(add(msgBz, 32), msgHash)
        }

        // call the precompiled contract to verify the BLS signature
        // the precompiled contract's address is 0x66
        bytes memory input = bytes.concat(msgBz, blsProof, voteAddress); // length: 32 + 96 + 48 = 176
        bytes memory output = new bytes(1);
        assembly {
            let len := mload(input)
            if iszero(staticcall(not(0), 0x66, add(input, 0x20), len, add(output, 0x20), 0x01)) { revert(0, 0) }
        }
        uint8 result = uint8(output[0]);
        if (result != uint8(1)) {
            return false;
        }
        return true;
    }

    function _deployStakeCredit(address operatorAddress, string memory moniker) internal returns (address) {
        address creditProxy = address(new TransparentUpgradeableProxy(STAKE_CREDIT_ADDR, DEAD_ADDRESS, ""));
        IStakeCredit(creditProxy).initialize{ value: msg.value }(operatorAddress, moniker);
        emit StakeCreditInitialized(operatorAddress, creditProxy);

        return creditProxy;
    }

    function _checkValidatorSelfDelegation(
        address operatorAddress
    ) internal {
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.jailed) {
            return;
        }
        if (IStakeCredit(valInfo.creditContract).getPooledBNB(operatorAddress) < minSelfDelegationBNB) {
            _jailValidator(valInfo, block.timestamp + downtimeJailTime);
            IBSCValidatorSet(VALIDATOR_CONTRACT_ADDR).felony(valInfo.consensusAddress);
        }
    }

    function _checkFelonyRecord(address operatorAddress, SlashType slashType) internal returns (bool, uint256) {
        bytes32 slashKey = keccak256(abi.encodePacked(operatorAddress, slashType));
        uint256 jailUntil = _felonyRecords[slashKey];
        // for double sign and malicious vote slash
        // if the validator is already jailed, no need to slash again
        if (jailUntil > block.timestamp) {
            return (false, 0);
        }
        jailUntil = block.timestamp + felonyJailTime;
        _felonyRecords[slashKey] = jailUntil;
        return (true, jailUntil);
    }

    function _jailValidator(Validator storage valInfo, uint256 jailUntil) internal {
        // keep the last eligible validator
        bool isLast = (numOfJailed >= _validatorSet.length() - 1);
        if (isLast) {
            // If staking channel is closed, then BC-fusion is finished and we should keep the last eligible validator here
            emit ValidatorEmptyJailed(valInfo.operatorAddress);
            return;
        }

        if (jailUntil > valInfo.jailUntil) {
            valInfo.jailUntil = jailUntil;
        }

        if (!valInfo.jailed) {
            valInfo.jailed = true;
            numOfJailed += 1;

            emit ValidatorJailed(valInfo.operatorAddress);
        }
    }

    function _claim(address operatorAddress, uint256 requestNumber) internal validatorExist(operatorAddress) {
        uint256 bnbAmount = IStakeCredit(_validators[operatorAddress].creditContract).claim(msg.sender, requestNumber);
        emit Claimed(operatorAddress, msg.sender, bnbAmount);
    }

    function _queueTokenBUnbond(address operatorAddress, address delegator, uint256 tokenBAmount) internal {
        uint256 tail = _tokenBUnbondTail[operatorAddress][delegator];
        _tokenBUnbondRequests[operatorAddress][delegator][tail] =
            TokenBUnbondRequest({ tokenBAmount: tokenBAmount, unlockTime: block.timestamp + unbondPeriod });
        _tokenBUnbondRequestVersion[operatorAddress][delegator][tail] = tokenBCutoverVersion;
        _tokenBUnbondTail[operatorAddress][delegator] = tail + 1;
    }

    function _claimTokenB(address operatorAddress, address delegator, uint256 requestNumber) internal {
        if (stakeTokenB == address(0)) revert InvalidRequest();
        _migrateLegacyTokenBPosition(operatorAddress, delegator);

        uint256 head = _tokenBUnbondHead[operatorAddress][delegator];
        uint256 tail = _tokenBUnbondTail[operatorAddress][delegator];
        if (head >= tail) revert InvalidRequest();

        uint256 requestCount = tail - head;
        uint256 number = requestNumber == 0 || requestNumber > requestCount ? requestCount : requestNumber;

        uint256 activeTokenBAmount;
        uint256 legacyTokenBAmount;
        while (number != 0) {
            TokenBUnbondRequest memory request = _tokenBUnbondRequests[operatorAddress][delegator][head];
            if (block.timestamp < request.unlockTime) {
                break;
            }

            uint256 requestVersion = _tokenBUnbondRequestVersion[operatorAddress][delegator][head];
            if (tokenBCutoverVersion != 0 && requestVersion < tokenBCutoverVersion) {
                legacyTokenBAmount += request.tokenBAmount;
            } else {
                activeTokenBAmount += request.tokenBAmount;
            }
            delete _tokenBUnbondRequests[operatorAddress][delegator][head];
            delete _tokenBUnbondRequestVersion[operatorAddress][delegator][head];
            ++head;
            --number;
        }
        if (activeTokenBAmount == 0 && legacyTokenBAmount == 0) revert InvalidRequest();

        _tokenBUnbondHead[operatorAddress][delegator] = head;
        if (activeTokenBAmount != 0) {
            IERC20(stakeTokenB).safeTransfer(delegator, activeTokenBAmount);
        }
        if (legacyTokenBAmount != 0) {
            address legacyToken = legacyStakeTokenB == address(0) ? stakeTokenB : legacyStakeTokenB;
            IERC20(legacyToken).safeTransfer(delegator, legacyTokenBAmount);
            emit LegacyTokenBClaimed(operatorAddress, delegator, legacyTokenBAmount);
        }

        emit TokenBClaimed(operatorAddress, delegator, activeTokenBAmount + legacyTokenBAmount);
    }

    function _claimTokenBReward(address operatorAddress, address delegator) internal {
        _migrateLegacyTokenBPosition(operatorAddress, delegator);
        _settleTokenBReward(operatorAddress, delegator);
        uint256 reward = _pendingTokenBReward[operatorAddress][delegator];
        if (reward == 0) revert InvalidRequest();

        _pendingTokenBReward[operatorAddress][delegator] = 0;
        (bool success,) = payable(delegator).call{ value: reward, gas: transferGasLimit }("");
        if (!success) revert TransferFailed();

        emit TokenBRewardClaimed(operatorAddress, delegator, reward);
    }

    function _settleTokenBReward(address operatorAddress, address delegator) internal {
        uint256 delegatedAmount = _delegatedTokenB[operatorAddress][delegator];
        if (delegatedAmount == 0) {
            _tokenBRewardDebt[operatorAddress][delegator] = 0;
            return;
        }

        uint256 accumulated = (delegatedAmount * _accTokenBRewardPerShare[operatorAddress]) / TOKEN_B_REWARD_PRECISION;
        uint256 debt = _tokenBRewardDebt[operatorAddress][delegator];
        if (accumulated > debt) {
            _pendingTokenBReward[operatorAddress][delegator] += accumulated - debt;
        }
        _tokenBRewardDebt[operatorAddress][delegator] = accumulated;
    }

    function _syncTokenBRewardDebt(address operatorAddress, address delegator) internal {
        uint256 delegatedAmount = _delegatedTokenB[operatorAddress][delegator];
        _tokenBRewardDebt[operatorAddress][delegator] =
            (delegatedAmount * _accTokenBRewardPerShare[operatorAddress]) / TOKEN_B_REWARD_PRECISION;
    }

    function _distributeTokenBReward(address operatorAddress, uint256 reward, uint256 totalTokenB) internal {
        _accTokenBRewardPerShare[operatorAddress] += (reward * TOKEN_B_REWARD_PRECISION) / totalTokenB;
    }

    function _slashWithTokenBFirst(
        address operatorAddress,
        address creditContract,
        uint256 slashAmount,
        SlashType slashType
    ) internal returns (uint256 bnbSlashAmount) {
        uint256 remaining = slashAmount;

        if (stakeTokenB != address(0)) {
            _migrateLegacyTokenBPosition(operatorAddress, operatorAddress);
            uint256 selfTokenBAmount = _delegatedTokenB[operatorAddress][operatorAddress];
            if (selfTokenBAmount != 0) {
                _settleTokenBReward(operatorAddress, operatorAddress);
                uint256 tokenBSlashAmount = selfTokenBAmount > remaining ? remaining : selfTokenBAmount;
                _delegatedTokenB[operatorAddress][operatorAddress] = selfTokenBAmount - tokenBSlashAmount;
                totalDelegatedTokenB[operatorAddress] -= tokenBSlashAmount;
                _syncTokenBRewardDebt(operatorAddress, operatorAddress);
                if (_delegatedTokenB[operatorAddress][operatorAddress] == 0) {
                    _tokenBDelegators[operatorAddress].remove(operatorAddress);
                }
                IERC20(stakeTokenB).safeTransfer(SYSTEM_REWARD_ADDR, tokenBSlashAmount);
                emit TokenBSlashed(operatorAddress, tokenBSlashAmount, uint8(slashType));
                remaining -= tokenBSlashAmount;
            }
        }

        if (remaining != 0) {
            bnbSlashAmount = IStakeCredit(creditContract).slash(remaining);
        }
    }

    function _legacyDelegatedTokenBAmount(address operatorAddress, address delegator) internal view returns (uint256) {
        if (tokenBCutoverVersion == 0 || _tokenBDelegationVersion[operatorAddress][delegator] >= tokenBCutoverVersion) {
            return 0;
        }
        return _delegatedTokenB[operatorAddress][delegator];
    }

    function _migrateLegacyTokenBPosition(address operatorAddress, address delegator) internal {
        uint256 currentVersion = tokenBCutoverVersion;
        if (currentVersion == 0) {
            return;
        }

        if (_tokenBDelegationVersion[operatorAddress][delegator] >= currentVersion) {
            return;
        }

        uint256 legacyAmount = _delegatedTokenB[operatorAddress][delegator];
        _tokenBDelegationVersion[operatorAddress][delegator] = currentVersion;
        if (legacyAmount == 0) {
            return;
        }
        if (legacyStakeTokenB == address(0) || legacyTokenBReserveVault == address(0)) {
            revert TokenBMigrationNotAvailable();
        }
        if (tokenBMigrationReserve < legacyAmount) {
            revert InsufficientTokenBMigrationReserve();
        }

        tokenBMigrationReserve -= legacyAmount;
        totalLegacyDelegatedTokenB[operatorAddress] -= legacyAmount;
        IERC20(legacyStakeTokenB).safeTransfer(legacyTokenBReserveVault, legacyAmount);

        emit LegacyTokenBMigrated(operatorAddress, delegator, legacyAmount);
    }

    function _bep410MsgSender() internal view returns (address) {
        if (agentToOperator[msg.sender] != address(0)) {
            return agentToOperator[msg.sender];
        }

        return msg.sender;
    }

    function _bep563MsgSender() internal view returns (address) {
        if (consensusToOperator[msg.sender] != address(0)) {
            return consensusToOperator[msg.sender];
        }

        return _bep410MsgSender();
    }

    function maxNodeIDsInitializer() internal {
        if (maxNodeIDs == 0) {
            maxNodeIDs = INIT_MAX_NUMBER_NODE_ID;
        }
    }

    function _effectiveVotingPower(uint256 stakeA, uint256 stakeB) internal view returns (uint256) {
        uint256 weightedA = (stakeA * stakeWeightA) / POWER_SCALE;
        uint256 weightedB = (stakeB * stakeWeightB) / POWER_SCALE;

        if (weightedA == 0) {
            return 0;
        }

        if (ratioEnabled && minBtoARatioBps > 0 && stakeB * POWER_SCALE < stakeA * minBtoARatioBps) {
            weightedB = 0;
        }

        uint256 maxBWeighted = (weightedA * maxBPowerRatioBps) / POWER_SCALE;
        if (weightedB > maxBWeighted) {
            weightedB = maxBWeighted;
        }

        return weightedA + weightedB;
    }

    function _currentInflationBps(uint256 dayIndex) internal view returns (uint256) {
        if (dayIndex <= inflationStartDayIndex) {
            return inflationRateInitialBps;
        }

        uint256 yearsElapsed = (dayIndex - inflationStartDayIndex) / 365;
        uint256 current = inflationRateInitialBps;
        for (uint256 i; i < yearsElapsed; ++i) {
            current = (current * (POWER_SCALE - inflationDecayBpsPerYear)) / POWER_SCALE;
            if (current <= inflationRateMinBps) {
                return inflationRateMinBps;
            }
        }
        if (current < inflationRateMinBps) {
            return inflationRateMinBps;
        }
        return current;
    }
}
