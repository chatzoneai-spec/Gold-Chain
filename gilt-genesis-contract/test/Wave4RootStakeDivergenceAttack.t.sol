// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./utils/Deployer.sol";

interface IRootStakeStateReceiver {
    function onStateReceive(uint256 stateId, bytes calldata data) external;
}

/// @notice Wave 4 attack: induce root/child stake divergence; child must halt not drift.
contract Wave4RootStakeDivergenceAttackTest is Deployer {
    event RootStakeDivergenceDetected(uint256 rootTotal, uint256 trackedTotal, address indexed reporter);

    function setUp() public {
        vm.mockCall(address(0x66), bytes(""), hex"01");
    }

    function _enableRootAnchoredMode() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("rootAnchoredGiltStakingEnabled", hex"01");
    }

    function _encodeRootStakePayload(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) internal pure returns (bytes memory) {
        return abi.encode(validatorId, signer, amount, nonce, status);
    }

    function _commitRootStakeStateSync(uint256 stateId, bytes memory payload) internal {
        vm.prank(STATE_RECEIVER_ADDR);
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(stateId, payload);
    }

    function test_ATTACK_childNativeDelegate_doesNotDivergeFromRootSnapshot() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        uint256 snapshotGilt = IStakeCredit(credit).totalPooledGILT();

        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("giltStakeFreezeEnabled", hex"01");
        vm.prank(GOV_HUB_ADDR);
        stakeHub.takeGiltCutoverSnapshot();
        _enableRootAnchoredMode();
        _commitRootStakeStateSync(1, _encodeRootStakePayload(9, consensusAddress, snapshotGilt, 1, 0));
        stakeHub.cutoverValidatorToRoot(operator);

        (, uint256[] memory before,,) = stakeHub.getValidatorElectionInfo(0, 0);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("NativeGiltWritesRetired()"))));
        stakeHub.delegate{ value: 500 ether }(operator, false);

        (, uint256[] memory afterDelegate,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(afterDelegate[0], before[0], "child must freeze last root snapshot, not follow native stake");
    }

    function test_ATTACK_replayedRootStakeNonce_rejected() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _enableRootAnchoredMode();

        _commitRootStakeStateSync(1, _encodeRootStakePayload(12, consensusAddress, 3000 ether, 1, 0));

        vm.prank(STATE_RECEIVER_ADDR);
        vm.expectRevert(
            abi.encodeWithSelector(bytes4(keccak256("RootStakeInvalidNonce(uint256,uint256,uint256)")), 12, 1, 2)
        );
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(2, _encodeRootStakePayload(12, consensusAddress, 3000 ether, 1, 0));
    }

    function test_ATTACK_staleRootStakeNonce_rejected() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _enableRootAnchoredMode();

        _commitRootStakeStateSync(1, _encodeRootStakePayload(13, consensusAddress, 3000 ether, 1, 0));

        vm.prank(STATE_RECEIVER_ADDR);
        vm.expectRevert(
            abi.encodeWithSelector(bytes4(keccak256("RootStakeInvalidNonce(uint256,uint256,uint256)")), 13, 1, 2)
        );
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(2, _encodeRootStakePayload(13, consensusAddress, 2500 ether, 1, 0));
    }
}

interface IStakeCredit {
    function totalPooledGILT() external view returns (uint256);
}
