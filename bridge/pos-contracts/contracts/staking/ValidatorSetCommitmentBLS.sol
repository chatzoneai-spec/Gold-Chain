pragma solidity 0.5.17;

/**
 * @dev Isolated BLS precompile (0x66) staticcall to avoid solc 0.5.17 codegen ICE in ValidatorSetCommitment.
 */
library ValidatorSetCommitmentBLS {
    function verifyPrebuilt(bytes memory input) internal view returns (bool) {
        bytes memory output = new bytes(1);
        assembly {
            let len := mload(input)
            if iszero(staticcall(not(0), 0x66, add(input, 0x20), len, add(output, 0x20), 0x01)) {
                revert(0, 0)
            }
        }
        return output[0] == bytes1(uint8(1));
    }
}
