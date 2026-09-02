pragma solidity 0.5.17;

import {SafeMath} from "../common/oz/math/SafeMath.sol";
import {ECVerify} from "../common/lib/ECVerify.sol";

/**
 * @notice Native checkpoint verifier: checkSignatures against ValidatorSetCommitment with >=2/3+1 power.
 *         Deploy at Registry contractMap[keccak256("validatorSetCommitment")].
 */
contract ValidatorSetCheckpointVerifier {
    using SafeMath for uint256;

    address public commitment;

    constructor(address commitment_) public {
        require(commitment_ != address(0), "zero commitment");
        commitment = commitment_;
    }

    function setCommitment(address commitment_) external {
        require(commitment_ != address(0), "zero commitment");
        commitment = commitment_;
    }

    function checkSignatures(
        uint256,
        bytes32 voteHash,
        bytes32,
        address,
        uint256[3][] calldata sigs
    ) external view returns (uint256) {
        return verifyCheckpointSignatures(voteHash, sigs);
    }

    function verifyCheckpointSignatures(bytes32 voteHash, uint256[3][] memory sigs)
        public
        view
        returns (uint256 signedPower)
    {
        address activeCommitment = commitment;
        require(activeCommitment != address(0), "no commitment");

        uint256 committedTotalPower = _totalPower(activeCommitment);
        require(committedTotalPower > 0, "empty committed set");

        address lastAdd;
        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = ECVerify.ecrecovery(voteHash, sigs[i]);

            if (signer == lastAdd) {
                continue;
            }

            require(signer > lastAdd, "signatures not sorted ascending");

            if (!_isActiveSigner(activeCommitment, signer)) {
                continue;
            }

            lastAdd = signer;
            signedPower = signedPower.add(_getSignerPower(activeCommitment, signer));
        }

        require(signedPower >= committedTotalPower.mul(2).div(3).add(1), "2/3+1 non-majority");
    }

    function _totalPower(
        address activeCommitment
    ) private view returns (uint256 power) {
        (bool success, bytes memory returndata) =
            activeCommitment.staticcall(abi.encodeWithSignature("totalPower()"));
        require(success && returndata.length >= 32, "totalPower failed");
        assembly {
            power := mload(add(returndata, 32))
        }
    }

    function _isActiveSigner(address activeCommitment, address signer) private view returns (bool active) {
        (bool success, bytes memory returndata) =
            activeCommitment.staticcall(abi.encodeWithSignature("isActiveSigner(address)", signer));
        require(success && returndata.length >= 32, "isActiveSigner failed");
        assembly {
            active := mload(add(returndata, 32))
        }
    }

    function _getSignerPower(address activeCommitment, address signer) private view returns (uint256 power) {
        (bool success, bytes memory returndata) =
            activeCommitment.staticcall(abi.encodeWithSignature("getSignerPower(address)", signer));
        require(success && returndata.length >= 32, "getSignerPower failed");
        assembly {
            power := mload(add(returndata, 32))
        }
    }
}
