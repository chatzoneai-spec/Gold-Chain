pragma solidity 0.5.17;

pragma experimental ABIEncoderV2;

import {Ownable} from "../common/oz/ownership/Ownable.sol";
import {SafeMath} from "../common/oz/math/SafeMath.sol";
import {Initializable} from "../common/mixin/Initializable.sol";
import {ECVerify} from "../common/lib/ECVerify.sol";
import {RLPEncode} from "../common/lib/RLPEncode.sol";
import {IValidatorSetCommitment} from "./IValidatorSetCommitment.sol";

/**
 * @title ValidatorSetCommitment
 * @notice On-chain committed validator set for checkpoint signature verification.
 *         Handoffs require ECDSA signatures from >= 2/3+1 of the current set's voting power.
 *         BLS vote keys are stored for malicious-vote evidence verification.
 */
contract ValidatorSetCommitment is IValidatorSetCommitment, Initializable, Ownable {
    using SafeMath for uint256;

    uint256 internal constant BLS_PUBKEY_LENGTH = 48;
    uint256 internal constant BLS_SIG_LENGTH = 96;
    uint256 internal constant EVIDENCE_KIND_DOUBLE_SIGN = 0;
    uint256 internal constant EVIDENCE_KIND_MALICIOUS_VOTE = 1;

    struct ValidatorInfo {
        bytes voteKey;
        uint256 votingPower;
        bool active;
    }

    uint256 public commitmentEpoch;
    uint256 public totalPower;
    uint256 public chainId;
    uint256 public evidenceMaxAge;

    address[] internal signers;
    mapping(address => ValidatorInfo) internal validators;
    mapping(bytes32 => address) internal voteKeyHashToConsensus;

    event CommitmentPlanted(uint256 indexed epoch, uint256 totalPower, uint256 validatorCount);
    event CommitmentUpdated(uint256 indexed epoch, uint256 totalPower, uint256 validatorCount);
    event ValidatorEjected(address indexed consensusAddress, uint8 reason, uint256 indexed epoch);

    constructor() public {
        _disableInitializer();
    }

    /**
     * @notice Plant the genesis commitment. No prior signatures required.
     */
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
        emit CommitmentPlanted(0, totalPower, signers.length);
    }

    /**
     * @notice Accept a new commitment signed by >= 2/3+1 of the current set's voting power.
     */
    function submitCommitment(
        uint256 newEpoch,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers,
        uint256[3][] calldata sigs
    ) external {
        require(newEpoch == commitmentEpoch.add(1), "invalid epoch");
        bytes32 digest = _commitmentDigest(newEpoch, consensusAddresses, voteKeys, votingPowers);
        uint256 signedPower = _verifyHandoffSignatures(digest, sigs);
        require(signedPower >= totalPower.mul(2).div(3).add(1), "2/3+1 non-majority");
        _plantCommitment(newEpoch, consensusAddresses, voteKeys, votingPowers);
        emit CommitmentUpdated(newEpoch, totalPower, signers.length);
    }

    /**
     * @notice Permissionless ejection on verified double-sign or malicious-vote evidence.
     */
    function emergencyEject(EmergencyEvidence calldata evidence) external {
        if (evidence.kind == EVIDENCE_KIND_DOUBLE_SIGN) {
            _ejectDoubleSign(evidence.header1, evidence.header2);
        } else if (evidence.kind == EVIDENCE_KIND_MALICIOUS_VOTE) {
            _ejectMaliciousVote(evidence.voteA, evidence.voteB, evidence.voteKey);
        } else {
            revert("unknown evidence kind");
        }
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerPower(address consensusAddress) public view returns (uint256) {
        ValidatorInfo storage info = validators[consensusAddress];
        if (!info.active) {
            return 0;
        }
        return info.votingPower;
    }

    function isActiveSigner(address consensusAddress) public view returns (bool) {
        return validators[consensusAddress].active;
    }

    function getVoteKey(address consensusAddress) external view returns (bytes memory) {
        return validators[consensusAddress].voteKey;
    }

    function _plantCommitment(
        uint256 epoch,
        address[] memory consensusAddresses,
        bytes[] memory voteKeys,
        uint256[] memory votingPowers
    ) internal {
        require(
            consensusAddresses.length == voteKeys.length && consensusAddresses.length == votingPowers.length,
            "length mismatch"
        );
        require(consensusAddresses.length > 0, "empty set");
        _requireSortedUniqueAddresses(consensusAddresses);

        _clearCommitment();

        uint256 newTotalPower;
        for (uint256 i = 0; i < consensusAddresses.length; i++) {
            address consensusAddress = consensusAddresses[i];
            require(consensusAddress != address(0), "zero consensus address");
            require(voteKeys[i].length == BLS_PUBKEY_LENGTH, "invalid vote key length");
            require(votingPowers[i] > 0, "zero power");

            bytes32 voteKeyHash = keccak256(voteKeys[i]);
            require(voteKeyHashToConsensus[voteKeyHash] == address(0), "duplicate vote key");

            signers.push(consensusAddress);
            validators[consensusAddress] = ValidatorInfo({
                voteKey: voteKeys[i],
                votingPower: votingPowers[i],
                active: true
            });
            voteKeyHashToConsensus[voteKeyHash] = consensusAddress;
            newTotalPower = newTotalPower.add(votingPowers[i]);
        }

        commitmentEpoch = epoch;
        totalPower = newTotalPower;
    }

    function _clearCommitment() internal {
        for (uint256 i = 0; i < signers.length; i++) {
            address consensusAddress = signers[i];
            bytes32 voteKeyHash = keccak256(validators[consensusAddress].voteKey);
            delete voteKeyHashToConsensus[voteKeyHash];
            delete validators[consensusAddress];
        }
        delete signers;
        totalPower = 0;
    }

    function _commitmentDigest(
        uint256 epoch,
        address[] memory consensusAddresses,
        bytes[] memory voteKeys,
        uint256[] memory votingPowers
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(epoch, consensusAddresses, voteKeys, votingPowers));
    }

    /**
     * @dev Mirrors StakeManager.checkSignatures ECDSA verification: ascending signer order,
     *      skip duplicate consecutive signers, break on out-of-order signatures.
     */
    function _verifyHandoffSignatures(bytes32 digest, uint256[3][] memory sigs)
        internal
        view
        returns (uint256 signedPower)
    {
        address lastAdd;
        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = ECVerify.ecrecovery(digest, sigs[i]);

            if (signer == lastAdd) {
                continue;
            }

            if (signer < lastAdd) {
                break;
            }

            if (!validators[signer].active) {
                continue;
            }

            lastAdd = signer;
            signedPower = signedPower.add(validators[signer].votingPower);
        }
    }

    function _ejectDoubleSign(bytes memory header1, bytes memory header2) internal {
        (address consensusAddress, uint256 evidenceHeight) = _verifyDoubleSignEvidence(header1, header2);
        require(validators[consensusAddress].active, "signer not active");
        require(evidenceHeight.add(evidenceMaxAge) >= block.number, "evidence too old");
        _removeValidator(consensusAddress, uint8(EVIDENCE_KIND_DOUBLE_SIGN));
    }

    function _ejectMaliciousVote(VoteData memory voteA, VoteData memory voteB, bytes memory voteKey) internal {
        require(voteKey.length == BLS_PUBKEY_LENGTH, "invalid vote key");
        require(
            !(voteA.srcHash == voteB.srcHash && voteA.tarHash == voteB.tarHash),
            "two identical votes"
        );
        require(voteA.srcNum < voteA.tarNum && voteB.srcNum < voteB.tarNum, "srcNum bigger than tarNum");
        require(
            (voteA.srcNum < voteB.srcNum && voteB.tarNum < voteA.tarNum)
                || (voteB.srcNum < voteA.srcNum && voteA.tarNum < voteB.tarNum)
                || voteA.tarNum == voteB.tarNum,
            "no violation of vote rules"
        );
        require(
            voteA.tarNum.add(evidenceMaxAge) > block.number && voteB.tarNum.add(evidenceMaxAge) > block.number,
            "target block too old"
        );

        bytes32 voteKeyHash = keccak256(voteKey);
        address consensusAddress = voteKeyHashToConsensus[voteKeyHash];
        require(consensusAddress != address(0) && validators[consensusAddress].active, "vote key not active");
        require(_bytesEqual(validators[consensusAddress].voteKey, voteKey), "vote key mismatch");

        require(_verifyBLSSignature(voteA, voteKey) && _verifyBLSSignature(voteB, voteKey), "verify signature failed");

        _removeValidator(consensusAddress, uint8(EVIDENCE_KIND_MALICIOUS_VOTE));
    }

    /**
     * @dev Uses chain double-sign precompile (0x68) which verifies secp256k1 header seals via ecrecover.
     */
    function _verifyDoubleSignEvidence(bytes memory header1, bytes memory header2)
        internal
        view
        returns (address signer, uint256 evidenceHeight)
    {
        require(header1.length != 0 && header2.length != 0, "empty header");

        bytes[] memory elements = new bytes[](3);
        elements[0] = _encodeUint(chainId);
        elements[1] = RLPEncode.encodeItem(header1);
        elements[2] = RLPEncode.encodeItem(header2);

        bytes memory input = RLPEncode.encodeList(elements);
        bytes memory output = new bytes(52);
        assembly {
            let len := mload(input)
            if iszero(staticcall(not(0), 0x68, add(input, 0x20), len, add(output, 0x20), 0x34)) {
                revert(0, 0)
            }
        }

        assembly {
            signer := mload(add(output, 0x14))
            evidenceHeight := mload(add(output, 0x34))
        }
        require(signer != address(0), "invalid double sign evidence");
    }

    /**
     * @dev Ported from gilt-genesis-contract SlashIndicator._verifyBLSSignature (precompile 0x66).
     */
    function _verifyBLSSignature(VoteData memory vote, bytes memory voteKey) internal view returns (bool) {
        require(vote.sig.length == BLS_SIG_LENGTH, "invalid sig length");

        bytes[] memory elements = new bytes[](4);
        elements[0] = _encodeUint(vote.srcNum);
        elements[1] = RLPEncode.encodeItem(_bytes32ToBytes(vote.srcHash));
        elements[2] = _encodeUint(vote.tarNum);
        elements[3] = RLPEncode.encodeItem(_bytes32ToBytes(vote.tarHash));

        bytes memory msgHash = _bytes32ToBytes(keccak256(RLPEncode.encodeList(elements)));

        bytes memory input = new bytes(176);
        _bytesConcat(input, msgHash, 0, 32);
        _bytesConcat(input, vote.sig, 32, 96);
        _bytesConcat(input, voteKey, 128, 48);

        bytes memory output = new bytes(1);
        assembly {
            let len := mload(input)
            if iszero(staticcall(not(0), 0x66, add(input, 0x20), len, add(output, 0x20), 0x01)) {
                revert(0, 0)
            }
        }
        return output[0] == bytes1(uint8(1));
    }

    function _removeValidator(address consensusAddress, uint8 reason) internal {
        ValidatorInfo storage info = validators[consensusAddress];
        require(info.active, "already ejected");

        totalPower = totalPower.sub(info.votingPower);
        bytes32 voteKeyHash = keccak256(info.voteKey);
        delete voteKeyHashToConsensus[voteKeyHash];

        info.votingPower = 0;
        info.active = false;
        delete info.voteKey;

        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == consensusAddress) {
                signers[i] = signers[signers.length - 1];
                signers.length--;
                break;
            }
        }

        emit ValidatorEjected(consensusAddress, reason, commitmentEpoch);
    }

    function _requireSortedUniqueAddresses(address[] memory addrs) internal pure {
        for (uint256 i = 1; i < addrs.length; i++) {
            require(addrs[i] > addrs[i - 1], "unsorted or duplicate");
        }
    }

    function _encodeUint(uint256 value) internal pure returns (bytes memory) {
        if (value == 0) {
            bytes memory zero = new bytes(1);
            zero[0] = 0x80;
            return zero;
        }

        uint256 temp = value;
        uint256 len;
        while (temp != 0) {
            len++;
            temp >>= 8;
        }

        bytes memory buf = new bytes(len);
        temp = value;
        for (uint256 i = len; i > 0; i--) {
            buf[i - 1] = bytes1(uint8(temp & 0xff));
            temp >>= 8;
        }
        return RLPEncode.encodeItem(buf);
    }

    function _bytes32ToBytes(bytes32 value) internal pure returns (bytes memory) {
        bytes memory b = new bytes(32);
        assembly {
            mstore(add(b, 32), value)
        }
        return b;
    }

    function _bytesConcat(bytes memory data, bytes memory src, uint256 index, uint256 len) internal pure {
        for (uint256 i = 0; i < len; i++) {
            data[index + i] = src[i];
        }
    }

    function _bytesEqual(bytes memory a, bytes memory b) internal pure returns (bool) {
        if (a.length != b.length) {
            return false;
        }
        for (uint256 i = 0; i < a.length; i++) {
            if (a[i] != b[i]) {
                return false;
            }
        }
        return true;
    }
}
