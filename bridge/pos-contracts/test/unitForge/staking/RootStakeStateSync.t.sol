// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../script/setup/DeploySystem.s.sol";

interface IRootStakeStateSync {
    function setRootStakeStateSync(address _stateSender, address _childStakeHub) external;
    function stateSender() external view returns (address);
    function childStakeHub() external view returns (address);
}

contract MockStateSender {
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

contract RootStakeStateSyncTest is Test, DeploySystem {
    uint8 internal constant STATUS_ACTIVE = 0;

    address governanceMultisig = makeAddr("governanceMultisig");
    address childStakeHub = makeAddr("childStakeHub");

    MockStateSender internal mockStateSender;

    event Staked(
        address indexed signer,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 indexed activationEpoch,
        uint256 amount,
        uint256 total,
        bytes signerPubkey
    );

    event StateSynced(uint256 indexed id, address indexed contractAddress, bytes data);

    function setUp() public {
        if (vm.exists("out/StakeManager.sol/StakeManager.json") == false) {
            vm.skip(true, "StakeManager artifact missing: compile contracts first");
        }
        mockStateSender = new MockStateSender();
        vm.setEnv("GOVERNANCE_MULTISIG", vm.toString(governanceMultisig));
        deployAll();
        setTestConfig();
        _wireRootStakeStateSync();
    }

    function _wireRootStakeStateSync() internal {
        governanceUpdateCall(
            address(stakeManager),
            abi.encodeCall(IRootStakeStateSync.setRootStakeStateSync, (address(mockStateSender), childStakeHub))
        );
        mockStateSender.register(address(stakeManager), childStakeHub);
    }

    function _encodeRootStakePayload(
        uint256 validatorId,
        address signer,
        uint256 amount,
        uint256 nonce,
        uint8 status
    ) internal pure returns (bytes memory) {
        return abi.encode(validatorId, signer, amount, nonce, status);
    }

    function test_stakeFor_emitsStakedAndStateSyncedPayload() public {
        Validator memory validator = createValidator(8);
        address signer = address(uint160(uint256(keccak256(validator.pubKey))));
        uint256 stakeAmount = defaultStakeVS;
        uint256 fee = stakeManager.minGiltConsensusFee();
        fundAddrLegacyToken(validator.addr, stakeAmount + fee);

        vm.prank(validator.addr);
        legacyToken.approve(address(stakeManager), stakeAmount + fee);

        uint256 validatorId = stakeManager.NFTCounter();
        uint256 activationEpoch = stakeManager.epoch();
        uint256 expectedTotal = stakeManager.totalStaked() + stakeAmount;
        bytes memory expectedPayload = _encodeRootStakePayload(
            validatorId, signer, stakeAmount, 1, STATUS_ACTIVE
        );

        vm.expectEmit(true, true, true, true, address(stakingInfo));
        emit Staked(
            signer, validatorId, 1, activationEpoch, stakeAmount, expectedTotal, validator.pubKey
        );

        vm.expectEmit(true, true, false, true, address(mockStateSender));
        emit StateSynced(1, childStakeHub, expectedPayload);

        vm.prank(validator.addr);
        stakeManager.stakeFor(validator.addr, stakeAmount, fee, true, validator.pubKey);

        assertEq(mockStateSender.counter(), 1);
        assertEq(IRootStakeStateSync(address(stakeManager)).stateSender(), address(mockStateSender));
        assertEq(IRootStakeStateSync(address(stakeManager)).childStakeHub(), childStakeHub);
    }

    function test_stakeFor_withoutStateSyncConfig_stillStakes() public {
        governanceUpdateCall(
            address(stakeManager), abi.encodeCall(IRootStakeStateSync.setRootStakeStateSync, (address(0), address(0)))
        );

        Validator memory validator = createValidator(9);
        uint256 stakeAmount = defaultStakeVS;
        uint256 fee = stakeManager.minGiltConsensusFee();
        fundAddrLegacyToken(validator.addr, stakeAmount + fee);

        vm.startPrank(validator.addr);
        legacyToken.approve(address(stakeManager), stakeAmount + fee);
        stakeManager.stakeFor(validator.addr, stakeAmount, fee, true, validator.pubKey);
        vm.stopPrank();

        assertEq(mockStateSender.counter(), 0);
        assertEq(stakeManager.NFTCounter(), 2);
    }

    function test_stakeFor_unregisteredSender_skipsStateSyncWithoutReverting() public {
        mockStateSender.register(makeAddr("otherSender"), childStakeHub);

        Validator memory validator = createValidator(10);
        uint256 stakeAmount = defaultStakeVS;
        uint256 fee = stakeManager.minGiltConsensusFee();
        fundAddrLegacyToken(validator.addr, stakeAmount + fee);

        vm.startPrank(validator.addr);
        legacyToken.approve(address(stakeManager), stakeAmount + fee);
        stakeManager.stakeFor(validator.addr, stakeAmount, fee, true, validator.pubKey);
        vm.stopPrank();

        assertEq(mockStateSender.counter(), 0);
        assertEq(stakeManager.NFTCounter(), 2);
    }
}
