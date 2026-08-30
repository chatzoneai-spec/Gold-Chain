// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

contract DeploySystemWiringTest is Test {
    function test_deploy_system_wires_wgilt_and_governance_multisig() public view {
        string memory source = vm.readFile("script/setup/DeploySystem.s.sol");

        assertTrue(_contains(source, "vm.envAddress(\"GOVERNANCE_MULTISIG\")"));
        assertTrue(_contains(source, "require(owner != address(0), \"GOVERNANCE_MULTISIG not set\")"));
        assertTrue(_contains(source, "legacyToken = WGILT(deployCode(WGILTPath))"));
        assertTrue(_contains(source, "address(legacyToken)"));
        assertFalse(_contains(source, "TestToken(deployCode(TestTokenPath, abi.encode(\"Gilt Token\", \"GILT\")))"));
    }

    function test_artifact_path_includes_wgilt() public view {
        string memory source = vm.readFile("script/setup/ArtifactPath.sol");
        assertTrue(_contains(source, "WGILTPath = \"out/WGILT.sol/WGILT.json\""));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        return _containsSubstring(haystack, needle);
    }

    function _containsSubstring(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool matchAll = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    matchAll = false;
                    break;
                }
            }
            if (matchAll) return true;
        }
        return false;
    }
}
