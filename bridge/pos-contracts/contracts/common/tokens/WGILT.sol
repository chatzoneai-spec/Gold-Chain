pragma solidity ^0.5.2;

import {ERC20Mintable} from "../oz/token/ERC20/ERC20Mintable.sol";

/// @title wGILT
/// @notice Ethereum-side wrapped GILT ERC20 used as the Gold Chain root validator stake token (§9.1).
contract WGILT is ERC20Mintable {
    string public name;
    string public symbol;
    uint8 public decimals = 18;

    constructor() public {
        name = "wGILT";
        symbol = "wGILT";

        uint256 value = 10 ** 10 * (10 ** 18);
        mint(msg.sender, value);
    }
}
