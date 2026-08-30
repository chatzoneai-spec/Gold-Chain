// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./utils/Deployer.sol";

interface IRootStakeStateReceiver {
    function onStateReceive(uint256 stateId, bytes calldata data) external;
}

contract StakeHubRootStakeTest is Deployer {
    event RootStakeSnapshotApplied(
        uint256 indexed stateId,
        uint256 indexed validatorId,
        address indexed signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    );

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

    function _commitRootStakeStateSync(
        uint256 stateId,
        bytes memory payload
    ) internal {
        vm.prank(STATE_RECEIVER_ADDR);
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(stateId, payload);
    }

    function testRootStakeSnapshotUpdatesElectionPower() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _enableRootAnchoredMode();

        uint256 rootAmount = 9000 ether;
        _commitRootStakeStateSync(1, _encodeRootStakePayload(7, consensusAddress, rootAmount, 1, 0));

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        uint256 expected = rootAmount * stakeHub.stakeWeightA() / 10_000;
        assertEq(votingPowers[0], expected, "election power must follow root snapshot");

        uint256 nativeStake = IStakeCredit(credit).totalPooledGILT();
        assertGt(nativeStake, 0, "native stake bookkeeping remains callable");
        assertNotEq(votingPowers[0], nativeStake * stakeHub.stakeWeightA() / 10_000, "native stake must not drive election while root mode is on");
    }

    function testRootStakeSnapshotJailedStatusZeroesPower() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _enableRootAnchoredMode();

        _commitRootStakeStateSync(1, _encodeRootStakePayload(3, consensusAddress, 5000 ether, 1, 0));
        _commitRootStakeStateSync(2, _encodeRootStakePayload(3, consensusAddress, 5000 ether, 2, 1));

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(votingPowers[0], 0, "jailed root snapshot must not contribute voting power");
    }

    function testRootStakeDisabledRejectsStateSync() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);

        vm.prank(STATE_RECEIVER_ADDR);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("RootStakeAnchorDisabled()"))));
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(1, _encodeRootStakePayload(1, consensusAddress, 1000 ether, 1, 0));

        operator;
    }

    function testRootStakeFreezeKeepsLastSnapshotWhenNoNewSync() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _enableRootAnchoredMode();

        _commitRootStakeStateSync(1, _encodeRootStakePayload(11, consensusAddress, 4000 ether, 1, 0));
        (, uint256[] memory before,,) = stakeHub.getValidatorElectionInfo(0, 0);

        vm.prank(operator);
        stakeHub.delegate{ value: 500 ether }(operator, false);

        (, uint256[] memory afterDelegate,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(afterDelegate[0], before[0], "missing root sync must freeze last-known-good voting power");
    }

    function testRootStakeToggleIsGovernanceControlled() public {
        (address operator,,,) = _createValidator(2000 ether);
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);

        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("rootAnchoredGiltStakingEnabled", hex"01");
        _commitRootStakeStateSync(1, _encodeRootStakePayload(5, consensusAddress, 1000 ether, 1, 0));

        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("rootAnchoredGiltStakingEnabled", hex"00");

        vm.prank(STATE_RECEIVER_ADDR);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("RootStakeAnchorDisabled()"))));
        IRootStakeStateReceiver(address(stakeHub)).onStateReceive(2, _encodeRootStakePayload(5, consensusAddress, 2000 ether, 2, 0));

        operator;
    }
}

interface IStakeCredit {
    function totalPooledGILT() external view returns (uint256);
}
