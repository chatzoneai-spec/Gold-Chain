pragma solidity 0.5.17;

import {StakeManagerExtension} from "./StakeManagerExtension.sol";
import {IValidatorSetCommitment} from "../IValidatorSetCommitment.sol";

/// @notice Minimal harness exposing slash-relay verification for isolated Wave 4 attack tests.
///         Does not pull DeploySystem.s.sol into the compile graph.
contract SlashRelayHarness is StakeManagerExtension {
    function wireCommitment(address commitment) external {
        validatorSetCommitment = IValidatorSetCommitment(commitment);
        rootSlashRelayEnabled = true;
    }

    function wireRootChain(address rootChainAddr) external {
        rootChain = rootChainAddr;
    }

    function exposedVerifyCommittedMajority(bytes32 voteHash, uint256[3][] calldata sigs)
        external
        view
        returns (uint256 signedStakePower, uint256 committedTotalPower)
    {
        return _verifyCommittedMajority(voteHash, sigs);
    }

    function exposedRelaySlash(bytes calldata data, uint256[3][] calldata sigs) external {
        this.relaySlash(data, sigs);
    }
}
