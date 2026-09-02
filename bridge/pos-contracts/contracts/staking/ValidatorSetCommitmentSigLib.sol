pragma solidity ^0.5.2;

import {SafeMath} from "../common/oz/math/SafeMath.sol";
import {ECVerify} from "../common/lib/ECVerify.sol";

library ValidatorSetCommitmentSigLib {
    using SafeMath for uint256;

    function verifySignatures(
        mapping(address => uint256) storage signerPower,
        mapping(address => bool) storage signerActive,
        bytes32 digest,
        uint256[3][] memory sigs,
        bool strictAscending
    ) internal view returns (uint256 signedPower) {
        address lastAdd;
        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = ECVerify.ecrecovery(digest, sigs[i]);

            if (signer == lastAdd) {
                continue;
            }

            if (strictAscending) {
                require(signer > lastAdd, "signatures not sorted ascending");
            } else if (signer < lastAdd) {
                break;
            }

            if (!signerActive[signer]) {
                continue;
            }

            lastAdd = signer;
            signedPower = signedPower.add(signerPower[signer]);
        }
    }
}
