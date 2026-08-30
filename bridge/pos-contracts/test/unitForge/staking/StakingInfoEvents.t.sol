// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

interface IStakingInfoEvents {
    function logSlashed(uint256 nonce, uint256 amount) external;
    function logUnJailed(uint256 validatorId, address signer) external;
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
    function validatorNonce(uint256 validatorId) external view returns (uint256);
    function updateNonce(uint256[] calldata validatorIds, uint256[] calldata nonces) external;
}

interface IRegistry {
    function updateContractMap(bytes32 key, address addr) external;
}

contract MockGovernance {}

contract StakingInfoEventsTest is Test {
    event Slashed(uint256 indexed nonce, uint256 indexed amount);
    event UnJailed(uint256 indexed validatorId, address indexed signer);
    IStakingInfoEvents internal stakingInfo;
    IRegistry internal registry;

    address internal stakeManager = makeAddr("stakeManager");
    address internal notStakeManager = makeAddr("notStakeManager");

    bytes32 internal constant STAKE_MANAGER_KEY = keccak256("stakeManager");

    function setUp() public {
        address governance = address(new MockGovernance());
        registry = IRegistry(deployCode("out/Registry.sol/Registry.json", abi.encode(governance)));
        vm.prank(governance);
        registry.updateContractMap(STAKE_MANAGER_KEY, stakeManager);
        stakingInfo = IStakingInfoEvents(deployCode("out/StakingInfo.sol/StakingInfo.json", abi.encode(address(registry))));
    }

    function test_logSlashed_emitsGoABICompatibleEvent() public {
        uint256 slashNonce = 7;
        uint256 slashAmount = 1_000e18;

        vm.expectEmit(true, true, false, false);
        emit Slashed(slashNonce, slashAmount);

        vm.prank(stakeManager);
        stakingInfo.logSlashed(slashNonce, slashAmount);
    }

    function test_logSlashed_revertsWhenNotStakeManager() public {
        vm.prank(notStakeManager);
        vm.expectRevert("Invalid sender, not stake manager");
        stakingInfo.logSlashed(1, 1);
    }

    function test_logSlashed_doesNotIncrementValidatorNonce() public {
        uint256 validatorId = 3;
        stakingInfo.updateNonce(_asArray(validatorId), _asArray(5));

        vm.prank(stakeManager);
        stakingInfo.logSlashed(99, 10);

        assertEq(stakingInfo.validatorNonce(validatorId), 5);
    }

    function test_logUnJailed_emitsGoABICompatibleEvent() public {
        uint256 validatorId = 4;
        address signer = makeAddr("signer");

        vm.expectEmit(true, true, false, false);
        emit UnJailed(validatorId, signer);

        vm.prank(stakeManager);
        stakingInfo.logUnJailed(validatorId, signer);
    }

    function test_logUnJailed_revertsWhenNotStakeManager() public {
        vm.prank(notStakeManager);
        vm.expectRevert("Invalid sender, not stake manager");
        stakingInfo.logUnJailed(1, makeAddr("signer"));
    }

    function test_logUnJailed_doesNotIncrementValidatorNonce() public {
        uint256 validatorId = 2;
        stakingInfo.updateNonce(_asArray(validatorId), _asArray(11));

        vm.prank(stakeManager);
        stakingInfo.logUnJailed(validatorId, makeAddr("signer"));

        assertEq(stakingInfo.validatorNonce(validatorId), 11);
    }

    function test_stakeMutatingLogs_incrementValidatorNonce() public {
        uint256 validatorId = 1;
        address signer = makeAddr("stakeSigner");
        bytes memory signerPubkey = hex"010203";

        vm.startPrank(stakeManager);

        stakingInfo.logStaked(signer, signerPubkey, validatorId, 10, 100, 100);
        assertEq(stakingInfo.validatorNonce(validatorId), 1);

        stakingInfo.logUnstakeInit(signer, validatorId, 20, 50);
        assertEq(stakingInfo.validatorNonce(validatorId), 2);

        stakingInfo.logSignerChange(validatorId, signer, makeAddr("newSigner"), signerPubkey);
        assertEq(stakingInfo.validatorNonce(validatorId), 3);

        vm.stopPrank();
    }

    function _asArray(uint256 value) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](1);
        arr[0] = value;
    }
}
