pragma solidity 0.6.6;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IRootChainManager} from "./IRootChainManager.sol";
import {RootChainManagerStorage} from "./RootChainManagerStorage.sol";
import {RootChainManagerStorageExtension} from "./RootChainManagerStorageExtension.sol";
import {IStateSender} from "../StateSender/IStateSender.sol";
import {ICheckpointManager} from "../ICheckpointManager.sol";
import {RLPReader} from "../../lib/RLPReader.sol";
import {ExitPayloadReader} from "../../lib/ExitPayloadReader.sol";
import {MerklePatriciaProof} from "../../lib/MerklePatriciaProof.sol";
import {Merkle} from "../../lib/Merkle.sol";
import {ITokenPredicate} from "../TokenPredicates/ITokenPredicate.sol";
import {Initializable} from "../../common/Initializable.sol";
import {NativeMetaTransaction} from "../../common/NativeMetaTransaction.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AccessControlMixin} from "../../common/AccessControlMixin.sol";
import {ContextMixin} from "../../common/ContextMixin.sol";

contract RootChainManager is
    IRootChainManager,
    Initializable,
    AccessControl, // included to match old storage layout while upgrading
    RootChainManagerStorage, // created to match old storage layout while upgrading
    AccessControlMixin,
    NativeMetaTransaction,
    ContextMixin,
    RootChainManagerStorageExtension
{
    using ExitPayloadReader for bytes;
    using ExitPayloadReader for ExitPayloadReader.ExitPayload;
    using ExitPayloadReader for ExitPayloadReader.Log;
    using ExitPayloadReader for ExitPayloadReader.LogTopics;
    using ExitPayloadReader for ExitPayloadReader.Receipt;

    using Merkle for bytes32;
    using RLPReader for RLPReader.RLPItem;
    using SafeMath for uint256;

    // maybe DEPOSIT and MAP_TOKEN can be reduced to bytes4
    bytes32 public constant DEPOSIT = keccak256("DEPOSIT");
    bytes32 public constant MAP_TOKEN = keccak256("MAP_TOKEN");
    bytes32 public constant GOLD_ERC1155_TOKEN_TYPE = keccak256("ScaledERC1155");
    bytes32 public constant ERC1155_TRANSFER_SINGLE_EVENT_SIG = keccak256(
        "TransferSingle(address,address,address,uint256,uint256)"
    );
    address public constant ETHER_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    bytes32 public constant MAPPER_ROLE = keccak256("MAPPER_ROLE");
    bytes32 public constant MIGRATION_MANAGER_ROLE = keccak256("MIGRATION_MANAGER_ROLE");

    constructor() public {
        // Disable initializer on implementation contract
        _disableInitializer();
    }

    function _msgSender()
        internal
        override
        view
        returns (address payable sender)
    {
        return ContextMixin.msgSender();
    }

    /**
     * @notice Deposit ether by directly sending to the contract
     * The account sending ether receives WETH on child chain
     */
    receive() external payable {
        _depositEtherFor(_msgSender());
    }

    /**
     * @notice Initialize the contract after it has been proxified
     * @dev meant to be called once immediately after deployment
     * @param _owner the account that should be granted admin role
     */
    function initialize(
        address _owner
    )
        external
        initializer
    {
        _initializeEIP712("RootChainManager");
        _setupContractId("RootChainManager");
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MAPPER_ROLE, _owner);
        _setupRole(MIGRATION_MANAGER_ROLE, _owner);
    }

    // adding seperate function setupContractId since initialize is already called with old implementation
    function setupContractId()
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        _setupContractId("RootChainManager");
    }

    // adding seperate function initializeEIP712 since initialize is already called with old implementation
    function initializeEIP712()
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        _setDomainSeperator("RootChainManager");
    }

    /**
     * @notice Set the state sender, callable only by admins
     * @dev This should be the state sender from plasma contracts
     * It is used to send bytes from root to child chain
     * @param newStateSender address of state sender contract
     */
    function setStateSender(address newStateSender)
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        require(newStateSender != address(0), "RootChainManager: BAD_NEW_STATE_SENDER");
        _stateSender = IStateSender(newStateSender);
    }

    /**
     * @notice Get the address of contract set as state sender
     * @return The address of state sender contract
     */
    function stateSenderAddress() external view returns (address) {
        return address(_stateSender);
    }

    /**
     * @notice Set the checkpoint manager, callable only by admins
     * @dev This should be the plasma contract responsible for keeping track of checkpoints
     * @param newCheckpointManager address of checkpoint manager contract
     */
    function setCheckpointManager(address newCheckpointManager)
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        require(newCheckpointManager != address(0), "RootChainManager: BAD_NEW_CHECKPOINT_MANAGER");
        _checkpointManager = ICheckpointManager(newCheckpointManager);
    }

    /**
     * @notice Get the address of contract set as checkpoint manager
     * @return The address of checkpoint manager contract
     */
    function checkpointManagerAddress() external view returns (address) {
        return address(_checkpointManager);
    }

    /**
     * @notice Set the child chain manager, callable only by admins
     * @dev This should be the contract responsible to receive deposit bytes on child chain
     * @param newChildChainManager address of child chain manager contract
     */
    function setChildChainManagerAddress(address newChildChainManager)
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        require(newChildChainManager != address(0x0), "RootChainManager: INVALID_CHILD_CHAIN_ADDRESS");
        childChainManagerAddress = newChildChainManager;
    }

    /**
     * @notice Register a token predicate address against its type, callable only by ADMIN
     * @dev A predicate is a contract responsible to process the token specific logic while locking or exiting tokens
     * @param tokenType bytes32 unique identifier for the token type
     * @param predicateAddress address of token predicate address
     */
    function registerPredicate(bytes32 tokenType, address predicateAddress)
        external
        override
        only(DEFAULT_ADMIN_ROLE)
    {
        typeToPredicate[tokenType] = predicateAddress;
        emit PredicateRegistered(tokenType, predicateAddress);
    }

    /**
     * @notice Map a token to enable its movement via the PoS Portal, callable only by mappers
     * @param rootToken address of token on root chain
     * @param childToken address of token on child chain
     * @param tokenType bytes32 unique identifier for the token type
     */
    function mapToken(
        address rootToken,
        address childToken,
        bytes32 tokenType
    ) external override only(MAPPER_ROLE) {
        require(
            tokenType != GOLD_ERC1155_TOKEN_TYPE,
            "RootChainManager: USE_MAP_GOLD_TOKEN"
        );
        require(
            !_hasGoldChildRoutes(childToken),
            "RootChainManager: CHILD_TOKEN_IN_USE"
        );
        // explicit check if token is already mapped to avoid accidental remaps
        require(
            rootToChildToken[rootToken] == address(0) &&
            childToRootToken[childToken] == address(0),
            "RootChainManager: ALREADY_MAPPED"
        );
        _mapToken(rootToken, childToken, tokenType);
    }

    function mapGoldToken(
        address rootToken,
        address childToken,
        uint256 childTokenId,
        bytes32 tokenType
    ) external override only(MAPPER_ROLE) {
        require(
            tokenType == GOLD_ERC1155_TOKEN_TYPE,
            "RootChainManager: INVALID_GOLD_TOKEN_TYPE"
        );
        require(
            typeToPredicate[tokenType] != address(0x0),
            "RootChainManager: TOKEN_TYPE_NOT_SUPPORTED"
        );
        require(childTokenId != 0, "RootChainManager: INVALID_GOLD_TOKEN_ID");
        require(
            childToRootToken[childToken] == address(0),
            "RootChainManager: CHILD_TOKEN_IN_USE"
        );
        require(
            rootToChildToken[rootToken] == address(0),
            "RootChainManager: ALREADY_MAPPED"
        );
        require(
            goldRootTokenByChildTokenId[childToken][childTokenId] == address(0),
            "RootChainManager: GOLD_TOKEN_ID_ALREADY_MAPPED"
        );

        rootToChildToken[rootToken] = childToken;
        tokenToType[rootToken] = tokenType;
        goldTokenIdByRootToken[rootToken] = childTokenId;
        goldRootTokenByChildTokenId[childToken][childTokenId] = rootToken;
        goldChildRouteCount[childToken] = goldChildRouteCount[childToken].add(1);

        emit TokenMapped(rootToken, childToken, tokenType);

        bytes memory syncData = abi.encode(rootToken, childToken, tokenType);
        _stateSender.syncState(
            childChainManagerAddress,
            abi.encode(MAP_TOKEN, syncData)
        );
    }

    /**
     * @notice Clean polluted token mapping
     * @param rootToken address of token on root chain. Since rename token was introduced later stage,
     * clean method is used to clean pollulated mapping
     */
    function cleanMapToken(
        address rootToken,
        address childToken
    ) external override only(DEFAULT_ADMIN_ROLE) {
        require(
            !migrationManagedTokens[rootToken] &&
            !migrationManagedTokens[childToRootToken[childToken]],
            "RootChainManager: MIGRATION_TOKEN_LOCKED"
        );
        require(!isMigrated(rootToken), "RootChainManager: CANNOT_CLEAN_MIGRATED_TOKEN");

        if (goldTokenIdByRootToken[rootToken] != 0) {
            require(
                rootToChildToken[rootToken] == childToken,
                "RootChainManager: INVALID_CHILD_TOKEN"
            );
            uint256 childTokenId = goldTokenIdByRootToken[rootToken];
            goldRootTokenByChildTokenId[childToken][childTokenId] = address(0);
            goldTokenIdByRootToken[rootToken] = 0;
            goldChildRouteCount[childToken] = goldChildRouteCount[childToken].sub(1);
            rootToChildToken[rootToken] = address(0);
            tokenToType[rootToken] = bytes32(0);

            emit TokenMapped(rootToken, childToken, tokenToType[rootToken]);
            return;
        }

        rootToChildToken[rootToken] = address(0);
        childToRootToken[childToken] = address(0);
        tokenToType[rootToken] = bytes32(0);

        emit TokenMapped(rootToken, childToken, tokenToType[rootToken]);
    }

    /**
     * @notice Remap a token that has already been mapped, properly cleans up old mapping
     * Callable only by ADMIN
     * @param rootToken address of token on root chain
     * @param childToken address of token on child chain
     * @param tokenType bytes32 unique identifier for the token type
     */
    function remapToken(
        address rootToken,
        address childToken,
        bytes32 tokenType
    ) external override only(DEFAULT_ADMIN_ROLE) {
        require(
            tokenType != GOLD_ERC1155_TOKEN_TYPE,
            "RootChainManager: USE_MAP_GOLD_TOKEN"
        );
        require(
            goldTokenIdByRootToken[rootToken] == 0,
            "RootChainManager: USE_MAP_GOLD_TOKEN"
        );
        require(
            !_hasGoldChildRoutes(childToken),
            "RootChainManager: CHILD_TOKEN_IN_USE"
        );
        require(
            !migrationManagedTokens[rootToken] &&
            !migrationManagedTokens[childToRootToken[childToken]],
            "RootChainManager: MIGRATION_TOKEN_LOCKED"
        );
        require(!isMigrated(rootToken), "RootChainManager: CANNOT_REMAP_MIGRATED_TOKEN");
        // cleanup old mapping
        address oldChildToken = rootToChildToken[rootToken];
        address oldRootToken = childToRootToken[childToken];

        if (rootToChildToken[oldRootToken] != address(0)) {
            rootToChildToken[oldRootToken] = address(0);
            tokenToType[oldRootToken] = bytes32(0);
        }

        if (childToRootToken[oldChildToken] != address(0)) {
            childToRootToken[oldChildToken] = address(0);
        }

        _mapToken(rootToken, childToken, tokenType);
    }

    function _mapToken(
        address rootToken,
        address childToken,
        bytes32 tokenType
    ) private {
        require(
            typeToPredicate[tokenType] != address(0x0),
            "RootChainManager: TOKEN_TYPE_NOT_SUPPORTED"
        );

        rootToChildToken[rootToken] = childToken;
        childToRootToken[childToken] = rootToken;
        tokenToType[rootToken] = tokenType;

        emit TokenMapped(rootToken, childToken, tokenType);

        bytes memory syncData = abi.encode(rootToken, childToken, tokenType);
        _stateSender.syncState(
            childChainManagerAddress,
            abi.encode(MAP_TOKEN, syncData)
        );
    }

    /**
     * @notice Move ether from root to child chain, accepts ether transfer
     * Keep in mind this ether cannot be used to pay gas on child chain
     * Use native tokens deposited using plasma mechanism for that
     * @param user address of account that should receive WETH on child chain
     */
    function depositEtherFor(address user) external override payable {
        _depositEtherFor(user);
    }

    /**
     * @notice Move tokens from root to child chain
     * @dev This mechanism supports arbitrary tokens as long as its predicate has been registered and the token is mapped
     * @param user address of account that should receive this deposit on child chain
     * @param rootToken address of token that is being deposited
     * @param depositData bytes data that is sent to predicate and child token contracts to handle deposit
     */
    function depositFor(
        address user,
        address rootToken,
        bytes calldata depositData
    ) external override {
        require(
            rootToken != ETHER_ADDRESS,
            "RootChainManager: INVALID_ROOT_TOKEN"
        );
        _depositFor(user, rootToken, depositData);
    }

    function _depositEtherFor(address user) private {
        bytes memory depositData = abi.encode(msg.value);
        _depositFor(user, ETHER_ADDRESS, depositData);

        // payable(typeToPredicate[tokenToType[ETHER_ADDRESS]]).transfer(msg.value);
        // transfer doesn't work as expected when receiving contract is proxified so using call
        (bool success, /* bytes memory data */) = typeToPredicate[tokenToType[ETHER_ADDRESS]].call{value: msg.value}("");
        if (!success) {
            revert("RootChainManager: ETHER_TRANSFER_FAILED");
        }
    }

    function _depositFor(
        address user,
        address rootToken,
        bytes memory depositData
    ) private {
        if (migrationStatus[rootToken].isDepositDisabled) {
            revert("RootChainManager: DEPOSIT_DISABLED");
        }
        bytes32 tokenType = tokenToType[rootToken];
        require(
            rootToChildToken[rootToken] != address(0x0) &&
               tokenType != 0,
            "RootChainManager: TOKEN_NOT_MAPPED"
        );
        address predicateAddress = typeToPredicate[tokenType];
        require(
            predicateAddress != address(0),
            "RootChainManager: INVALID_TOKEN_TYPE"
        );
        require(
            user != address(0),
            "RootChainManager: INVALID_USER"
        );

        if (tokenType == GOLD_ERC1155_TOKEN_TYPE) {
            _validateGoldDepositData(rootToken, depositData);
        }

        bytes memory canonicalDepositData = ITokenPredicate(predicateAddress).lockTokens(
            _msgSender(),
            user,
            rootToken,
            depositData
        );
        bytes memory syncData = abi.encode(user, rootToken, canonicalDepositData);
        _stateSender.syncState(
            childChainManagerAddress,
            abi.encode(DEPOSIT, syncData)
        );
    }

    /**
     * @notice exit tokens by providing proof
     * @dev This function verifies if the transaction actually happened on child chain
     * the transaction log is then sent to token predicate to handle it accordingly
     *
     * @param inputData RLP encoded data of the reference tx containing following list of fields
     *  0 - headerNumber - Checkpoint header block number containing the reference tx
     *  1 - blockProof - Proof that the block header (in the child chain) is a leaf in the submitted merkle root
     *  2 - blockNumber - Block number containing the reference tx on child chain
     *  3 - blockTime - Reference tx block time
     *  4 - txRoot - Transactions root of block
     *  5 - receiptRoot - Receipts root of block
     *  6 - receipt - Receipt of the reference transaction
     *  7 - receiptProof - Merkle proof of the reference receipt
     *  8 - branchMask - 32 bits denoting the path of receipt in merkle tree
     *  9 - receiptLogIndex - Log Index to read from the receipt
     */
    function exit(bytes calldata inputData) external override {
        ExitPayloadReader.ExitPayload memory payload = inputData.toExitPayload();

        bytes memory branchMaskBytes = payload.getBranchMaskAsBytes();
        uint256 blockNumber = payload.getBlockNumber();
        // checking if exit has already been processed
        // unique exit is identified using hash of (blockNumber, branchMask, receiptLogIndex)
        bytes32 exitHash = keccak256(
            abi.encodePacked(
                blockNumber,
                // first 2 nibbles are dropped while generating nibble array
                // this allows branch masks that are valid but bypass exitHash check (changing first 2 nibbles only)
                // so converting to nibble array and then hashing it
                MerklePatriciaProof._getNibbleArray(branchMaskBytes),
                payload.getReceiptLogIndex()
            )
        );

        require(
            processedExits[exitHash] == false,
            "RootChainManager: EXIT_ALREADY_PROCESSED"
        );
        processedExits[exitHash] = true;

        ExitPayloadReader.Receipt memory receipt = payload.getReceipt();
        ExitPayloadReader.Log memory log = receipt.getLog();

        // log should be emmited only by the child token
        address rootToken = _rootTokenForExit(log);
        require(
            rootToken != address(0),
            "RootChainManager: TOKEN_NOT_MAPPED"
        );
        if (migrationStatus[rootToken].isExitDisabled &&
            blockNumber > migrationStatus[rootToken].lastExitBlockNumber) { // @note: if the lastExitBlockNumber is the same as the current block number, exits are still allowed
            revert("RootChainManager: EXIT_DISABLED");
        }

        address predicateAddress = typeToPredicate[
            tokenToType[rootToken]
        ];

        // branch mask can be maximum 32 bits
        require(
            payload.getBranchMaskAsUint() &
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000 ==
            0,
            "RootChainManager: INVALID_BRANCH_MASK"
        );

        // verify receipt inclusion
        require(
            MerklePatriciaProof.verify(
                receipt.toBytes(),
                branchMaskBytes,
                payload.getReceiptProof(),
                payload.getReceiptRoot()
            ),
            "RootChainManager: INVALID_PROOF"
        );

        // verify checkpoint inclusion
        _checkBlockMembershipInCheckpoint(
            payload.getBlockNumber(),
            payload.getBlockTime(),
            payload.getTxRoot(),
            payload.getReceiptRoot(),
            payload.getHeaderNumber(),
            payload.getBlockProof()
        );

        ITokenPredicate(predicateAddress).exitTokens(
            _msgSender(),
            rootToken,
            log.toRlpBytes()
        );
    }

    /**
     * @notice Update the migration status for a given root token.
     * @dev Allows admin to enable/disable deposits and exits for a token, and set the block number after which exits are stopped.
     * @param rootToken Address of the root token.
     * @param isDepositDisable Boolean indicating if deposits are disabled.
     * @param isExitDisabled Boolean indicating if exits are disabled.
     * @param lastExitBlockNumber Block number after which exits are stopped for this token.
     */
    function updateTokenMigrationStatus(
      address rootToken,
      bool isDepositDisable,
      bool isExitDisabled,
      uint256 lastExitBlockNumber
    ) external override only(MIGRATION_MANAGER_ROLE) {
        require(migrationManagedTokens[rootToken], "RootChainManager: TOKEN_NOT_MIGRATION_MANAGED");
        require(
            rootToChildToken[rootToken] != address(0),
            "RootChainManager: TOKEN_NOT_MAPPED"
        );

        migrationStatus[rootToken] = TokenMigrationStatus(
          isDepositDisable,
          isExitDisabled,
          lastExitBlockNumber
        );

        emit MigrationStatusChanged(
            rootToken,
            isDepositDisable,
            isExitDisabled,
            lastExitBlockNumber
        );
    }

    function setTokenMigrationManager(
        address rootToken,
        bool approved
    ) external override only(DEFAULT_ADMIN_ROLE) {
        require(rootToken != address(0), "RootChainManager: INVALID_ROOT_TOKEN");
        migrationManagedTokens[rootToken] = approved;
        emit MigrationTokenApprovalSet(rootToken, approved);
    }

    /// @notice This function allows the admin to migrate tokens that have been bridged to a new address.
    /// @dev NOTE: Requires the receiver and the amount to be specified in the `data` parameter for EtherPredicate.
    /// @param rootToken The address of the ERC token to migrate.
    /// @param data ABI-encoded data containing migration details.
    function migrateBridgeFunds(address rootToken, bytes calldata data)
        external
        override
        only(MIGRATION_MANAGER_ROLE)
    {
        require(migrationManagedTokens[rootToken], "RootChainManager: TOKEN_NOT_MIGRATION_MANAGED");
        require(rootToChildToken[rootToken] != address(0), "RootChainManager: TOKEN_NOT_MAPPED");
        require(isMigrated(rootToken), "RootChainManager: NOT_MIGRATED");
        ITokenPredicate predicate = ITokenPredicate(typeToPredicate[tokenToType[rootToken]]);
        predicate.migrateTokens(rootToken, data);
    }

    /**
     * @notice Check if a token has been fully migrated.
     * @param rootToken Address of the root token to check migration status.
     * @return bool indicating if the token is fully migrated (both deposits and exits are disabled).
     */
    function isMigrated(address rootToken) public view override returns (bool) {
        // Cache the migration status to avoid multiple storage reads
        TokenMigrationStatus memory status = migrationStatus[rootToken];
        return status.isDepositDisabled && status.isExitDisabled;
    }

    function _validateGoldDepositData(
        address rootToken,
        bytes memory depositData
    ) private view {
        (uint256 childTokenId, uint256 rootAmount) = abi.decode(
            depositData,
            (uint256, uint256)
        );
        require(rootAmount != 0, "RootChainManager: INVALID_GOLD_AMOUNT");
        require(
            goldTokenIdByRootToken[rootToken] == childTokenId,
            "RootChainManager: INVALID_GOLD_TOKEN_ID"
        );
    }

    function _rootTokenForExit(
        ExitPayloadReader.Log memory log
    ) private view returns (address) {
        address emitter = log.getEmitter();
        address rootToken = childToRootToken[emitter];
        if (rootToken != address(0)) {
            return rootToken;
        }

        ExitPayloadReader.LogTopics memory topics = log.getTopics();
        if (topics.data.length != 4) {
            return address(0);
        }

        if (
            bytes32(topics.getField(0).toUint()) != ERC1155_TRANSFER_SINGLE_EVENT_SIG
        ) {
            return address(0);
        }

        if (address(topics.getField(3).toUint()) != address(0)) {
            return address(0);
        }

        (uint256 childTokenId, ) = abi.decode(
            log.getData(),
            (uint256, uint256)
        );
        return goldRootTokenByChildTokenId[emitter][childTokenId];
    }

    function _checkBlockMembershipInCheckpoint(
        uint256 blockNumber,
        uint256 blockTime,
        bytes32 txRoot,
        bytes32 receiptRoot,
        uint256 headerNumber,
        bytes memory blockProof
    ) internal view {
        (
            bytes32 headerRoot,
            uint256 startBlock,
            ,
            ,

        ) = _checkpointManager.headerBlocks(headerNumber);

        uint256 createdBlock = _checkpointManager.headerCreatedBlock(headerNumber);
        uint256 finalityDelay = _checkpointManager.checkpointFinalityDelay();
        require(
            block.number >= createdBlock + finalityDelay,
            "RootChainManager: CHECKPOINT_NOT_FINALIZED"
        );

        require(
            keccak256(
                abi.encodePacked(blockNumber, blockTime, txRoot, receiptRoot)
            )
                .checkMembership(
                blockNumber.sub(startBlock),
                headerRoot,
                blockProof
            ),
            "RootChainManager: INVALID_HEADER"
        );
    }

    function _hasGoldChildRoutes(address childToken) private view returns (bool) {
        return goldChildRouteCount[childToken] != 0;
    }
}
