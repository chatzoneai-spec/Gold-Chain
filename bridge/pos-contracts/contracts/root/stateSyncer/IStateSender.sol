pragma solidity ^0.5.2;

interface IStateSender {
    function registrations(address receiver) external view returns (address);

    function syncState(address receiver, bytes calldata data) external;
}
