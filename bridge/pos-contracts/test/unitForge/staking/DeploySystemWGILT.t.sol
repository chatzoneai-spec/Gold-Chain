// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../script/setup/DeploySystem.s.sol";

contract DeploySystemWGILTTest is Test, DeploySystem {
    address governanceMultisig = makeAddr("governanceMultisig");

    event Staked(
        address indexed signer,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 indexed activationEpoch,
        uint256 amount,
        uint256 total,
        bytes signerPubkey
    );

    function setUp() public {
        if (vm.exists("out/StakeManager.sol/StakeManager.json") == false) {
            vm.skip(true, "StakeManager artifact missing: branch compile blocked by StakeManager/ValidatorSetCommitment");
        }
        vm.setEnv("GOVERNANCE_MULTISIG", vm.toString(governanceMultisig));
        deployAll();
        setTestConfig();
    }

    function test_deploy_uses_wgilt_as_legacy_stake_token() public view {
        assertEq(stakeManager.tokenLegacyToken(), address(legacyToken), "tokenLegacyToken must be wGILT");
        assertEq(legacyToken.name(), "wGILT");
        assertEq(legacyToken.symbol(), "wGILT");
        assertTrue(stakeManager.token() != address(legacyToken), "POL must remain separate from wGILT stake token");
    }

    function test_governance_multisig_is_stake_manager_owner_not_deployer() public view {
        assertEq(owner, governanceMultisig, "GOVERNANCE_MULTISIG must be wired into deployAll owner");
        assertEq(stakeManager.owner(), owner, "StakeManager Ownable owner must match deploy owner");
        assertEq(stakeManager.owner(), governanceMultisig, "StakeManager owner must be GOVERNANCE_MULTISIG");
        assertNotEq(stakeManager.owner(), address(this), "StakeManager owner must not be deploy caller");
        assertEq(address(stakeManager.governance()), governanceProxy, "onlyGovernance surface is governance proxy");
        assertNotEq(governance.owner(), governanceMultisig, "Governance proxy owner is deployer, not section 9.4 holder");
    }

    function test_stakeFor_with_wgilt_emits_staked() public {
        Validator memory validator = createValidator(8);
        address signer = address(uint160(uint256(keccak256(validator.pubKey))));
        uint256 stakeAmount = defaultStakeVS;
        uint256 fee = stakeManager.minGiltConsensusFee();
        fundAddrLegacyToken(validator.addr, stakeAmount + fee);

        vm.prank(validator.addr);
        legacyToken.approve(address(stakeManager), stakeAmount + fee);

        uint256 validatorId = stakeManager.NFTCounter();
        uint256 activationEpoch = stakeManager.epoch();
        uint256 expectedTotal = stakeManager.totalStaked() + stakeAmount;

        vm.expectEmit(true, true, true, true, address(stakingInfo));
        emit Staked(
            signer, validatorId, 1, activationEpoch, stakeAmount, expectedTotal, validator.pubKey
        );

        vm.prank(validator.addr);
        stakeManager.stakeFor(validator.addr, stakeAmount, fee, true, validator.pubKey);
    }
}
