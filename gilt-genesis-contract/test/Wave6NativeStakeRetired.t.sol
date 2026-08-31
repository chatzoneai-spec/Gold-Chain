// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./utils/Deployer.sol";

interface IRootStakeStateReceiver {
    function onStateReceive(uint256 stateId, bytes calldata data) external;
}

/// @notice Wave 6: native StakeCredit GILT is no longer an election power source once root-anchored mode is on.
contract Wave6NativeStakeRetiredTest is Deployer {
    function setUp() public {
        vm.mockCall(address(0x66), bytes(""), hex"01");
    }

    function _enableRootAnchoredMode() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("rootAnchoredGiltStakingEnabled", hex"01");
    }

    function _enableGiltFreezeAndSnapshot() internal {
        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("giltStakeFreezeEnabled", hex"01");
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

    function testUnflippedValidatorWithOnlyNativeStakeCreditHasZeroElectionPower() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        assertFalse(stakeHub.isGiltCutoverFlipped(operator));
        uint256 nativeStake = IStakeCredit(credit).totalPooledGILT();
        assertGt(nativeStake, 0, "native StakeCredit bookkeeping exists");

        _enableGiltFreezeAndSnapshot();
        _enableRootAnchoredMode();

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(votingPowers[0], 0, "unflipped validator must not derive election power from native StakeCredit");
        assertNotEq(
            votingPowers[0],
            nativeStake * stakeHub.stakeWeightA() / 10_000,
            "native StakeCredit must not count for election"
        );
    }

    function testFlippedValidatorWithRootSnapshotKeepsElectionPower() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        uint256 snapshotGilt = IStakeCredit(credit).totalPooledGILT();
        uint256 rootAmount = snapshotGilt + 1000 ether;

        _enableGiltFreezeAndSnapshot();
        _enableRootAnchoredMode();
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);
        _commitRootStakeStateSync(1, _encodeRootStakePayload(31, consensusAddress, rootAmount, 1, 0));
        stakeHub.cutoverValidatorToRoot(operator);

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        uint256 expected = rootAmount * stakeHub.stakeWeightA() / 10_000;
        assertEq(votingPowers[0], expected, "flipped validator with root snapshot keeps election power");
        assertGt(votingPowers[0], 0, "flipped validator must produce");
    }

    function testFrozenUnflippedValidatorHasZeroElectionPowerBeforeRootAnchored() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        assertFalse(stakeHub.isGiltCutoverFlipped(operator));
        uint256 nativeStake = IStakeCredit(credit).totalPooledGILT();

        _enableGiltFreezeAndSnapshot();

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(votingPowers[0], 0, "frozen unflipped validator must not invent native election power");
        assertNotEq(
            votingPowers[0],
            nativeStake * stakeHub.stakeWeightA() / 10_000,
            "native StakeCredit must not count during cutover freeze"
        );
    }
}

interface IStakeCredit {
    function totalPooledGILT() external view returns (uint256);
}
