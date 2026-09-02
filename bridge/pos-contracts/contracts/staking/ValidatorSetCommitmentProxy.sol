pragma solidity ^0.5.2;

import {Proxy} from "../common/misc/Proxy.sol";

contract ValidatorSetCommitmentProxy is Proxy {
    constructor(address _proxyTo) public Proxy(_proxyTo) {}
}
