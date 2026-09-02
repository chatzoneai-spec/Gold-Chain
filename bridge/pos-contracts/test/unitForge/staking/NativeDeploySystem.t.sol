// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../script/setup/DeploySystem.s.sol";

contract NativeDeploySystemTest is Test, DeploySystem {
    address governanceMultisig = makeAddr("governanceMultisig");

    function setUp() public {
        vm.setEnv("GOVERNANCE_MULTISIG", vm.toString(governanceMultisig));
        deployAll();
    }

    function test_native_deploy_has_no_stake_manager_or_validator_share() public view {
        assertEq(
            registry.contractMap(keccak256(abi.encodePacked("stakeManager"))),
            address(0),
            "stakeManager must not be deployed"
        );
        assertEq(registry.getValidatorShareAddress(), address(0), "validatorShare must not be deployed");
    }

    function test_root_chain_deployed_with_gold_chain_id() public view {
        assertTrue(address(rootChain) != address(0), "RootChain must be deployed");
        assertEq(IChainIdMixin(address(rootChain)).CHAINID(), 714, "RootChain CHAINID must be 714");
    }

    function test_validator_set_commitment_registered_and_initialized() public view {
        address commitment =
            registry.contractMap(keccak256(abi.encodePacked("validatorSetCommitment")));
        assertTrue(commitment != address(0), "validatorSetCommitment must be registered");
        assertGt(ValidatorSetCommitment(commitment).totalPower(), 0, "genesis commitment must have power");
        assertEq(ValidatorSetCommitment(commitment).commitmentEpoch(), 0, "genesis epoch must be 0");
    }

    function test_state_sender_deployed() public view {
        address stateSender = registry.contractMap(keccak256(abi.encodePacked("stateSender")));
        assertTrue(stateSender != address(0), "stateSender must be deployed");
    }
}
