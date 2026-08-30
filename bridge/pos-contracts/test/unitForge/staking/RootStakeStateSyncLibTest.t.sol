// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

contract RootStakeStateSyncLibTest is Test {
    event StateSynced(uint256 indexed id, address indexed contractAddress, bytes data);

    function test_encodePayload_matchesWave2DLayout() public {
        address harness = deployCode("out/RootStakeStateSyncHarness.sol/RootStakeStateSyncHarness.json");
        bytes memory encoded = RootStakeStateSyncHarness(harness).encodePayload(7, address(0xBEEF), 9_000 ether, 1, 0);
        (uint256 validatorId, address signer, uint256 amount, uint256 nonce, uint8 status) =
            abi.decode(encoded, (uint256, address, uint256, uint256, uint8));
        assertEq(validatorId, 7);
        assertEq(signer, address(0xBEEF));
        assertEq(amount, 9_000 ether);
        assertEq(nonce, 1);
        assertEq(status, 0);
    }

    function test_syncPayload_emitsStateSynced() public {
        address mockSender = deployCode("out/RootStakeStateSyncHarness.sol/MockStateSenderHarness.json");
        address harness = deployCode("out/RootStakeStateSyncHarness.sol/RootStakeStateSyncHarness.json");
        address childStakeHub = makeAddr("childStakeHub");

        MockStateSenderHarness(mockSender).register(harness, childStakeHub);

        bytes memory payload = RootStakeStateSyncHarness(harness).encodePayload(8, address(0xCAFE), 1_000 ether, 1, 0);
        vm.expectEmit(true, true, false, true, mockSender);
        emit StateSynced(1, childStakeHub, payload);

        RootStakeStateSyncHarness(harness).syncPayload(
            mockSender, childStakeHub, 8, address(0xCAFE), 1_000 ether, 1, 0
        );
        assertEq(MockStateSenderHarness(mockSender).counter(), 1);
    }
}

interface RootStakeStateSyncHarness {
    function encodePayload(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) external pure returns (bytes memory);

    function syncPayload(
        address stateSenderAddr,
        address childStakeHub,
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) external;
}

interface MockStateSenderHarness {
    function register(address sender, address receiver) external;
    function counter() external view returns (uint256);
}
