pragma solidity 0.5.17;

import {IStateSender} from "../../root/stateSyncer/IStateSender.sol";
import {StakeManagerStorage} from "./StakeManagerStorage.sol";

library RootStakeStateSyncLib {
    uint8 internal constant STATUS_ACTIVE = 0;
    uint8 internal constant STATUS_JAILED = 1;
    uint8 internal constant STATUS_UNSTAKED = 2;

    function encodePayload(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) internal pure returns (bytes memory) {
        return abi.encode(validatorId, signer, amount, nonce, status);
    }

    function maybeSync(
        address stateSenderAddr,
        address childStakeHub,
        address registeredSender,
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) internal {
        if (stateSenderAddr == address(0) || childStakeHub == address(0)) {
            return;
        }

        IStateSender stateSender = IStateSender(stateSenderAddr);
        if (stateSender.registrations(childStakeHub) != registeredSender) {
            return;
        }

        stateSender.syncState(childStakeHub, encodePayload(validatorId, signer, amount, nonce, status));
    }

    function rootStakeStatus(StakeManagerStorage.Status status) internal pure returns (uint8) {
        if (status == StakeManagerStorage.Status.Unstaked) {
            return STATUS_UNSTAKED;
        }
        if (status == StakeManagerStorage.Status.Locked) {
            return STATUS_JAILED;
        }
        return STATUS_ACTIVE;
    }
}
