pragma solidity ^0.5.2;

pragma experimental ABIEncoderV2;

import {Ownable} from "../common/oz/ownership/Ownable.sol";
import {SafeMath} from "../common/oz/math/SafeMath.sol";
import {Initializable} from "../common/mixin/Initializable.sol";
import {IValidatorSetCommitment} from "./IValidatorSetCommitment.sol";
import {ValidatorSetCommitmentSigLib} from "./ValidatorSetCommitmentSigLib.sol";

contract ValidatorSetCommitment is IValidatorSetCommitment, Initializable, Ownable {
    using SafeMath for uint256;

    uint256 internal constant BLS_PUBKEY_LENGTH = 48;

    uint256 public commitmentEpoch;
    uint256 public totalPower;
    uint256 public chainId;
    uint256 public evidenceMaxAge;
    address public evidenceModule;

    address[] internal signers;
    mapping(address => bytes) internal voteKeys;
    mapping(address => uint256) internal signerPower;
    mapping(address => bool) internal signerActive;
    mapping(bytes32 => address) public voteKeyHashToConsensus;

    event CommitmentPlanted(uint256 indexed epoch, uint256 totalPower, uint256 validatorCount);
    event CommitmentUpdated(uint256 indexed epoch, uint256 totalPower, uint256 validatorCount);

    constructor() public {
        _disableInitializer();
    }

    function initialize(
        uint256 chainId_,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers
    ) external initializer {
        _transferOwnership(msg.sender);
        chainId = chainId_;
        evidenceMaxAge = 28800;
        _plantCommitment(0, consensusAddresses, voteKeys, votingPowers);
    }

    function setEvidenceModule(address evidenceModule_) external onlyOwner {
        evidenceModule = evidenceModule_;
    }

    function submitCommitment(
        uint256 newEpoch,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys_,
        uint256[] calldata votingPowers,
        bytes calldata encodedSigs
    ) external {
        require(newEpoch == commitmentEpoch.add(1), "invalid epoch");
        bytes32 digest = keccak256(abi.encode(newEpoch, consensusAddresses, voteKeys_, votingPowers));
        uint256[3][] memory sigs = abi.decode(encodedSigs, (uint256[3][]));
        uint256 signedPower = ValidatorSetCommitmentSigLib.verifySignatures(
            signerPower, signerActive, digest, sigs, false
        );
        require(signedPower >= totalPower.mul(2).div(3).add(1), "2/3+1 non-majority");
        _plantCommitment(newEpoch, consensusAddresses, voteKeys_, votingPowers);
    }

    function emergencyEject(EmergencyEvidence calldata evidence) external {
        evidence;
        revert("use evidence module");
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerPower(address consensusAddress) public view returns (uint256) {
        if (!signerActive[consensusAddress]) {
            return 0;
        }
        return signerPower[consensusAddress];
    }

    function isActiveSigner(address consensusAddress) public view returns (bool) {
        return signerActive[consensusAddress];
    }

    function getVoteKey(address consensusAddress) external view returns (bytes memory) {
        return voteKeys[consensusAddress];
    }

    function verifyCheckpointSignatures(bytes32 voteHash, uint256[3][] calldata sigs)
        external
        view
        returns (uint256 signedPower)
    {
        require(totalPower > 0, "empty committed set");
        signedPower = ValidatorSetCommitmentSigLib.verifySignatures(
            signerPower, signerActive, voteHash, sigs, true
        );
        require(signedPower >= totalPower.mul(2).div(3).add(1), "2/3+1 non-majority");
    }

    function removeValidatorForEvidence(address, uint8) external {
        require(msg.sender == evidenceModule, "not evidence module");
        revert("not implemented");
    }

    function _plantCommitment(
        uint256 epoch,
        address[] memory consensusAddresses,
        bytes[] memory voteKeys_,
        uint256[] memory votingPowers
    ) internal {
        require(
            consensusAddresses.length == voteKeys_.length && consensusAddresses.length == votingPowers.length,
            "length mismatch"
        );
        require(consensusAddresses.length > 0, "empty set");

        _clearCommitment();

        uint256 newTotalPower;
        for (uint256 i = 0; i < consensusAddresses.length; i++) {
            address consensusAddress = consensusAddresses[i];
            require(consensusAddress != address(0), "zero consensus address");
            require(voteKeys_[i].length == BLS_PUBKEY_LENGTH, "invalid vote key length");
            require(votingPowers[i] > 0, "zero power");

            bytes32 voteKeyHash = keccak256(voteKeys_[i]);
            require(voteKeyHashToConsensus[voteKeyHash] == address(0), "duplicate vote key");

            signers.push(consensusAddress);
            voteKeys[consensusAddress] = voteKeys_[i];
            signerPower[consensusAddress] = votingPowers[i];
            signerActive[consensusAddress] = true;
            voteKeyHashToConsensus[voteKeyHash] = consensusAddress;
            newTotalPower = newTotalPower.add(votingPowers[i]);
        }

        commitmentEpoch = epoch;
        totalPower = newTotalPower;
    }

    function _clearCommitment() internal {
        for (uint256 i = 0; i < signers.length; i++) {
            address consensusAddress = signers[i];
            bytes32 voteKeyHash = keccak256(voteKeys[consensusAddress]);
            delete voteKeyHashToConsensus[voteKeyHash];
            delete voteKeys[consensusAddress];
            delete signerPower[consensusAddress];
            delete signerActive[consensusAddress];
        }
        delete signers;
        totalPower = 0;
    }
}
