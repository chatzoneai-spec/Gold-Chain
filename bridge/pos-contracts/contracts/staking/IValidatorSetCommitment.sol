pragma solidity ^0.5.2;

pragma experimental ABIEncoderV2;

interface IValidatorSetCommitment {
    struct VoteData {
        uint256 srcNum;
        bytes32 srcHash;
        uint256 tarNum;
        bytes32 tarHash;
        bytes sig;
    }

    struct EmergencyEvidence {
        uint8 kind; // 0 = double sign, 1 = malicious vote
        bytes header1;
        bytes header2;
        VoteData voteA;
        VoteData voteB;
        bytes voteKey;
    }

    function initialize(
        uint256 chainId_,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers
    ) external;

    function submitCommitment(
        uint256 newEpoch,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers,
        bytes calldata encodedSigs
    ) external;

    function emergencyEject(EmergencyEvidence calldata evidence) external;

    function commitmentEpoch() external view returns (uint256);

    function totalPower() external view returns (uint256);

    function getSigners() external view returns (address[] memory);

    function getSignerPower(address consensusAddress) external view returns (uint256);

    function isActiveSigner(address consensusAddress) external view returns (bool);

    function getVoteKey(address consensusAddress) external view returns (bytes memory);

    function verifyCheckpointSignatures(bytes32 voteHash, uint256[3][] calldata sigs)
        external
        view
        returns (uint256 signedPower);
}
