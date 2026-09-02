// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./utils/Deployer.sol";
import "./utils/interface/IStakeCredit.sol";

/// @notice Native StakeHub GILT staking: election power from totalPooledGILT and unconditional downtime slash.
contract StakeHubNativeStakingTest is Deployer {
    function setUp() public {
        vm.mockCall(address(0x66), bytes(""), hex"01");
    }

    function testNativeElectionPowerFromTotalPooledGILT() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        _createValidator(2000 ether);

        address delegator = _getNextUserAddress();
        uint256 delegation = 500 ether;
        vm.prank(delegator);
        stakeHub.delegate{ value: delegation }(operator, false);

        uint256 totalPooled = StakeCredit(payable(credit)).totalPooledGILT();
        assertGt(totalPooled, 2000 ether, "delegation should increase totalPooledGILT");

        (, uint256[] memory votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        uint256 expectedPower = totalPooled * stakeHub.stakeWeightA() / 10_000;
        assertEq(votingPowers[0], expectedPower, "election power must use native totalPooledGILT");

        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("giltStakeFreezeEnabled", hex"01");
        (, votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(votingPowers[0], 0, "freeze must zero election power");

        vm.prank(GOV_HUB_ADDR);
        stakeHub.updateParam("giltStakeFreezeEnabled", hex"00");
        (, votingPowers,,) = stakeHub.getValidatorElectionInfo(0, 0);
        assertEq(votingPowers[0], expectedPower, "unfreeze must restore election power");
    }

    function testDowntimeSlashReducesTotalPooledGILT() public {
        (address operator,, address credit,) = _createValidator(2000 ether);
        _createValidator(2000 ether);

        uint256 pooledBefore = StakeCredit(payable(credit)).totalPooledGILT();
        uint256 slashAmt = stakeHub.downtimeSlashAmount();
        address consensusAddress = stakeHub.getValidatorConsensusAddress(operator);

        vm.prank(SLASH_CONTRACT_ADDR);
        stakeHub.downtimeSlash(consensusAddress);

        uint256 pooledAfter = StakeCredit(payable(credit)).totalPooledGILT();
        assertEq(pooledBefore - pooledAfter, slashAmt, "downtime slash must reduce totalPooledGILT");
    }
}
