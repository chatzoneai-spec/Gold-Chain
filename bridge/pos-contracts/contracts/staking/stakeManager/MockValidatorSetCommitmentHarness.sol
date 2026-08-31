pragma solidity 0.5.17;

/// @notice Minimal mock for slash-relay 2/3+1 verification (avoids ValidatorSetCommitment Solc ICE graph).
contract MockValidatorSetCommitmentHarness {
    uint256 public totalPower;
    mapping(address => uint256) internal signerPower;
    mapping(address => bool) internal activeSigner;

    function plant(address[] calldata consensusAddresses, uint256[] calldata votingPowers) external {
        totalPower = 0;
        for (uint256 i = 0; i < consensusAddresses.length; i++) {
            address signer = consensusAddresses[i];
            signerPower[signer] = votingPowers[i];
            activeSigner[signer] = true;
            totalPower += votingPowers[i];
        }
    }

    function getSignerPower(address consensusAddress) external view returns (uint256) {
        return signerPower[consensusAddress];
    }

    function isActiveSigner(address consensusAddress) external view returns (bool) {
        return activeSigner[consensusAddress];
    }
}
