pragma solidity ^0.5.2;

import {SafeMath} from "../common/oz/math/SafeMath.sol";
import {ECVerify} from "../common/lib/ECVerify.sol";
import {IValidatorSetCommitment} from "../staking/IValidatorSetCommitment.sol";

library CheckpointSigLib {
    using SafeMath for uint256;

    function countSignedPower(
        IValidatorSetCommitment commitment,
        bytes32 voteHash,
        uint256[3][] memory sigs
    ) internal view returns (uint256 signedPower) {
        address lastAdd;
        for (uint256 i = 0; i < sigs.length; ++i) {
            address signer = ECVerify.ecrecovery(voteHash, sigs[i]);

            if (signer == lastAdd) {
                continue;
            }

            require(signer > lastAdd, "signatures not sorted ascending");

            if (!commitment.isActiveSigner(signer)) {
                continue;
            }

            lastAdd = signer;
            signedPower = signedPower.add(commitment.getSignerPower(signer));
        }
    }
}
