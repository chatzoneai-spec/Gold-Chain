pragma solidity 0.5.17;

import {RootStakeStateSyncLib} from "./RootStakeStateSyncLib.sol";
import {IStateSender} from "../../root/stateSyncer/IStateSender.sol";

contract RootStakeStateSyncHarness {
    function encodePayload(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) external pure returns (bytes memory) {
        return RootStakeStateSyncLib.encodePayload(validatorId, signer, amount, nonce, status);
    }

    function syncPayload(
        address stateSenderAddr,
        address childStakeHub,
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) external {
        RootStakeStateSyncLib.maybeSync(
            stateSenderAddr, childStakeHub, address(this), validatorId, signer, amount, nonce, status
        );
    }
}

contract MockStateSenderHarness {
    mapping(address => address) public registrations;
    uint256 public counter;

    event StateSynced(uint256 indexed id, address indexed contractAddress, bytes data);

    function register(address sender, address receiver) external {
        registrations[receiver] = sender;
    }

    function syncState(address receiver, bytes calldata data) external {
        require(registrations[receiver] == msg.sender, "Invalid sender");
        counter++;
        emit StateSynced(counter, receiver, data);
    }
}
