// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

interface ICutoverSharesHarness {
    function wire(address _governance, address _registry, address _logger, address _factory) external;
    function plantValidator(uint256 validatorId, address signer, uint256 amount) external;
    function plantValidatorWithDelegation(uint256 validatorId, address signer, uint256 amount) external;
    function applyCutoverShares(uint256 validatorId, address[] calldata delegators, uint256[] calldata amounts)
        external;
    function validatorStake(uint256 validatorId) external view returns (uint256);
    function delegatedAmount(uint256 validatorId) external view returns (uint256);
    function cutoverShareApplied(uint256 validatorId, address delegator) external view returns (bool);
    function validators(uint256 validatorId)
        external
        view
        returns (
            uint256 amount,
            uint256 reward,
            uint256 activationEpoch,
            uint256 deactivationEpoch,
            uint256 jailTime,
            address signer,
            address contractAddress,
            uint8 status,
            uint256 commissionRate,
            uint256 lastCommissionUpdate,
            uint256 delegatorsReward,
            uint256 delegatedAmount_,
            uint256 initialRewardPerStake
        );
}

interface IValidatorShare {
    function balanceOf(address user) external view returns (uint256);
}

interface IRegistry {
    function updateContractMap(bytes32 key, address addr) external;
}

interface IEventsHubInit {
    function initialize(address _registry) external;
}

/// @notice Wave 5 root cutover: mint ValidatorShare 1:1 from already-locked wGILT.
///         Does NOT import DeploySystem.s.sol (Solc ICE).
contract Wave5CutoverSharesTest is Test {
    bytes32 internal constant STAKE_MANAGER_KEY = keccak256("stakeManager");

    address internal governance = makeAddr("governance");
    address internal harness;
    address internal registry;
    address internal stakingInfo;
    address internal factory;

    uint256 internal constant VALIDATOR_ID = 8;
    address internal signer = makeAddr("validatorSigner");
    address internal delegator1 = makeAddr("delegator1");
    address internal delegator2 = makeAddr("delegator2");

    function setUp() public {
        require(vm.exists("out/CutoverSharesHarness.sol/CutoverSharesHarness.json"), "compile CutoverSharesHarness first");
        require(vm.exists("out/Registry.sol/Registry.json"), "compile Registry first");
        require(vm.exists("out/StakingInfo.sol/StakingInfo.json"), "compile StakingInfo first");
        require(vm.exists("out/ValidatorShareFactory.sol/ValidatorShareFactory.json"), "compile factory first");
        require(vm.exists("out/ValidatorShare.sol/ValidatorShare.json"), "compile ValidatorShare first");
        require(vm.exists("out/EventsHub.sol/EventsHub.json"), "compile EventsHub first");
        require(vm.exists("out/MockPOLToken.sol/MockPOLToken.json"), "compile MockPOLToken first");

        registry = deployCode("out/Registry.sol/Registry.json", abi.encode(governance));
        address validatorShareImpl = deployCode("out/ValidatorShare.sol/ValidatorShare.json");
        address eventsHub = deployCode("out/EventsHub.sol/EventsHub.json");
        IEventsHubInit(eventsHub).initialize(registry);
        address polToken = deployCode("out/MockPOLToken.sol/MockPOLToken.json");
        vm.startPrank(governance);
        IRegistry(registry).updateContractMap(keccak256("validatorShare"), validatorShareImpl);
        IRegistry(registry).updateContractMap(keccak256("eventsHub"), eventsHub);
        IRegistry(registry).updateContractMap(keccak256("pol"), polToken);
        IRegistry(registry).updateContractMap(STAKE_MANAGER_KEY, address(0));
        vm.stopPrank();

        harness = deployCode("out/CutoverSharesHarness.sol/CutoverSharesHarness.json");
        vm.prank(governance);
        IRegistry(registry).updateContractMap(STAKE_MANAGER_KEY, harness);

        stakingInfo = deployCode("out/StakingInfo.sol/StakingInfo.json", abi.encode(registry));
        factory = deployCode("out/ValidatorShareFactory.sol/ValidatorShareFactory.json");

        ICutoverSharesHarness(harness).wire(governance, registry, stakingInfo, factory);
    }

    function _lockedTotal() internal pure returns (uint256) {
        return 3000 ether;
    }

    function _plantLockedValidator() internal {
        ICutoverSharesHarness(harness).plantValidator(VALIDATOR_ID, signer, _lockedTotal());
    }

    function test_applyCutoverShares_mintsOneToOne() public {
        _plantLockedValidator();

        uint256 amount1 = 500 ether;
        uint256 amount2 = 700 ether;
        address[] memory delegators = new address[](2);
        delegators[0] = delegator1;
        delegators[1] = delegator2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount1;
        amounts[1] = amount2;

        vm.prank(governance);
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);

        (, , , , , , address shareContract, , , , , ,) = ICutoverSharesHarness(harness).validators(VALIDATOR_ID);
        assertTrue(shareContract != address(0), "ValidatorShare must be created");

        assertEq(IValidatorShare(shareContract).balanceOf(delegator1), amount1, "delegator1 shares 1:1");
        assertEq(IValidatorShare(shareContract).balanceOf(delegator2), amount2, "delegator2 shares 1:1");

        assertEq(ICutoverSharesHarness(harness).validatorStake(VALIDATOR_ID), _lockedTotal() - amount1 - amount2);
        assertEq(ICutoverSharesHarness(harness).delegatedAmount(VALIDATOR_ID), amount1 + amount2);
        assertTrue(ICutoverSharesHarness(harness).cutoverShareApplied(VALIDATOR_ID, delegator1));
        assertTrue(ICutoverSharesHarness(harness).cutoverShareApplied(VALIDATOR_ID, delegator2));
    }

    function test_applyCutoverShares_usesExistingValidatorShare() public {
        ICutoverSharesHarness(harness).plantValidatorWithDelegation(VALIDATOR_ID, signer, _lockedTotal());

        address[] memory delegators = new address[](1);
        delegators[0] = delegator1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 400 ether;

        (, , , , , , address shareBefore, , , , , ,) = ICutoverSharesHarness(harness).validators(VALIDATOR_ID);

        vm.prank(governance);
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);

        (, , , , , , address shareAfter, , , , , ,) = ICutoverSharesHarness(harness).validators(VALIDATOR_ID);
        assertEq(shareAfter, shareBefore, "must mint on existing ValidatorShare");
        assertEq(IValidatorShare(shareAfter).balanceOf(delegator1), 400 ether);
    }

    function test_applyCutoverShares_twice_reverts() public {
        _plantLockedValidator();

        address[] memory delegators = new address[](1);
        delegators[0] = delegator1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 500 ether;

        vm.prank(governance);
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);

        vm.prank(governance);
        vm.expectRevert(bytes("already applied"));
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);
    }

    function test_applyCutoverShares_exceedsLockedWGilt_reverts() public {
        _plantLockedValidator();

        address[] memory delegators = new address[](1);
        delegators[0] = delegator1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _lockedTotal() + 1 ether;

        vm.prank(governance);
        vm.expectRevert(bytes("exceeds locked wGILT"));
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);
    }

    function test_applyCutoverShares_unauthorized_reverts() public {
        _plantLockedValidator();

        address[] memory delegators = new address[](1);
        delegators[0] = delegator1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 ether;

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(bytes("Only governance contract is authorized"));
        ICutoverSharesHarness(harness).applyCutoverShares(VALIDATOR_ID, delegators, amounts);
    }
}
