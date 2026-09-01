// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./utils/Deployer.sol";

interface IRootStakeStateReceiver {
    function onStateReceive(uint256 stateId, bytes calldata data) external;
}

contract Wave5GiltCutoverTest is Deployer {
    function setUp() public {
        vm.mockCall(address(0x66), bytes(""), hex"01");
    }

    function _enableRootAnchoredMode() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("rootAnchoredGiltStakingEnabled", hex"01");
    }

    function _enableGiltFreeze() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("giltStakeFreezeEnabled", hex"01");
    }

    function _takeSnapshot() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.takeGiltCutoverSnapshot();
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

    function _prepareCutover(address operator, uint256 rootValidatorId, uint256 rootAmount) internal returns (uint256 snapshotGilt) {
        _enableGiltFreeze();
        _takeSnapshot();
        snapshotGilt = stakeHub.getGiltCutoverSnapshotGilt(operator);
        _enableRootAnchoredMode();
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _commitRootStakeStateSync(1, _encodeRootStakePayload(rootValidatorId, consensusAddress, rootAmount, 1, 0));
    }

    function testFreezeBlocksNewDelegate() public {
        (address operator,,,) = _createValidator(2000 ether);
        _enableGiltFreeze();

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("GiltStakeFrozen()"))));
        stakeHub.delegate{ value: 100 ether }(operator, false);
    }

    function testFlipWithoutMatchingRootWGiltReverts() public {
        (address operator,,,) = _createValidator(2000 ether);
        _enableGiltFreeze();
        _takeSnapshot();
        uint256 snapshotGilt = stakeHub.getGiltCutoverSnapshotGilt(operator);
        _enableRootAnchoredMode();

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("GiltCutoverInsufficientRootStake(uint256,uint256)")), snapshotGilt, 0
            )
        );
        stakeHub.cutoverValidatorToRoot(operator);
    }

    function testSuccessfulFlipNeverDoubleCountsPower() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        address delegator = _getNextUserAddress();
        vm.prank(delegator);
        stakeHub.delegate{ value: 500 ether }(operator, false);

        uint256 snapshotGilt = IStakeCredit(credit).totalPooledGILT();
        uint256 rootAmount = snapshotGilt + 3000 ether;
        _prepareCutover(operator, 7, rootAmount);

        stakeHub.cutoverValidatorToRoot(operator);

        assertTrue(stakeHub.isGiltCutoverFlipped(operator), "validator must be flipped");

        uint256 nativeStake = IStakeCredit(credit).totalPooledGILT();
        uint256 rootStake = stakeHub.getRootStakeAmountByConsensus(stakeHub.getValidatorConsensusAddress(operator));
        assertGt(nativeStake, 0, "native bookkeeping remains");
        assertGe(rootStake, snapshotGilt, "root stake must cover snapshot");
        assertEq(rootStake, rootAmount, "election must read synced root amount");

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        uint256 expectedRootPower = rootStake * stakeHub.stakeWeightA() / 10_000;
        assertEq(votingPowers[0], expectedRootPower, "election must use root-derived power only");
        assertNotEq(votingPowers[0], nativeStake * stakeHub.stakeWeightA() / 10_000, "native stake must not count after flip");

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("NativeGiltWritesRetired()"))));
        stakeHub.delegate{ value: 100 ether }(operator, false);
    }

    function testDelegatorCannotMigrateBeforeValidatorCutover() public {
        (address operator,,,) = _createValidator(2000 ether);
        address delegator = _getNextUserAddress();
        vm.prank(delegator);
        stakeHub.delegate{ value: 300 ether }(operator, false);

        assertEq(stakeHub.getGiltCutoverMigratedGilt(operator, delegator), 0, "no migration before flip");

        uint256 snapshotGilt = stakeHub.getGiltCutoverSnapshotGilt(operator);
        if (snapshotGilt == 0) {
            _enableGiltFreeze();
            _takeSnapshot();
            snapshotGilt = stakeHub.getGiltCutoverSnapshotGilt(operator);
        }
        _enableRootAnchoredMode();
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _commitRootStakeStateSync(2, _encodeRootStakePayload(8, consensusAddress, snapshotGilt, 1, 0));

        assertEq(stakeHub.getGiltCutoverMigratedGilt(operator, delegator), 0, "still no migration before flip");

        stakeHub.cutoverValidatorToRoot(operator);
        assertGt(stakeHub.getGiltCutoverMigratedGilt(operator, delegator), 0, "migration recorded at flip");
    }

    function testTwoValidatorsOnlyFlippedOneIsRootDerived() public {
        (address operator1,, address credit1,) = _createValidator(2000 ether);
        (address operator2,, address credit2,) = _createValidator(2000 ether);

        uint256 snapshot1 = IStakeCredit(credit1).totalPooledGILT();
        uint256 snapshot2 = IStakeCredit(credit2).totalPooledGILT();

        _enableGiltFreeze();
        _takeSnapshot();
        _enableRootAnchoredMode();

        address consensus1 = stakeHub.getValidatorConsensusAddress(operator1);
        address consensus2 = stakeHub.getValidatorConsensusAddress(operator2);
        _commitRootStakeStateSync(1, _encodeRootStakePayload(21, consensus1, snapshot1, 1, 0));
        _commitRootStakeStateSync(2, _encodeRootStakePayload(22, consensus2, snapshot2, 1, 0));

        stakeHub.cutoverValidatorToRoot(operator1);

        assertTrue(stakeHub.isGiltCutoverFlipped(operator1));
        assertFalse(stakeHub.isGiltCutoverFlipped(operator2));

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        uint256 native2 = IStakeCredit(credit2).totalPooledGILT();
        uint256 root1 = stakeHub.getRootStakeAmountByConsensus(consensus1);

        assertGt(native2, 0, "native bookkeeping remains on unflipped validator");
        assertEq(votingPowers[0], root1 * stakeHub.stakeWeightA() / 10_000, "flipped validator uses root power");
        assertEq(votingPowers[1], 0, "unflipped validator has zero election power under root-anchored mode");
    }
}

interface IStakeCredit {
    function totalPooledGILT() external view returns (uint256);
}
