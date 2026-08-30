// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../scripts/helpers/interfaces/WGILT.generated.sol";

contract WGILTTest is Test {
    function test_wgilt_deploys_with_expected_metadata() public {
        WGILT wgilt = WGILT(deployCode("out/WGILT.sol/WGILT.json"));
        assertEq(wgilt.name(), "wGILT");
        assertEq(wgilt.symbol(), "wGILT");
        assertEq(wgilt.decimals(), 18);
    }
}
