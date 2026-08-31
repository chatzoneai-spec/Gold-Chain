// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

interface IMockValidatorSetCommitmentHarness {
    function plant(address[] memory consensusAddresses, uint256[] memory votingPowers) external;
    function totalPower() external view returns (uint256);
}

interface ISlashRelayHarness {
    function wireCommitment(address commitment) external;
    function wireRootChain(address rootChainAddr) external;
    function exposedVerifyCommittedMajority(bytes32 voteHash, uint256[3][] calldata sigs)
        external
        view
        returns (uint256 signedStakePower, uint256 committedTotalPower);
    function exposedRelaySlash(bytes calldata data, uint256[3][] calldata sigs) external;
}

/// @notice Wave 4 attack tests for forged slash-relay messages.
///         Does NOT import DeploySystem.s.sol (Solc ICE).
contract Wave4SlashRelayAttackTest is Test {
    uint8 internal constant SLASH_VOTE_PREFIX = 0x02;
    uint8 internal constant SLASH_TYPE_DOWNTIME = 0;
    uint256 internal constant GOLD_CHAIN_ID = 714;

    address internal harness;
    address internal commitment;
    address internal rootChain;

    struct Validator {
        uint8 id;
        address addr;
        uint256 pk;
        bytes pubKey;
    }

    function setUp() public {
        require(vm.exists("out/SlashRelayHarness.sol/SlashRelayHarness.json"), "compile SlashRelayHarness first");
        require(vm.exists("out/MockValidatorSetCommitmentHarness.sol/MockValidatorSetCommitmentHarness.json"), "compile MockValidatorSetCommitmentHarness first");
        require(vm.exists("out/MockRootChainChainId.sol/MockRootChainChainId.json"), "compile MockRootChainChainId first");

        harness = deployCode("out/SlashRelayHarness.sol/SlashRelayHarness.json");
        commitment = deployCode("out/MockValidatorSetCommitmentHarness.sol/MockValidatorSetCommitmentHarness.json");
        rootChain = deployCode("out/MockRootChainChainId.sol/MockRootChainChainId.json");

        ISlashRelayHarness(harness).wireRootChain(rootChain);
        _plantThreeValidatorCommitment();
        ISlashRelayHarness(harness).wireCommitment(commitment);
    }

    function _plantThreeValidatorCommitment() internal {
        address[] memory consensusAddresses = new address[](3);
        uint256[] memory votingPowers = new uint256[](3);

        for (uint256 i = 0; i < 3; i++) {
            Validator memory v = _createValidator(uint8(i + 1));
            consensusAddresses[i] = v.addr;
            votingPowers[i] = 100;
        }

        IMockValidatorSetCommitmentHarness(commitment).plant(consensusAddresses, votingPowers);
    }

    function _createValidator(uint8 id) internal returns (Validator memory validator) {
        uint256 pk = uint256(keccak256(abi.encodePacked("wave4-validator", id)));
        validator.addr = vm.addr(pk);
        validator.pk = pk;
        validator.pubKey = bytes.concat(bytes32(uint256(id) + 1), bytes32(uint256(id) + 2));
        validator.id = id;
    }

    function _slashData(uint256 validatorId, uint8 slashType, bytes32 evidenceRef) internal view returns (bytes memory) {
        return abi.encode(validatorId, slashType, evidenceRef, GOLD_CHAIN_ID);
    }

    function _slashVoteHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(SLASH_VOTE_PREFIX), data));
    }

    function _signSlash(Validator[] memory validators, bytes memory data) internal returns (uint256[3][] memory sigs) {
        bytes32 voteHash = _slashVoteHash(data);
        sigs = new uint256[3][](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(validators[i].pk, voteHash);
            sigs[i] = [uint256(r), uint256(s), uint256(v)];
        }
    }

    function test_ATTACK_forgedSlash_unauthorizedSigner_rejected() public {
        bytes32 evidenceRef = keccak256("wave4-forged-unauthorized");
        bytes memory data = _slashData(1, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory forgers = new Validator[](1);
        forgers[0] = _createValidator(99);
        uint256[3][] memory sigs = _signSlash(forgers, data);

        vm.expectRevert(bytes("2/3+1 non-majority!"));
        ISlashRelayHarness(harness).exposedRelaySlash(data, sigs);
    }

    function test_ATTACK_forgedSlash_oneValidatorAlone_rejected() public {
        bytes32 evidenceRef = keccak256("wave4-one-validator-alone");
        bytes memory data = _slashData(1, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory oneSigner = new Validator[](1);
        oneSigner[0] = _createValidator(1);
        uint256[3][] memory sigs = _signSlash(oneSigner, data);

        (uint256 signedPower, uint256 totalPower) =
            ISlashRelayHarness(harness).exposedVerifyCommittedMajority(_slashVoteHash(data), sigs);
        assertEq(signedPower, 100, "single signer power");
        assertLt(signedPower, (totalPower * 2) / 3 + 1, "must be below 2/3+1 threshold");

        vm.expectRevert(bytes("2/3+1 non-majority!"));
        ISlashRelayHarness(harness).exposedRelaySlash(data, sigs);
    }

    function test_ATTACK_forgedSlash_wrongVoteHash_rejected() public {
        bytes32 evidenceRef = keccak256("wave4-wrong-vote-hash");
        bytes memory data = _slashData(1, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory signers = new Validator[](3);
        for (uint256 i = 0; i < 3; i++) {
            signers[i] = _createValidator(uint8(i + 1));
        }
        bytes32 wrongHash = keccak256("attacker-wrong-hash");
        uint256[3][] memory sigs = new uint256[3][](3);
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signers[i].pk, wrongHash);
            sigs[i] = [uint256(r), uint256(s), uint256(v)];
        }

        (uint256 signedPower,) =
            ISlashRelayHarness(harness).exposedVerifyCommittedMajority(_slashVoteHash(data), sigs);
        assertEq(signedPower, 0, "wrong-hash sigs must not count toward slash vote");

        vm.expectRevert(bytes("2/3+1 non-majority!"));
        ISlashRelayHarness(harness).exposedRelaySlash(data, sigs);
    }

    function test_ATTACK_forgedSlash_wrongChainId_rejected() public {
        bytes32 evidenceRef = keccak256("wave4-wrong-chain-id");
        bytes memory data = abi.encode(1, SLASH_TYPE_DOWNTIME, evidenceRef, 1);

        Validator[] memory signers = new Validator[](3);
        for (uint256 i = 0; i < 3; i++) {
            signers[i] = _createValidator(uint8(i + 1));
        }
        uint256[3][] memory sigs = _signSlash(signers, data);

        vm.expectRevert(bytes("invalid gilt chain id"));
        ISlashRelayHarness(harness).exposedRelaySlash(data, sigs);
    }
}
