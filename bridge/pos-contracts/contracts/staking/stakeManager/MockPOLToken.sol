pragma solidity 0.5.17;

/// @notice Minimal POL stand-in for isolated Wave 5 cutover tests.
contract MockPOLToken {
    mapping(address => uint256) public nonces;
}
