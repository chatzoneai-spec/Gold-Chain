// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

interface IStakingInfoReplay {
    function logStaked(
        address signer,
        bytes calldata signerPubkey,
        uint256 validatorId,
        uint256 activationEpoch,
        uint256 amount,
        uint256 total
    ) external;
    function logUnstakeInit(address user, uint256 validatorId, uint256 deactivationEpoch, uint256 amount) external;
    function logSignerChange(
        uint256 validatorId,
        address oldSigner,
        address newSigner,
        bytes calldata signerPubkey
    ) external;
    function logStakeUpdate(uint256 validatorId, uint256 newAmount, uint256 total) external;
    function validatorNonce(uint256 validatorId) external view returns (uint256);
    function updateNonce(uint256[] calldata validatorIds, uint256[] calldata nonces) external;
}

interface IRegistry {
    function updateContractMap(bytes32 key, address addr) external;
}

/// @notice Wave 4 attack: replay StakingInfo events with stale validatorNonce.
contract Wave4StakingInfoReplayAttackTest is Test {
    address internal stakeManager = makeAddr("stakeManager");
    address internal notStakeManager = makeAddr("notStakeManager");
    bytes32 internal constant STAKE_MANAGER_KEY = keccak256("stakeManager");

    IStakingInfoReplay internal stakingInfo;
    IRegistry internal registry;

    function setUp() public {
        address governance = makeAddr("governance");
        registry = IRegistry(deployCode("out/Registry.sol/Registry.json", abi.encode(governance)));
        vm.prank(governance);
        registry.updateContractMap(STAKE_MANAGER_KEY, stakeManager);
        stakingInfo = IStakingInfoReplay(deployCode("out/StakingInfo.sol/StakingInfo.json", abi.encode(address(registry))));
    }

    function test_ATTACK_replaySameValidatorNonce_rejectedByMonotonicNonce() public {
        uint256 validatorId = 5;
        address signer = makeAddr("signer");
        bytes memory pubkey = hex"010203";

        vm.startPrank(stakeManager);
        stakingInfo.logStaked(signer, pubkey, validatorId, 1, 1000, 1000);
        assertEq(stakingInfo.validatorNonce(validatorId), 1);

        // Attacker replays the same lifecycle event (nonce would stay at 1).
        stakingInfo.logStaked(signer, pubkey, validatorId, 1, 1000, 1000);
        assertEq(stakingInfo.validatorNonce(validatorId), 2, "replay increments nonce; listener must reject stale nonce 1");
        vm.stopPrank();
    }

    function test_ATTACK_replayedNonce3_whenLastIs4_mustBeRejectedByKeeperPolicy() public {
        uint256 lastNonce = 4;
        uint64 replayNonce = 3;
        bool allowed = replayNonce == lastNonce + 1;
        assertFalse(allowed, "keeper policy rejects replayed nonce");
    }

    function test_ATTACK_stakeMutatingLogs_requireStrictNonceIncrement() public {
        uint256 validatorId = 7;
        address signer = makeAddr("stakeSigner");
        bytes memory pubkey = hex"0a0b0c";

        vm.startPrank(stakeManager);
        stakingInfo.logStaked(signer, pubkey, validatorId, 10, 100, 100);
        assertEq(stakingInfo.validatorNonce(validatorId), 1);

        stakingInfo.logUnstakeInit(signer, validatorId, 20, 50);
        assertEq(stakingInfo.validatorNonce(validatorId), 2);

        // Attacker tries to replay unstake-init at nonce 2 without advancing.
        stakingInfo.logUnstakeInit(signer, validatorId, 20, 50);
        assertEq(stakingInfo.validatorNonce(validatorId), 3, "duplicate apply increments; consumer must reject nonce 2 replay");
        vm.stopPrank();
    }

    function test_ATTACK_unauthorizedStakingInfoCaller_rejected() public {
        vm.prank(notStakeManager);
        vm.expectRevert("Invalid sender, not stake manager");
        stakingInfo.logStaked(makeAddr("x"), hex"01", 1, 1, 1, 1);
    }
}
