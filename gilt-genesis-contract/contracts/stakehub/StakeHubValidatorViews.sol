// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interface/0.8.x/IStakeCredit.sol";
import "./StakeHubCommon.sol";

contract StakeHubValidatorViews is StakeHubCommon {
    using EnumerableSet for EnumerableSet.AddressSet;

    function getValidatorRewardRecord(
        address operatorAddress,
        uint256 index
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted();
        return IStakeCredit(_validators[operatorAddress].creditContract).rewardRecord(index);
    }

    function getValidatorTotalPooledGILTRecord(
        address operatorAddress,
        uint256 index
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted();
        return IStakeCredit(_validators[operatorAddress].creditContract).totalPooledGILTRecord(index);
    }

    function getValidators(
        uint256 offset,
        uint256 limit
    )
        external
        view
        onlyStakeHubDelegateCall
        returns (address[] memory operatorAddrs, address[] memory creditAddrs, uint256 totalLength)
    {
        totalLength = _validatorSet.length();
        if (offset >= totalLength) {
            return (operatorAddrs, creditAddrs, totalLength);
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        operatorAddrs = new address[](count);
        creditAddrs = new address[](count);
        for (uint256 i; i < count; ++i) {
            operatorAddrs[i] = _validatorSet.at(offset + i);
            creditAddrs[i] = _validators[operatorAddrs[i]].creditContract;
        }
    }

    function getValidatorConsensusAddress(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (address consensusAddress) {
        Validator memory valInfo = _validators[operatorAddress];
        consensusAddress = valInfo.consensusAddress;
    }

    function getValidatorCreditContract(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (address creditContract) {
        Validator memory valInfo = _validators[operatorAddress];
        creditContract = valInfo.creditContract;
    }

    function getValidatorVoteAddress(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (bytes memory voteAddress) {
        Validator memory valInfo = _validators[operatorAddress];
        voteAddress = valInfo.voteAddress;
    }

    function getValidatorBasicInfo(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall returns (uint256 createdTime, bool jailed, uint256 jailUntil) {
        Validator memory valInfo = _validators[operatorAddress];
        createdTime = valInfo.createdTime;
        jailed = valInfo.jailed;
        jailUntil = valInfo.jailUntil;
    }

    function getValidatorDescription(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall validatorExist(operatorAddress) returns (Description memory) {
        return _validators[operatorAddress].description;
    }

    function getValidatorCommission(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall validatorExist(operatorAddress) returns (Commission memory) {
        return _validators[operatorAddress].commission;
    }

    function getValidatorAgent(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall validatorExist(operatorAddress) returns (address) {
        return _validators[operatorAddress].agent;
    }

    function getValidatorUpdateTime(
        address operatorAddress
    ) external view onlyStakeHubDelegateCall validatorExist(operatorAddress) returns (uint256) {
        return _validators[operatorAddress].updateTime;
    }

    function getValidatorElectionInfo(
        uint256 offset,
        uint256 limit
    )
        external
        view
        onlyStakeHubDelegateCall
        returns (
            address[] memory consensusAddrs,
            uint256[] memory votingPowers,
            bytes[] memory voteAddrs,
            uint256 totalLength
        )
    {
        totalLength = _validatorSet.length();
        if (offset >= totalLength) {
            return (consensusAddrs, votingPowers, voteAddrs, totalLength);
        }

        limit = limit == 0 ? totalLength : limit;
        uint256 count = (totalLength - offset) > limit ? limit : (totalLength - offset);
        consensusAddrs = new address[](count);
        votingPowers = new uint256[](count);
        voteAddrs = new bytes[](count);
        for (uint256 i; i < count; ++i) {
            address operatorAddress = _validatorSet.at(offset + i);
            Validator memory valInfo = _validators[operatorAddress];
            consensusAddrs[i] = valInfo.consensusAddress;
            if (valInfo.jailed) {
                votingPowers[i] = 0;
            } else {
                uint256 stakeA = _electionStakeA(operatorAddress, valInfo.consensusAddress, valInfo.creditContract);
                uint256 stakeB = _activeTotalDelegatedTokenB(operatorAddress);
                votingPowers[i] = _effectiveVotingPower(stakeA, stakeB);
            }
            voteAddrs[i] = valInfo.voteAddress;
        }
    }

    function getNodeIDs(
        address[] calldata validatorsToQuery
    )
        external
        view
        onlyStakeHubDelegateCall
        returns (address[] memory consensusAddresses, bytes32[][] memory nodeIDsList)
    {
        uint256 len = validatorsToQuery.length;
        consensusAddresses = new address[](len);
        nodeIDsList = new bytes32[][](len);

        for (uint256 i = 0; i < len; i++) {
            address operator = validatorsToQuery[i];
            Validator memory valInfo = _validators[operator];
            consensusAddresses[i] = valInfo.consensusAddress;
            nodeIDsList[i] = validatorNodeIDs[operator];
        }

        return (consensusAddresses, nodeIDsList);
    }
}
