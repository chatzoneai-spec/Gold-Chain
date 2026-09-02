// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "lib/forge-std/src/Test.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {RootChainManager} from "contracts/root/RootChainManager/RootChainManager.sol";
import {RootChainManagerProxy} from "contracts/root/RootChainManager/RootChainManagerProxy.sol";
import {Merkle} from "contracts/lib/Merkle.sol";

interface IGovernance {
    function update(address target, bytes calldata data) external;
    function owner() external view returns (address);
}

interface IRegistry {
    function updateContractMap(bytes32 key, address addr) external;
    function contractMap(bytes32 key) external view returns (address);
}

interface IRootChain {
    function submitCheckpoint(bytes calldata data, uint256[3][] calldata sigs) external;
    function headerBlocks(uint256 headerNumber)
        external
        view
        returns (bytes32 root, uint256 start, uint256 end, uint256 createdAt, address proposer);
    function currentHeaderBlock() external view returns (uint256);
}

interface IValidatorSetCommitment {
    function initialize(
        uint256 chainId_,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers
    ) external;
    function totalPower() external view returns (uint256);
}

/// @dev Test-only harness: mirrors RootChainManager._checkBlockMembershipInCheckpoint using the real
///      _checkpointManager storage wired via setCheckpointManager(RootChain).
contract TestableRootChainManager is RootChainManager {
    using SafeMath for uint256;
    using Merkle for bytes32;

    constructor() public RootChainManager() {}

    function checkBlockMembershipInCheckpoint(
        uint256 blockNumber,
        uint256 blockTime,
        bytes32 txRoot,
        bytes32 receiptRoot,
        uint256 headerNumber,
        bytes calldata blockProof
    ) external view {
        (
            bytes32 headerRoot,
            uint256 startBlock,
            ,
            ,

        ) = _checkpointManager.headerBlocks(headerNumber);

        require(
            keccak256(abi.encodePacked(blockNumber, blockTime, txRoot, receiptRoot))
                .checkMembership(blockNumber.sub(startBlock), headerRoot, blockProof),
            "RootChainManager: INVALID_HEADER"
        );
    }
}

contract RootChainManagerCheckpointTest is Test {
    using SafeMath for uint256;

    uint256 internal constant GOLD_CHAIN_ID = 714;
    uint256 internal constant FIRST_HEADER_NUMBER = 10_000;
    uint256 internal constant VALIDATOR_PK = 0xA11CE;
    address internal validator = vm.addr(VALIDATOR_PK);

    address internal governance;
    address internal registry;
    address internal rootChain;
    address internal validatorSetCommitment;
    TestableRootChainManager internal manager;
    address internal owner = makeAddr("owner");

    function setUp() public {
        _deployPosContracts();
        _wireRootChainManager();
        _submitGenesisCheckpoint();
    }

    function test_positive_blockMembershipProofAgainstRootChainCheckpoint() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, ""
        );
    }

    function test_negative_revertsForUnsubmittedHeaderNumber() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        vm.expectRevert(bytes("RootChainManager: INVALID_HEADER"));
        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER + 10_000, ""
        );
    }

    function test_negative_revertsForInvalidBlockHeaderProof() public {
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("bad-tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        vm.expectRevert(bytes("RootChainManager: INVALID_HEADER"));
        manager.checkBlockMembershipInCheckpoint(0, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, "");
    }

    function _deployPosContracts() internal {
        address governanceImpl = deployCode("../pos-contracts/out/Governance.sol/Governance.json");
        governance = deployCode("../pos-contracts/out/GovernanceProxy.sol/GovernanceProxy.json", abi.encode(governanceImpl));

        registry = deployCode("../pos-contracts/out/Registry.sol/Registry.json", abi.encode(governance));

        address rootChainImpl = deployCode("../pos-contracts/out/RootChain.sol/RootChain.json");
        rootChain = deployCode(
            "../pos-contracts/out/RootChainProxy.sol/RootChainProxy.json",
            abi.encode(rootChainImpl, registry, "giltconsensus-P5rXwg")
        );

        address commitmentImpl = deployCode("../pos-contracts/out/ValidatorSetCommitment.sol/ValidatorSetCommitment.json");
        validatorSetCommitment =
            deployCode("../pos-contracts/out/ValidatorSetCommitmentProxy.sol/ValidatorSetCommitmentProxy.json", abi.encode(commitmentImpl));

        _initializeValidatorSetCommitment();
        _registerValidatorSetCommitment();
    }

    function _initializeValidatorSetCommitment() internal {
        address[] memory consensusAddresses = new address[](1);
        consensusAddresses[0] = validator;

        bytes[] memory voteKeys = new bytes[](1);
        voteKeys[0] = new bytes(48);
        for (uint256 i = 0; i < 48; ++i) {
            voteKeys[0][i] = bytes1(uint8(i + 1));
        }

        uint256[] memory votingPowers = new uint256[](1);
        votingPowers[0] = 1000 ether;

        IValidatorSetCommitment(validatorSetCommitment)
            .initialize(GOLD_CHAIN_ID, consensusAddresses, voteKeys, votingPowers);
        assertGt(IValidatorSetCommitment(validatorSetCommitment).totalPower(), 0);
    }

    function _registerValidatorSetCommitment() internal {
        bytes32 key = keccak256("validatorSetCommitment");
        IGovernance(governance)
            .update(registry, abi.encodeWithSelector(IRegistry.updateContractMap.selector, key, validatorSetCommitment));
        assertEq(IRegistry(registry).contractMap(key), validatorSetCommitment);
    }

    function _wireRootChainManager() internal {
        address impl = address(new TestableRootChainManager());
        address payable proxy = payable(address(new RootChainManagerProxy(impl)));
        manager = TestableRootChainManager(payable(address(proxy)));
        manager.initialize(owner);
        vm.prank(owner);
        manager.setCheckpointManager(rootChain);
        assertEq(manager.checkpointManagerAddress(), rootChain);
    }

    function _submitGenesisCheckpoint() internal {
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");
        bytes32 rootHash = keccak256(abi.encodePacked(uint256(0), uint256(12_345), txRoot, receiptRoot));

        bytes memory data = abi.encode(validator, uint256(0), uint256(0), rootHash, bytes32(0), GOLD_CHAIN_ID);
        bytes32 voteHash = keccak256(abi.encodePacked(bytes1(0x01), data));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VALIDATOR_PK, voteHash);
        uint256[3][] memory sigs = new uint256[3][](1);
        sigs[0] = [uint256(r), uint256(s), uint256(v)];

        IRootChain(rootChain).submitCheckpoint(data, sigs);
        _assertGenesisHeaderStored(rootHash);
    }

    function _assertGenesisHeaderStored(bytes32 rootHash) private {
        assertEq(IRootChain(rootChain).currentHeaderBlock(), FIRST_HEADER_NUMBER);
        (bytes32 storedRoot,,,,) = IRootChain(rootChain).headerBlocks(FIRST_HEADER_NUMBER);
        assertEq(storedRoot, rootHash);
    }
}
