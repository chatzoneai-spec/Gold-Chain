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
    function checkpointFinalityDelay() external view returns (uint256);
    function headerCreatedBlock(uint256 headerNumber) external view returns (uint256);
    function updateCheckpointFinalityDelay(uint256 newDelay) external;
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

/// @dev Test subclass calls production `_checkBlockMembershipInCheckpoint` (internal).
contract TestableRootChainManager is RootChainManager {
    constructor() public RootChainManager() {}

    function checkBlockMembershipInCheckpoint(
        uint256 blockNumber,
        uint256 blockTime,
        bytes32 txRoot,
        bytes32 receiptRoot,
        uint256 headerNumber,
        bytes calldata blockProof
    ) external view {
        _checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, headerNumber, blockProof
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

    function test_positive_blockMembershipProofAfterFinalityDelay() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        vm.expectRevert(bytes("RootChainManager: CHECKPOINT_NOT_FINALIZED"));
        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, ""
        );

        uint256 delay = IRootChain(rootChain).checkpointFinalityDelay();
        vm.roll(block.number + delay);

        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, ""
        );
    }

    function test_negative_immediateMembershipRevertsBeforeFinalityDelay() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        vm.expectRevert(bytes("RootChainManager: CHECKPOINT_NOT_FINALIZED"));
        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, ""
        );
    }

    function test_positive_membershipSucceedsAfterRollingPastFinalityDelay() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        uint256 createdBlock = IRootChain(rootChain).headerCreatedBlock(FIRST_HEADER_NUMBER);
        uint256 delay = IRootChain(rootChain).checkpointFinalityDelay();
        vm.roll(createdBlock + delay);

        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, ""
        );
    }

    function test_e2e_checkpointSubmitFinalityThenExitProofMembership() public {
        (
            uint256 headerNumber,
            uint256 endBlock,
            uint256 blockTime2,
            bytes32 txRoot2,
            bytes32 receiptRoot2,
            bytes memory blockProof
        ) = _submitRangeCheckpoint();

        vm.expectRevert(bytes("RootChainManager: CHECKPOINT_NOT_FINALIZED"));
        manager.checkBlockMembershipInCheckpoint(
            endBlock, blockTime2, txRoot2, receiptRoot2, headerNumber, blockProof
        );

        vm.roll(
            IRootChain(rootChain).headerCreatedBlock(headerNumber)
                + IRootChain(rootChain).checkpointFinalityDelay()
        );

        manager.checkBlockMembershipInCheckpoint(
            endBlock, blockTime2, txRoot2, receiptRoot2, headerNumber, blockProof
        );
    }

    function test_negative_revertsForUnsubmittedHeaderNumber() public {
        uint256 blockNumber = 0;
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        uint256 delay = IRootChain(rootChain).checkpointFinalityDelay();
        vm.roll(block.number + delay);

        vm.expectRevert(bytes("RootChainManager: INVALID_HEADER"));
        manager.checkBlockMembershipInCheckpoint(
            blockNumber, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER + 10_000, ""
        );
    }

    function test_negative_revertsForInvalidBlockHeaderProof() public {
        uint256 blockTime = 12_345;
        bytes32 txRoot = keccak256("bad-tx-root");
        bytes32 receiptRoot = keccak256("receipt-root");

        uint256 delay = IRootChain(rootChain).checkpointFinalityDelay();
        vm.roll(block.number + delay);

        vm.expectRevert(bytes("RootChainManager: INVALID_HEADER"));
        manager.checkBlockMembershipInCheckpoint(0, blockTime, txRoot, receiptRoot, FIRST_HEADER_NUMBER, "");
    }

    function test_governanceCanUpdateCheckpointFinalityDelay() public {
        assertEq(IRootChain(rootChain).checkpointFinalityDelay(), 10);

        vm.prank(governance);
        IRootChain(rootChain).updateCheckpointFinalityDelay(20);
        assertEq(IRootChain(rootChain).checkpointFinalityDelay(), 20);
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

        _submitCheckpoint(0, 0, rootHash);
        _assertGenesisHeaderStored(rootHash);
    }

    function _submitRangeCheckpoint()
        internal
        returns (
            uint256 headerNumber,
            uint256 endBlock,
            uint256 blockTime2,
            bytes32 txRoot2,
            bytes32 receiptRoot2,
            bytes memory blockProof
        )
    {
        uint256 startBlock = 1;
        endBlock = 2;
        uint256 blockTime1 = 100;
        blockTime2 = 200;
        bytes32 txRoot1 = keccak256("e2e-tx-1");
        bytes32 receiptRoot1 = keccak256("e2e-receipt-1");
        txRoot2 = keccak256("e2e-tx-2");
        receiptRoot2 = keccak256("e2e-receipt-2");

        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = keccak256(abi.encodePacked(startBlock, blockTime1, txRoot1, receiptRoot1));
        leaves[1] = keccak256(abi.encodePacked(endBlock, blockTime2, txRoot2, receiptRoot2));

        headerNumber = _submitCheckpoint(startBlock, endBlock, _merkleRoot(leaves));
        blockProof = _merkleProof(leaves, endBlock - startBlock);
    }

    function _submitCheckpoint(uint256 start, uint256 end, bytes32 rootHash) internal returns (uint256 headerNumber) {
        headerNumber = IRootChain(rootChain).currentHeaderBlock() + 10_000;

        bytes memory data = abi.encode(validator, start, end, rootHash, bytes32(0), GOLD_CHAIN_ID);
        bytes32 voteHash = keccak256(abi.encodePacked(bytes1(0x01), data));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VALIDATOR_PK, voteHash);
        uint256[3][] memory sigs = new uint256[3][](1);
        sigs[0] = [uint256(r), uint256(s), uint256(v)];

        IRootChain(rootChain).submitCheckpoint(data, sigs);
    }

    function _assertGenesisHeaderStored(bytes32 rootHash) private {
        assertEq(IRootChain(rootChain).currentHeaderBlock(), FIRST_HEADER_NUMBER);
        (bytes32 storedRoot,,,,) = IRootChain(rootChain).headerBlocks(FIRST_HEADER_NUMBER);
        assertEq(storedRoot, rootHash);
        assertEq(IRootChain(rootChain).headerCreatedBlock(FIRST_HEADER_NUMBER), block.number);
    }

    function _merkleRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "no leaves");
        if (leaves.length == 1) {
            return leaves[0];
        }

        bytes32[] memory layer = leaves;
        while (layer.length > 1) {
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; i++) {
                bytes32 left = layer[2 * i];
                bytes32 right = (2 * i + 1 < layer.length) ? layer[2 * i + 1] : layer[2 * i];
                next[i] = keccak256(abi.encodePacked(left, right));
            }
            layer = next;
        }
        return layer[0];
    }

    function _merkleProof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes memory) {
        require(leaves.length > 0, "no leaves");
        require(index < leaves.length, "bad index");
        if (leaves.length == 1) {
            return "";
        }

        bytes memory proof;
        bytes32[] memory layer = leaves;
        uint256 idx = index;

        while (layer.length > 1) {
            bytes32 sibling;
            if (idx % 2 == 0) {
                sibling = (idx + 1 < layer.length) ? layer[idx + 1] : layer[idx];
            } else {
                sibling = layer[idx - 1];
            }
            proof = abi.encodePacked(proof, sibling);

            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);
            for (uint256 i = 0; i < nextLen; i++) {
                bytes32 left = layer[2 * i];
                bytes32 right = (2 * i + 1 < layer.length) ? layer[2 * i + 1] : layer[2 * i];
                next[i] = keccak256(abi.encodePacked(left, right));
            }
            layer = next;
            idx = idx / 2;
        }
        return proof;
    }
}
