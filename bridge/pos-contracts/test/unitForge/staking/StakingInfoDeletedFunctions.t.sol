// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

interface IStakingInfoSlice1 {
    function updateNonce(uint256[] calldata validatorIds, uint256[] calldata nonces) external;
    function validatorNonce(uint256 validatorId) external view returns (uint256);
}

interface IRegistry {
    function updateContractMap(bytes32 key, address addr) external;
}

contract MockGovernance {}

/// @notice Slice 1: StakeManager-gated log* emitters were removed from StakingInfo.
contract StakingInfoDeletedFunctionsTest is Test {
    address internal stakingInfo;
    address internal governance;

    function setUp() public {
        governance = address(new MockGovernance());
        IRegistry registry = IRegistry(
            deployCode("out/Registry.sol/Registry.json", abi.encode(governance))
        );
        stakingInfo = deployCode(
            "out/StakingInfo.sol/StakingInfo.json",
            abi.encode(address(registry))
        );
    }

    function test_updateNonce_stillWorks() public {
        uint256 validatorId = 9;
        uint256[] memory ids = new uint256[](1);
        uint256[] memory nonces = new uint256[](1);
        ids[0] = validatorId;
        nonces[0] = 42;

        IStakingInfoSlice1(stakingInfo).updateNonce(ids, nonces);

        assertEq(IStakingInfoSlice1(stakingInfo).validatorNonce(validatorId), 42);
    }

    function test_onlyStakeManagerGatedFunctions_noLongerExist() public {
        _assertRemoved("logStaked(address,bytes,uint256,uint256,uint256,uint256)", abi.encodeWithSignature(
            "logStaked(address,bytes,uint256,uint256,uint256,uint256)",
            makeAddr("signer"),
            hex"0102",
            uint256(1),
            uint256(2),
            uint256(3),
            uint256(4)
        ));
        _assertRemoved("logUnstaked(address,uint256,uint256,uint256)", abi.encodeWithSignature(
            "logUnstaked(address,uint256,uint256,uint256)",
            makeAddr("user"),
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logUnstakeInit(address,uint256,uint256,uint256)", abi.encodeWithSignature(
            "logUnstakeInit(address,uint256,uint256,uint256)",
            makeAddr("user"),
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logSignerChange(uint256,address,address,bytes)", abi.encodeWithSignature(
            "logSignerChange(uint256,address,address,bytes)",
            uint256(1),
            makeAddr("old"),
            makeAddr("new"),
            hex"0102"
        ));
        _assertRemoved("logRestaked(uint256,uint256,uint256)", abi.encodeWithSignature(
            "logRestaked(uint256,uint256,uint256)",
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logThresholdChange(uint256,uint256)", abi.encodeWithSignature(
            "logThresholdChange(uint256,uint256)",
            uint256(1),
            uint256(2)
        ));
        _assertRemoved("logDynastyValueChange(uint256,uint256)", abi.encodeWithSignature(
            "logDynastyValueChange(uint256,uint256)",
            uint256(1),
            uint256(2)
        ));
        _assertRemoved("logProposerBonusChange(uint256,uint256)", abi.encodeWithSignature(
            "logProposerBonusChange(uint256,uint256)",
            uint256(1),
            uint256(2)
        ));
        _assertRemoved("logRewardUpdate(uint256,uint256)", abi.encodeWithSignature(
            "logRewardUpdate(uint256,uint256)",
            uint256(1),
            uint256(2)
        ));
        _assertRemoved("logStakeUpdate(uint256)", abi.encodeWithSignature("logStakeUpdate(uint256)", uint256(1)));
        _assertRemoved("logClaimRewards(uint256,uint256,uint256)", abi.encodeWithSignature(
            "logClaimRewards(uint256,uint256,uint256)",
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logStartAuction(uint256,uint256,uint256)", abi.encodeWithSignature(
            "logStartAuction(uint256,uint256,uint256)",
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logConfirmAuction(uint256,uint256,uint256)", abi.encodeWithSignature(
            "logConfirmAuction(uint256,uint256,uint256)",
            uint256(1),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logTopUpFee(address,uint256)", abi.encodeWithSignature(
            "logTopUpFee(address,uint256)",
            makeAddr("user"),
            uint256(1)
        ));
        _assertRemoved("logClaimFee(address,uint256)", abi.encodeWithSignature(
            "logClaimFee(address,uint256)",
            makeAddr("user"),
            uint256(1)
        ));
        _assertRemoved("logSlashed(uint256,uint256)", abi.encodeWithSignature(
            "logSlashed(uint256,uint256)",
            uint256(1),
            uint256(1)
        ));
        _assertRemoved("logUnJailed(uint256,address)", abi.encodeWithSignature(
            "logUnJailed(uint256,address)",
            uint256(1),
            makeAddr("signer")
        ));
    }

    function test_validatorContractGatedFunctions_noLongerExist() public {
        _assertRemoved("logShareMinted(uint256,address,uint256,uint256)", abi.encodeWithSignature(
            "logShareMinted(uint256,address,uint256,uint256)",
            uint256(1),
            makeAddr("user"),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logShareBurned(uint256,address,uint256,uint256)", abi.encodeWithSignature(
            "logShareBurned(uint256,address,uint256,uint256)",
            uint256(1),
            makeAddr("user"),
            uint256(2),
            uint256(3)
        ));
        _assertRemoved("logDelegatorClaimRewards(uint256,address,uint256)", abi.encodeWithSignature(
            "logDelegatorClaimRewards(uint256,address,uint256)",
            uint256(1),
            makeAddr("user"),
            uint256(2)
        ));
        _assertRemoved("logDelegatorRestaked(uint256,address,uint256)", abi.encodeWithSignature(
            "logDelegatorRestaked(uint256,address,uint256)",
            uint256(1),
            makeAddr("user"),
            uint256(2)
        ));
        _assertRemoved("logDelegatorUnstaked(uint256,address,uint256)", abi.encodeWithSignature(
            "logDelegatorUnstaked(uint256,address,uint256)",
            uint256(1),
            makeAddr("user"),
            uint256(2)
        ));
        _assertRemoved("logUpdateCommissionRate(uint256,uint256,uint256)", abi.encodeWithSignature(
            "logUpdateCommissionRate(uint256,uint256,uint256)",
            uint256(1),
            uint256(2),
            uint256(3)
        ));
    }

    function test_stakeManagerViewFunctions_noLongerExist() public {
        _assertRemoved("getStakerDetails(uint256)", abi.encodeWithSignature("getStakerDetails(uint256)", uint256(1)));
        _assertRemoved("totalValidatorStake(uint256)", abi.encodeWithSignature("totalValidatorStake(uint256)", uint256(1)));
        _assertRemoved("getAccountStateRoot()", abi.encodeWithSignature("getAccountStateRoot()"));
        _assertRemoved("getValidatorContractAddress(uint256)", abi.encodeWithSignature(
            "getValidatorContractAddress(uint256)",
            uint256(1)
        ));
    }

    function _assertRemoved(string memory signature, bytes memory callData) internal {
        (bool success, bytes memory returnData) = stakingInfo.call(callData);
        assertFalse(success, string.concat(signature, " must not exist"));
        assertEq(returnData.length, 0, string.concat(signature, " must not revert with data"));
    }
}
