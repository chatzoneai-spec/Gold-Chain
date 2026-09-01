// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interface/0.8.x/IGovToken.sol";
import "../interface/0.8.x/IStakeCredit.sol";
import "./StakeHubCommon.sol";

contract StakeHubSlashing is StakeHubCommon {
    using EnumerableSet for EnumerableSet.AddressSet;

    function settleSlashReserve1155(
        address recipient,
        uint256 tokenId,
        uint256 amount
    ) external onlyStakeHubDelegateCall onlyGov {
        address reserveVault = slashReserveVault;
        if (
            recipient == address(0) || amount == 0 || stakeTokenB == address(0) || !_isSupportedTokenBId(tokenId)
                || reserveVault == address(0) || reserveVault == DEAD_ADDRESS
                || amount > slashReserveAmountById[tokenId]
        ) {
            revert InvalidRequest();
        }

        slashReserveAmountById[tokenId] -= amount;
        IERC1155(stakeTokenB).safeTransferFrom(reserveVault, recipient, tokenId, amount, "");
        emit SlashReserveSettled(recipient, tokenId, amount, block.timestamp / BREATHE_BLOCK_INTERVAL);
    }

    function migrateSelfCustodiedSlashReserve(
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external onlyStakeHubDelegateCall onlyGov {
        address reserveVault = slashReserveVault;
        if (
            slashReserveSelfMigrationCompleted || reserveVault == address(0) || reserveVault == DEAD_ADDRESS
                || reserveVault == address(this) || stakeTokenB == address(0) || tokenIds.length == 0
                || tokenIds.length != amounts.length
        ) {
            revert InvalidRequest();
        }

        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            uint256 amount = amounts[i];
            if (amount == 0 || !_isSupportedTokenBId(tokenId) || amount > slashReserveAmountById[tokenId]) {
                revert InvalidRequest();
            }
            if (amount > IERC1155(stakeTokenB).balanceOf(address(this), tokenId)) {
                revert InvalidRequest();
            }

            IERC1155(stakeTokenB).safeTransferFrom(address(this), reserveVault, tokenId, amount, "");
            emit SlashReserveMigratedFromSelf(reserveVault, tokenId, amount);
        }

        slashReserveSelfMigrationCompleted = true;
        emit SlashReserveSelfMigrationFinalized(reserveVault, tokenIds.length);
    }

    function downtimeSlash(
        address consensusAddress
    ) external onlyStakeHubDelegateCall onlySlash {
        address operatorAddress = consensusToOperator[consensusAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 jailUntil = block.timestamp + downtimeJailTime;
        bytes32 evidenceRef = keccak256(abi.encodePacked(consensusAddress, SlashType.DownTime, block.number));
        uint256 slashAmount = _applySlash(
            consensusAddress, operatorAddress, valInfo, downtimeSlashAmount, SlashType.DownTime, evidenceRef, jailUntil
        );

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.DownTime);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    function maliciousVoteSlash(
        bytes calldata voteAddress
    ) external onlyStakeHubDelegateCall onlySlash whenNotPaused {
        address operatorAddress = voteToOperator[voteAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 index = block.timestamp / BREATHE_BLOCK_INTERVAL;
        // This is to prevent many honest validators being slashed at the same time because of implementation bugs
        if (_felonyMap[index] >= maxFelonyBetweenBreatheBlock) revert NoMoreFelonyAllowed();
        _felonyMap[index] += 1;

        // check if the voteAddress has already expired
        if (voteExpiration[voteAddress] != 0 && voteExpiration[voteAddress] + BREATHE_BLOCK_INTERVAL < block.timestamp)
        {
            revert VoteAddressExpired();
        }

        // slash
        (bool canSlash, uint256 jailUntil) = _checkFelonyRecord(operatorAddress, SlashType.MaliciousVote);
        if (!canSlash) revert AlreadySlashed();
        bytes32 evidenceRef = keccak256(abi.encodePacked(voteAddress, SlashType.MaliciousVote, block.number));
        uint256 slashAmount = _applySlash(
            valInfo.consensusAddress,
            operatorAddress,
            valInfo,
            felonySlashAmount,
            SlashType.MaliciousVote,
            evidenceRef,
            jailUntil
        );

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.MaliciousVote);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    function doubleSignSlash(
        address consensusAddress
    ) external onlyStakeHubDelegateCall onlySlash whenNotPaused {
        address operatorAddress = consensusToOperator[consensusAddress];
        if (!_validatorSet.contains(operatorAddress)) revert ValidatorNotExisted(); // should never happen
        Validator storage valInfo = _validators[operatorAddress];

        uint256 index = block.timestamp / BREATHE_BLOCK_INTERVAL;
        // This is to prevent many honest validators being slashed at the same time because of implementation bugs
        if (_felonyMap[index] >= maxFelonyBetweenBreatheBlock) revert NoMoreFelonyAllowed();
        _felonyMap[index] += 1;

        // check if the consensusAddress has already expired
        if (
            consensusExpiration[consensusAddress] != 0
                && consensusExpiration[consensusAddress] + BREATHE_BLOCK_INTERVAL < block.timestamp
        ) {
            revert ConsensusAddressExpired();
        }

        // slash
        (bool canSlash, uint256 jailUntil) = _checkFelonyRecord(operatorAddress, SlashType.DoubleSign);
        if (!canSlash) revert AlreadySlashed();
        bytes32 evidenceRef = keccak256(abi.encodePacked(consensusAddress, SlashType.DoubleSign, block.number));
        uint256 slashAmount = _applySlash(
            consensusAddress,
            operatorAddress,
            valInfo,
            felonySlashAmount,
            SlashType.DoubleSign,
            evidenceRef,
            jailUntil
        );

        emit ValidatorSlashed(operatorAddress, jailUntil, slashAmount, SlashType.DoubleSign);

        IGovToken(GOV_TOKEN_ADDR).sync(valInfo.creditContract, operatorAddress);
    }

    function slashReserveBalanceById(
        uint256 tokenId
    ) external view onlyStakeHubDelegateCall returns (uint256) {
        address reserveVault = slashReserveVault;
        if (reserveVault == address(0) || stakeTokenB == address(0)) {
            return 0;
        }
        return IERC1155(stakeTokenB).balanceOf(reserveVault, tokenId);
    }

    function _applySlash(
        address consensusAddress,
        address operatorAddress,
        Validator storage valInfo,
        uint256 slashAmount,
        SlashType slashType,
        bytes32 evidenceRef,
        uint256 jailUntil
    ) internal returns (uint256 giltSlashAmount) {
        if (rootAnchoredGiltStakingEnabled && giltCutoverFlipped[operatorAddress]) {
            uint256 rootValidatorId = _rootValidatorIdBySigner[consensusAddress];
            if (rootValidatorId == 0) revert InvalidRequest();
            emit RootSlashIntent(
                rootValidatorId,
                consensusAddress,
                _rootSlashTypeCode(slashType),
                evidenceRef,
                block.number
            );
            _jailValidator(valInfo, jailUntil);
            return 0;
        }

        if (rootAnchoredGiltStakingEnabled) {
            _jailValidator(valInfo, jailUntil);
            return 0;
        }

        giltSlashAmount = _slashWithTokenBFirst(operatorAddress, valInfo.creditContract, slashAmount, slashType);
        _jailValidator(valInfo, jailUntil);
        return giltSlashAmount;
    }

    function _rootSlashTypeCode(
        SlashType slashType
    ) internal pure returns (uint8) {
        if (slashType == SlashType.DownTime) {
            return 0;
        }
        if (slashType == SlashType.DoubleSign) {
            return 1;
        }
        return 2;
    }

    function _slashWithTokenBFirst(
        address operatorAddress,
        address creditContract,
        uint256 slashAmount,
        SlashType slashType
    ) internal returns (uint256 giltSlashAmount) {
        uint256 remaining = slashAmount;

        if (stakeTokenB != address(0)) {
            remaining = _slashTokenB1155(operatorAddress, remaining, slashType);
        }

        if (remaining != 0) {
            giltSlashAmount = IStakeCredit(creditContract).slash(remaining);
        }
    }

    function _slashTokenB1155(
        address operatorAddress,
        uint256 remaining,
        SlashType slashType
    ) internal returns (uint256) {
        address reserveVault = slashReserveVault;
        if (reserveVault == address(0) || reserveVault == DEAD_ADDRESS || reserveVault == address(this)) {
            revert SlashReserveNotConfigured();
        }

        uint256 selfTokenBAmount = _activeDelegatedTokenB(operatorAddress, operatorAddress);
        if (selfTokenBAmount == 0) {
            return remaining;
        }

        _settleTokenBReward(operatorAddress, operatorAddress);
        uint256 tokenBSlashAmount = selfTokenBAmount > remaining ? remaining : selfTokenBAmount;
        uint256 primaryStake = _delegatedTokenBById[operatorAddress][operatorAddress][stakeTokenBPrimaryId];
        uint256 secondaryStake = _delegatedTokenBById[operatorAddress][operatorAddress][stakeTokenBSecondaryId];
        uint256 primarySlash = primaryStake == 0 ? 0 : (tokenBSlashAmount * primaryStake) / selfTokenBAmount;
        if (primarySlash > primaryStake) {
            primarySlash = primaryStake;
        }
        uint256 secondarySlash = tokenBSlashAmount - primarySlash;
        if (secondarySlash > secondaryStake) {
            uint256 overflow = secondarySlash - secondaryStake;
            secondarySlash = secondaryStake;
            primarySlash += overflow;
        }

        _delegatedTokenB[operatorAddress][operatorAddress] = selfTokenBAmount - tokenBSlashAmount;
        totalDelegatedTokenB[operatorAddress] -= tokenBSlashAmount;
        if (primarySlash != 0) {
            _delegatedTokenBById[operatorAddress][operatorAddress][stakeTokenBPrimaryId] = primaryStake - primarySlash;
            totalDelegatedTokenBById[operatorAddress][stakeTokenBPrimaryId] -= primarySlash;
            IERC1155(stakeTokenB).safeTransferFrom(address(this), reserveVault, stakeTokenBPrimaryId, primarySlash, "");
            slashReserveAmountById[stakeTokenBPrimaryId] += primarySlash;
            emit SlashReserveCredited(
                operatorAddress, slashType, stakeTokenBPrimaryId, primarySlash, block.timestamp / BREATHE_BLOCK_INTERVAL
            );
            emit TokenB1155Slashed(operatorAddress, stakeTokenBPrimaryId, primarySlash, uint8(slashType));
        }
        if (secondarySlash != 0) {
            _delegatedTokenBById[operatorAddress][operatorAddress][stakeTokenBSecondaryId] =
                secondaryStake - secondarySlash;
            totalDelegatedTokenBById[operatorAddress][stakeTokenBSecondaryId] -= secondarySlash;
            IERC1155(stakeTokenB)
                .safeTransferFrom(address(this), reserveVault, stakeTokenBSecondaryId, secondarySlash, "");
            slashReserveAmountById[stakeTokenBSecondaryId] += secondarySlash;
            emit SlashReserveCredited(
                operatorAddress,
                slashType,
                stakeTokenBSecondaryId,
                secondarySlash,
                block.timestamp / BREATHE_BLOCK_INTERVAL
            );
            emit TokenB1155Slashed(operatorAddress, stakeTokenBSecondaryId, secondarySlash, uint8(slashType));
        }

        _syncTokenBRewardDebt(operatorAddress, operatorAddress);
        if (_delegatedTokenB[operatorAddress][operatorAddress] == 0) {
            _tokenBDelegators[operatorAddress].remove(operatorAddress);
        }

        emit TokenBSlashed(operatorAddress, tokenBSlashAmount, uint8(slashType));
        return remaining - tokenBSlashAmount;
    }
}
