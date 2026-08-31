// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../script/setup/DeploySystem.s.sol";

interface IValidatorSetCommitment {
    function initialize(
        uint256 chainId_,
        address[] calldata consensusAddresses,
        bytes[] calldata voteKeys,
        uint256[] calldata votingPowers
    ) external;

    function totalPower() external view returns (uint256);
}

interface ISlashRelayStakeManager {
    function setValidatorSetCommitment(address _commitment) external;
    function setRootSlashRelayEnabled(bool enabled) external;
    function relaySlash(bytes calldata data, uint256[3][] calldata sigs) external;
    function validatorStake(uint256 validatorId) external view returns (uint256);
    function slashRelayNonce() external view returns (uint256);
    function executedSlashEvidence(bytes32 evidenceRef) external view returns (bool);
}

contract SlashRelayTest is Test, DeploySystem {
    uint8 internal constant SLASH_VOTE_PREFIX = 0x02;
    uint8 internal constant SLASH_TYPE_DOWNTIME = 0;

    address validatorSetCommitment;

    event Slashed(uint256 indexed nonce, uint256 indexed amount);

    function setUp() public {
        if (vm.exists("out/StakeManager.sol/StakeManager.json") == false) {
            vm.skip(true, "StakeManager artifact missing: compile contracts first");
        }
        vm.setEnv("GOVERNANCE_MULTISIG", vm.toString(makeAddr("governanceMultisig")));
        deployAll();
        setTestConfig();
        _deployAndWireCommitment();
        governanceUpdateCall(
            address(stakeManager),
            abi.encodeCall(ISlashRelayStakeManager.setRootSlashRelayEnabled, (true))
        );
    }

    function _deployAndWireCommitment() internal {
        validatorSetCommitment = deployCode("out/ValidatorSetCommitment.sol/ValidatorSetCommitment.json");
        Validator[] memory validators = new Validator[](3);
        address[] memory consensusAddresses = new address[](3);
        bytes[] memory voteKeys = new bytes[](3);
        uint256[] memory votingPowers = new uint256[](3);

        for (uint256 i = 0; i < 3; i++) {
            validators[i] = createValidator(uint8(i + 1));
            addValidator(validators[i]);
            consensusAddresses[i] = address(uint160(uint256(keccak256(validators[i].pubKey))));
            voteKeys[i] = _dummyVoteKey(i);
            votingPowers[i] = 100;
        }

        IValidatorSetCommitment(validatorSetCommitment)
            .initialize(GOLD_CHAIN_ID, consensusAddresses, voteKeys, votingPowers);

        governanceUpdateCall(
            address(stakeManager),
            abi.encodeCall(ISlashRelayStakeManager.setValidatorSetCommitment, (validatorSetCommitment))
        );
    }

    function _dummyVoteKey(uint256 seed) internal pure returns (bytes memory) {
        bytes memory key = new bytes(48);
        for (uint256 i = 0; i < 48; i++) {
            key[i] = bytes1(uint8(seed + i + 1));
        }
        return key;
    }

    function _slashData(uint256 validatorId, uint8 slashType, bytes32 evidenceRef) internal view returns (bytes memory) {
        return abi.encode(validatorId, slashType, evidenceRef, GOLD_CHAIN_ID);
    }

    function _slashVoteHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(SLASH_VOTE_PREFIX), data));
    }

    function _signSlash(Validator[] memory validators, bytes memory data) internal returns (uint256[3][] memory sigs) {
        bytes32 voteHash = _slashVoteHash(data);
        return signWithValidators(validators, voteHash);
    }

    function test_relaySlash_reducesStakeOnceAndEmitsSlashed() public {
        uint256 validatorId = 1;
        uint256 stakeBefore = ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId);
        bytes32 evidenceRef = keccak256("downtime-evidence-1");
        bytes memory data = _slashData(validatorId, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory signers = new Validator[](3);
        for (uint256 i = 0; i < 3; i++) {
            signers[i] = createValidator(uint8(i + 1));
        }
        uint256[3][] memory sigs = _signSlash(signers, data);

        vm.expectEmit(true, true, true, true, address(stakingInfo));
        emit Slashed(1, 10 ether);

        ISlashRelayStakeManager(address(stakeManager)).relaySlash(data, sigs);

        uint256 stakeAfter = ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId);
        assertEq(stakeAfter, stakeBefore - 10 ether, "stake must drop exactly once");
        assertEq(ISlashRelayStakeManager(address(stakeManager)).slashRelayNonce(), 1);
        assertTrue(ISlashRelayStakeManager(address(stakeManager)).executedSlashEvidence(evidenceRef));
    }

    function test_relaySlash_rejectsUnauthorizedSignature() public {
        uint256 validatorId = 1;
        uint256 stakeBefore = ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId);
        bytes32 evidenceRef = keccak256("forged-evidence");
        bytes memory data = _slashData(validatorId, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory forgers = new Validator[](1);
        forgers[0] = createValidator(99);
        uint256[3][] memory sigs = _signSlash(forgers, data);

        vm.expectRevert(bytes("2/3+1 non-majority!"));
        ISlashRelayStakeManager(address(stakeManager)).relaySlash(data, sigs);
        assertEq(ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId), stakeBefore);
    }

    function test_relaySlash_rejectsReplay() public {
        uint256 validatorId = 1;
        bytes32 evidenceRef = keccak256("replay-evidence");
        bytes memory data = _slashData(validatorId, SLASH_TYPE_DOWNTIME, evidenceRef);

        Validator[] memory signers = new Validator[](3);
        for (uint256 i = 0; i < 3; i++) {
            signers[i] = createValidator(uint8(i + 1));
        }
        uint256[3][] memory sigs = _signSlash(signers, data);

        ISlashRelayStakeManager(address(stakeManager)).relaySlash(data, sigs);
        uint256 stakeAfterFirst = ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId);

        vm.expectRevert(bytes("slash replay"));
        ISlashRelayStakeManager(address(stakeManager)).relaySlash(data, sigs);
        assertEq(ISlashRelayStakeManager(address(stakeManager)).validatorStake(validatorId), stakeAfterFirst, "second submit must not slash again");
    }
}
