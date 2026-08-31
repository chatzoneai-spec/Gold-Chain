// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface StakeHub {
    type SlashType is uint8;
    type StakeMigrationRespCode is uint8;

    struct Commission {
        uint64 rate;
        uint64 maxRate;
        uint64 maxChangeRate;
    }

    struct Description {
        string moniker;
        string identity;
        string website;
        string details;
    }

    error AlreadyPaused();
    error AlreadySlashed();
    error ConsensusAddressExpired();
    error DelegationAmountTooSmall();
    error DuplicateConsensusAddress();
    error DuplicateMoniker();
    error DuplicateVoteAddress();
    error InBlackList();
    error InvalidCommission();
    error InvalidConsensusAddress();
    error InvalidMoniker();
    error InvalidRequest();
    error InvalidSynPackage();
    error InvalidValue(string key, bytes value);
    error InvalidVoteAddress();
    error JailTimeNotExpired();
    error NoMoreFelonyAllowed();
    error NotPaused();
    error OnlyCoinbase();
    error OnlyProtector();
    error OnlySelfDelegation();
    error OnlySystemContract(address systemContract);
    error OnlyZeroGasPrice();
    error SameValidator();
    error SelfDelegationNotEnough();
    error TransferFailed();
    error UnknownParam(string key, bytes value);
    error UpdateTooFrequently();
    error ValidatorExisted();
    error ValidatorNotExisted();
    error ValidatorNotJailed();
    error VoteAddressExpired();
    error ZeroShares();
    error InvalidAgent();
    error InvalidValidator();
    error TokenBMigrationNotAvailable();
    error InsufficientTokenBMigrationReserve();
    error SlashReserveNotConfigured();
    error InflationScheduleExceeded();
    error InvalidInflationMintAmount(uint256 expectedAmount, uint256 actualAmount);
    error InflationAlreadyRecorded(uint256 dayIndex);

    event BlackListed(address indexed target);
    event Claimed(address indexed operatorAddress, address indexed delegator, uint256 giltAmount);
    event CommissionRateEdited(address indexed operatorAddress, uint64 newCommissionRate);
    event ConsensusAddressEdited(address indexed operatorAddress, address indexed newConsensusAddress);
    event Delegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount);
    event DescriptionEdited(address indexed operatorAddress);
    event Initialized(uint8 version);
    event MigrateFailed(
        address indexed operatorAddress, address indexed delegator, uint256 giltAmount, StakeMigrationRespCode respCode
    );
    event MigrateSuccess(
        address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount
    );
    event ParamChange(string key, bytes value);
    event Paused();
    event ProtectorChanged(address indexed oldProtector, address indexed newProtector);
    event Redelegated(
        address indexed srcValidator,
        address indexed dstValidator,
        address indexed delegator,
        uint256 oldShares,
        uint256 newShares,
        uint256 giltAmount
    );
    event Resumed();
    event RewardDistributeFailed(address indexed operatorAddress, bytes failReason);
    event RewardDistributed(address indexed operatorAddress, uint256 reward);
    event TokenBRewardDistributed(address indexed operatorAddress, uint256 reward);
    event TokenBRewardClaimed(address indexed operatorAddress, address indexed delegator, uint256 reward);
    event LegacyTokenBClaimed(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event LegacyTokenBMigrated(address indexed operatorAddress, address indexed delegator, uint256 tokenBAmount);
    event TokenBMigrationActivated(
        address indexed legacyToken, address indexed newToken, address indexed reserveVault, uint256 cutoverVersion
    );
    event TokenBMigrationReserveFunded(address indexed sender, uint256 amount);
    event TokenBMigrationReserveWithdrawn(address indexed recipient, uint256 amount);
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
    event ConsensusEmergencyHalt(
        address indexed operatorAddress, address indexed consensusAddress, uint256 triggerBlock
    );
    event StakeCreditInitialized(address indexed operatorAddress, address indexed creditContract);
    event UnBlackListed(address indexed target);
    event Undelegated(address indexed operatorAddress, address indexed delegator, uint256 shares, uint256 giltAmount);
    event UnexpectedPackage(uint8 channelId, bytes msgBytes);
    event ValidatorCreated(
        address indexed consensusAddress,
        address indexed operatorAddress,
        address indexed creditContract,
        bytes voteAddress
    );
    event ValidatorEmptyJailed(address indexed operatorAddress);
    event ValidatorJailed(address indexed operatorAddress);
    event ValidatorSlashed(
        address indexed operatorAddress, uint256 jailUntil, uint256 slashAmount, SlashType slashType
    );
    event ValidatorUnjailed(address indexed operatorAddress);
    event VoteAddressEdited(address indexed operatorAddress, bytes newVoteAddress);
    event AgentChanged(address indexed operatorAddress, address indexed oldAgent, address indexed newAgent);
    event NodeIDAdded(address indexed validator, bytes32 nodeID);
    event NodeIDRemoved(address indexed validator, bytes32 nodeID);

    receive() external payable;

    function BC_FUSION_CHANNELID() external view returns (uint8);
    function BREATHE_BLOCK_INTERVAL() external view returns (uint256);
    function DEAD_ADDRESS() external view returns (address);
    function LOCK_AMOUNT() external view returns (uint256);
    function REDELEGATE_FEE_RATE_BASE() external view returns (uint256);
    function STAKING_CHANNELID() external view returns (uint8);
    function addToBlackList(
        address account
    ) external;
    function blackList(
        address
    ) external view returns (bool);
    function claim(
        address operatorAddress,
        uint256 requestNumber
    ) external;
    function claimBatch(
        address[] memory operatorAddresses,
        uint256[] memory requestNumbers
    ) external;
    function claimTokenB(
        address operatorAddress,
        uint256 requestNumber
    ) external;
    function claimTokenBBatch(
        address[] memory operatorAddresses,
        uint256[] memory requestNumbers
    ) external;
    function claimTokenBReward(
        address operatorAddress
    ) external;
    function claimTokenBRewardBatch(
        address[] calldata operatorAddresses
    ) external;
    function consensusExpiration(
        address
    ) external view returns (uint256);
    function consensusToOperator(
        address
    ) external view returns (address);
    function createValidator(
        address consensusAddress,
        bytes memory voteAddress,
        bytes memory blsProof,
        Commission memory commission,
        Description memory description
    ) external payable;
    function delegate(
        address operatorAddress,
        bool delegateVotePower
    ) external payable;
    function distributeReward(
        address consensusAddress
    ) external payable;
    function doubleSignSlash(
        address consensusAddress
    ) external;
    function downtimeJailTime() external view returns (uint256);
    function downtimeSlash(
        address consensusAddress
    ) external;
    function downtimeSlashAmount() external view returns (uint256);
    function editCommissionRate(
        uint64 commissionRate
    ) external;
    function editConsensusAddress(
        address newConsensusAddress
    ) external;
    function editDescription(
        Description memory description
    ) external;
    function editVoteAddress(
        bytes memory newVoteAddress,
        bytes memory blsProof
    ) external;
    function felonyJailTime() external view returns (uint256);
    function felonySlashAmount() external view returns (uint256);
    function getValidatorBasicInfo(
        address operatorAddress
    ) external view returns (uint256 createdTime, bool jailed, uint256 jailUntil);
    function getValidatorCommission(
        address operatorAddress
    ) external view returns (Commission memory);
    function getValidatorConsensusAddress(
        address operatorAddress
    ) external view returns (address consensusAddress);
    function getValidatorCreditContract(
        address operatorAddress
    ) external view returns (address creditContract);
    function getValidatorDescription(
        address operatorAddress
    ) external view returns (Description memory);
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
        );
    function getValidatorRewardRecord(
        address operatorAddress,
        uint256 index
    ) external view returns (uint256);
    function getValidatorTotalPooledGILTRecord(
        address operatorAddress,
        uint256 index
    ) external view returns (uint256);
    function getValidatorVoteAddress(
        address operatorAddress
    ) external view returns (bytes memory voteAddress);
    function getValidators(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory operatorAddrs, address[] memory creditAddrs, uint256 totalLength);
    function handleAckPackage(
        uint8 channelId,
        bytes memory msgBytes
    ) external;
    function handleFailAckPackage(
        uint8 channelId,
        bytes memory msgBytes
    ) external;
    function handleSynPackage(
        uint8,
        bytes memory msgBytes
    ) external returns (bytes memory);
    function initialize() external;
    function isPaused() external view returns (bool);
    function maliciousVoteSlash(
        bytes memory voteAddress
    ) external;
    function maxElectedValidators() external view returns (uint256);
    function maxFelonyBetweenBreatheBlock() external view returns (uint256);
    function maxBPowerRatioBps() external view returns (uint256);
    function tokenBRewardSplitBps() external view returns (uint256);
    function inflationEnabled() external view returns (bool);
    function inflationStartDayIndex() external view returns (uint256);
    function inflationRateInitialBps() external view returns (uint256);
    function inflationRateMinBps() external view returns (uint256);
    function inflationDecayBpsPerYear() external view returns (uint256);
    function inflationBaseSupply() external view returns (uint256);
    function inflationMintedAmount() external view returns (uint256);
    function inflationLastMintTimestamp() external view returns (uint256);
    function inflationDistributedAmount() external view returns (uint256);
    function inflationRedirectedAmount() external view returns (uint256);
    function inflationPendingAmount() external view returns (uint256);
    function inflationMintedByDay(
        uint256 dayIndex
    ) external view returns (uint256);
    function inflationRecorderByDay(
        uint256 dayIndex
    ) external view returns (address);
    function slashReserveVault() external view returns (address);
    function slashReserveAmountById(
        uint256 tokenId
    ) external view returns (uint256);
    function slashReserveSelfMigrationCompleted() external view returns (bool);
    function pendingSystemReward() external view returns (uint256);
    function pendingSystemRewardAutoRetryCap() external view returns (uint256);
    function pendingInflationSystemReward() external view returns (uint256);
    function minDelegationGILTChange() external view returns (uint256);
    function minBtoARatioBps() external view returns (uint256);
    function minSelfDelegationGILT() external view returns (uint256);
    function numOfJailed() external view returns (uint256);
    function pause() external;
    function redelegate(
        address srcValidator,
        address dstValidator,
        uint256 shares,
        bool delegateVotePower
    ) external;
    function redelegateFeeRate() external view returns (uint256);
    function removeFromBlackList(
        address account
    ) external;
    function resume() external;
    function syncGovToken(
        address[] memory operatorAddresses,
        address account
    ) external;
    function transferGasLimit() external view returns (uint256);
    function unbondPeriod() external view returns (uint256);
    function undelegate(
        address operatorAddress,
        uint256 shares
    ) external;
    function undelegateTokenB1155(
        address operatorAddress,
        uint256 tokenId,
        uint256 tokenBAmount
    ) external;
    function unjail(
        address operatorAddress
    ) external;
    function updateParam(
        string memory key,
        bytes memory value
    ) external;
    function voteExpiration(
        bytes memory
    ) external view returns (uint256);
    function voteToOperator(
        bytes memory
    ) external view returns (address);
    function stakeTokenB() external view returns (address);
    function stakeWeightA() external view returns (uint256);
    function stakeWeightB() external view returns (uint256);
    function ratioEnabled() external view returns (bool);
    function delegateTokenB1155(
        address operatorAddress,
        uint256 tokenId,
        uint256 tokenBAmount
    ) external;
    function getDelegatedTokenB(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function getDelegatedTokenBById(
        address operatorAddress,
        address delegator,
        uint256 tokenId
    ) external view returns (uint256);
    function totalDelegatedTokenB(
        address operatorAddress
    ) external view returns (uint256);
    function tokenBUnbondRequest(
        address operatorAddress,
        address delegator,
        uint256 index
    ) external view returns (uint256 tokenBAmount, uint256 unlockTime);
    function tokenB1155UnbondRequest(
        address operatorAddress,
        address delegator,
        uint256 index
    ) external view returns (uint256 tokenId, uint256 tokenBAmount, uint256 unlockTime);
    function pendingTokenBUnbondRequest(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function claimableTokenBUnbondRequest(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function pendingTokenBReward(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function currentInflationBps(
        uint256 dayIndex
    ) external view returns (uint256);
    function inflationEffectiveSupply() external view returns (uint256);
    function expectedInflationMintAmount(
        uint256 dayIndex
    ) external view returns (uint256);
    function slashReserveBalanceById(
        uint256 tokenId
    ) external view returns (uint256);
    function recordInflationMint(
        address consensusAddress
    ) external payable;
    function settleSlashReserve1155(
        address recipient,
        uint256 tokenId,
        uint256 amount
    ) external;
    function migrateSelfCustodiedSlashReserve(
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external;
    function retryPendingSystemReward(
        uint256 maxAmount
    ) external;
    function sweepPendingSystemReward(
        address recipient,
        uint256 amount
    ) external;

    function agentToOperator(
        address
    ) external view returns (address);
    function legacyStakeTokenB() external view returns (address);
    function stakeTokenBPrimaryId() external view returns (uint256);
    function stakeTokenBSecondaryId() external view returns (uint256);
    function tokenBCutoverVersion() external view returns (uint256);
    function tokenBMigrationReserve() external view returns (uint256);
    function tokenBMigrationReserveById(
        uint256 tokenId
    ) external view returns (uint256);
    function tokenBMigrationController() external view returns (address);
    function tokenBMigrationProposalId() external view returns (uint256);
    function pendingTokenBMigrationStakeTokenB() external view returns (address);
    function pendingTokenBMigrationReserveVault() external view returns (address);
    function pendingTokenBMigrationApprovalCount() external view returns (uint256);
    function pendingTokenBMigrationRequiredApprovals() external view returns (uint256);
    function totalLegacyDelegatedTokenB(
        address operatorAddress
    ) external view returns (uint256);
    function getLegacyDelegatedTokenB(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function getLegacyDelegatedTokenBById(
        address operatorAddress,
        address delegator,
        uint256 tokenId
    ) external view returns (uint256);
    function activateTokenBMigration(
        address newStakeTokenB,
        address reserveVault
    ) external;
    function hasApprovedTokenBMigration(
        uint256 proposalId,
        address operatorAddress
    ) external view returns (bool);
    function depositTokenBMigrationReserve1155(
        uint256 tokenId,
        uint256 amount
    ) external;
    function withdrawTokenBMigrationReserve1155(
        address recipient,
        uint256 tokenId,
        uint256 amount
    ) external;
    function migrateLegacyTokenB(
        address operatorAddress
    ) external;
    function getTokenBDelegators(
        address operatorAddress,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory delegators, uint256 totalLength);
    function migrateLegacyTokenBDelegators(
        address operatorAddress,
        uint256 offset,
        uint256 limit
    ) external;
    function updateAgent(
        address newAgent
    ) external;

    // NodeID management functions
    function addNodeIDs(
        bytes32[] calldata newNodeIDs
    ) external;
    function removeNodeIDs(
        bytes32[] calldata targetNodeIDs
    ) external;
    function getNodeIDs(
        address[] calldata validatorsToQuery
    ) external view returns (address[] memory consensusAddresses, bytes32[][] memory nodeIDsList);
    function maxNodeIDs() external view returns (uint256);

    function takeGiltCutoverSnapshot() external;
    function cutoverValidatorToRoot(
        address operatorAddress
    ) external;
    function getGiltCutoverMigratedGilt(
        address operatorAddress,
        address delegator
    ) external view returns (uint256);
    function isGiltCutoverFlipped(
        address operatorAddress
    ) external view returns (bool);
    function getGiltCutoverSnapshotGilt(
        address operatorAddress
    ) external view returns (uint256);
    function getRootStakeAmountByConsensus(
        address consensusAddress
    ) external view returns (uint256);
    function giltStakeFreezeEnabled() external view returns (bool);
    function giltCutoverSnapshotBlock() external view returns (uint256);
}
