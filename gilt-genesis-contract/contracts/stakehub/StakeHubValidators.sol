// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interface/0.8.x/IGiltValidatorSet.sol";
import "../interface/0.8.x/IGovToken.sol";
import "../interface/0.8.x/IStakeCredit.sol";
import "../lib/0.8.x/Utils.sol";
import "./StakeHubCommon.sol";

contract StakeHubValidators is StakeHubCommon {
    using Utils for string;
    using Utils for bytes;
    using EnumerableSet for EnumerableSet.AddressSet;

    function updateAgent(
        address newAgent
    ) external onlyStakeHubDelegateCall validatorExist(msg.sender) whenNotPaused notInBlackList {
        if (agentToOperator[newAgent] != address(0)) revert InvalidAgent();
        if (_validatorSet.contains(newAgent)) revert InvalidAgent();

        address operatorAddress = msg.sender;
        address oldAgent = _validators[operatorAddress].agent;
        if (oldAgent == newAgent) revert InvalidAgent();

        if (oldAgent != address(0)) {
            delete agentToOperator[oldAgent];
        }

        _validators[operatorAddress].agent = newAgent;

        if (newAgent != address(0)) {
            agentToOperator[newAgent] = operatorAddress;
        }

        emit AgentChanged(operatorAddress, oldAgent, newAgent);
    }

    function createValidator(
        address consensusAddress,
        bytes calldata voteAddress,
        bytes calldata blsProof,
        Commission calldata commission,
        Description calldata description
    ) external payable onlyStakeHubDelegateCall whenNotPaused notInBlackList {
        // basic check
        address operatorAddress = msg.sender;
        if (validatorAllowlistEnabled && !validatorAllowlist[operatorAddress]) {
            revert NotOnValidatorAllowlist();
        }
        if (_validatorSet.contains(operatorAddress)) revert ValidatorExisted();
        if (agentToOperator[operatorAddress] != address(0)) revert InvalidValidator();

        if (consensusToOperator[consensusAddress] != address(0)) {
            revert DuplicateConsensusAddress();
        }
        if (voteToOperator[voteAddress] != address(0)) {
            revert DuplicateVoteAddress();
        }
        bytes32 monikerHash = keccak256(abi.encodePacked(description.moniker));
        if (_monikerSet[monikerHash]) revert DuplicateMoniker();

        uint256 delegation = msg.value - LOCK_AMOUNT; // create validator need to lock 1 GILT
        if (delegation < minSelfDelegationGILT) revert SelfDelegationNotEnough();

        if (consensusAddress == address(0)) revert InvalidConsensusAddress();
        if (
            commission.maxRate > 5_000 || commission.rate > commission.maxRate
                || commission.maxChangeRate > commission.maxRate
        ) revert InvalidCommission();
        if (!_checkMoniker(description.moniker)) revert InvalidMoniker();
        // proof-of-possession verify
        if (!_checkVoteAddress(operatorAddress, voteAddress, blsProof)) revert InvalidVoteAddress();

        // deploy stake credit proxy contract
        address creditContract = _deployStakeCredit(operatorAddress, description.moniker);

        _validatorSet.add(operatorAddress);
        _monikerSet[monikerHash] = true;
        Validator storage valInfo = _validators[operatorAddress];
        valInfo.consensusAddress = consensusAddress;
        valInfo.operatorAddress = operatorAddress;
        valInfo.creditContract = creditContract;
        valInfo.createdTime = block.timestamp;
        valInfo.voteAddress = voteAddress;
        valInfo.description = description;
        valInfo.commission = commission;
        valInfo.updateTime = block.timestamp;
        consensusToOperator[consensusAddress] = operatorAddress;
        voteToOperator[voteAddress] = operatorAddress;

        emit ValidatorCreated(consensusAddress, operatorAddress, creditContract, voteAddress);
        emit Delegated(operatorAddress, operatorAddress, delegation, delegation);
        emit Delegated(operatorAddress, DEAD_ADDRESS, LOCK_AMOUNT, LOCK_AMOUNT);

        IGovToken(GOV_TOKEN_ADDR).sync(creditContract, operatorAddress);
    }

    function editConsensusAddress(
        address newConsensusAddress
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        if (newConsensusAddress == address(0)) revert InvalidConsensusAddress();
        if (consensusToOperator[newConsensusAddress] != address(0)) {
            revert DuplicateConsensusAddress();
        }

        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        consensusExpiration[valInfo.consensusAddress] = block.timestamp;
        valInfo.consensusAddress = newConsensusAddress;
        valInfo.updateTime = block.timestamp;
        consensusToOperator[newConsensusAddress] = operatorAddress;

        emit ConsensusAddressEdited(operatorAddress, newConsensusAddress);
    }

    function editCommissionRate(
        uint64 commissionRate
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        if (commissionRate > valInfo.commission.maxRate) revert InvalidCommission();
        uint256 changeRate = commissionRate >= valInfo.commission.rate
            ? commissionRate - valInfo.commission.rate
            : valInfo.commission.rate - commissionRate;
        if (changeRate > valInfo.commission.maxChangeRate) revert InvalidCommission();

        valInfo.commission.rate = commissionRate;
        valInfo.updateTime = block.timestamp;

        emit CommissionRateEdited(operatorAddress, commissionRate);
    }

    function editDescription(
        Description memory description
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        address operatorAddress = _bep410MsgSender();
        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        description.moniker = valInfo.description.moniker;
        valInfo.description = description;
        valInfo.updateTime = block.timestamp;

        emit DescriptionEdited(operatorAddress);
    }

    function editVoteAddress(
        bytes calldata newVoteAddress,
        bytes calldata blsProof
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep410MsgSender()) {
        // proof-of-possession verify
        address operatorAddress = _bep410MsgSender();
        if (!_checkVoteAddress(operatorAddress, newVoteAddress, blsProof)) revert InvalidVoteAddress();
        if (voteToOperator[newVoteAddress] != address(0)) {
            revert DuplicateVoteAddress();
        }

        Validator storage valInfo = _validators[operatorAddress];
        if (valInfo.updateTime + BREATHE_BLOCK_INTERVAL > block.timestamp) revert UpdateTooFrequently();

        voteExpiration[valInfo.voteAddress] = block.timestamp;
        valInfo.voteAddress = newVoteAddress;
        valInfo.updateTime = block.timestamp;
        voteToOperator[newVoteAddress] = operatorAddress;

        emit VoteAddressEdited(operatorAddress, newVoteAddress);
    }

    function unjail(
        address operatorAddress
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(operatorAddress) {
        Validator storage valInfo = _validators[operatorAddress];
        if (!valInfo.jailed) revert ValidatorNotJailed();

        if (IStakeCredit(valInfo.creditContract).getPooledGILT(operatorAddress) < minSelfDelegationGILT) {
            revert SelfDelegationNotEnough();
        }
        if (valInfo.jailUntil > block.timestamp) revert JailTimeNotExpired();

        valInfo.jailed = false;
        numOfJailed -= 1;
        emit ValidatorUnjailed(operatorAddress);
    }

    function syncGovToken(
        address[] calldata operatorAddresses,
        address account
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList {
        uint256 _length = operatorAddresses.length;
        address[] memory stakeCredits = new address[](_length);
        address credit;
        for (uint256 i = 0; i < _length; ++i) {
            if (!_validatorSet.contains(operatorAddresses[i])) revert ValidatorNotExisted();
            credit = _validators[operatorAddresses[i]].creditContract;
            stakeCredits[i] = credit;
        }

        IGovToken(GOV_TOKEN_ADDR).syncBatch(stakeCredits, account);
    }

    function addNodeIDs(
        bytes32[] calldata nodeIDs
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep563MsgSender()) {
        maxNodeIDsInitializer();

        if (nodeIDs.length == 0) {
            revert InvalidNodeID();
        }

        address operatorAddress = _bep563MsgSender();
        bytes32[] storage existingNodeIDs = validatorNodeIDs[operatorAddress];
        uint256 currentLength = existingNodeIDs.length;

        if (currentLength + nodeIDs.length > maxNodeIDs) {
            revert ExceedsMaxNodeIDs();
        }

        // Check for duplicates in new NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            if (nodeIDs[i] == bytes32(0)) {
                revert InvalidNodeID();
            }
            for (uint256 j = i + 1; j < nodeIDs.length; j++) {
                if (nodeIDs[i] == nodeIDs[j]) {
                    revert DuplicateNodeID();
                }
            }
        }

        // Check for duplicates in existing NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            for (uint256 j = 0; j < currentLength; j++) {
                if (nodeIDs[i] == existingNodeIDs[j]) {
                    revert DuplicateNodeID();
                }
            }
        }

        // Add new NodeIDs
        for (uint256 i = 0; i < nodeIDs.length; i++) {
            existingNodeIDs.push(nodeIDs[i]);
            emit NodeIDAdded(operatorAddress, nodeIDs[i]);
        }
    }

    function removeNodeIDs(
        bytes32[] calldata targetNodeIDs
    ) external onlyStakeHubDelegateCall whenNotPaused notInBlackList validatorExist(_bep563MsgSender()) {
        address validator = _bep563MsgSender();
        bytes32[] storage nodeIDs = validatorNodeIDs[validator];
        uint256 length = nodeIDs.length;

        // If targetNodeIDs is empty, remove all NodeIDs
        if (targetNodeIDs.length == 0) {
            for (uint256 i = 0; i < length; i++) {
                emit NodeIDRemoved(validator, nodeIDs[i]);
            }
            delete validatorNodeIDs[validator];
            return;
        }

        // Otherwise, remove specific NodeIDs
        for (uint256 i = 0; i < targetNodeIDs.length; i++) {
            bytes32 nodeID = targetNodeIDs[i];
            for (uint256 j = 0; j < length; j++) {
                if (nodeIDs[j] == nodeID) {
                    // Swap and pop
                    nodeIDs[j] = nodeIDs[length - 1];
                    nodeIDs.pop();
                    length--;
                    emit NodeIDRemoved(validator, nodeID);
                    break;
                }
            }
        }

        // Clean up storage if no NodeIDs left
        if (nodeIDs.length == 0) {
            delete validatorNodeIDs[validator];
        }
    }

    function _checkMoniker(
        string memory moniker
    ) internal pure returns (bool) {
        bytes memory bz = bytes(moniker);

        // 1. moniker length should be between 3 and 9
        if (bz.length < 3 || bz.length > 9) {
            return false;
        }

        // 2. first character should be uppercase
        if (uint8(bz[0]) < 65 || uint8(bz[0]) > 90) {
            return false;
        }

        // 3. only alphanumeric characters are allowed
        for (uint256 i = 1; i < bz.length; ++i) {
            // Check if the ASCII value of the character falls outside the range of alphanumeric characters
            if (
                (uint8(bz[i]) < 48 || uint8(bz[i]) > 57) && (uint8(bz[i]) < 65 || uint8(bz[i]) > 90)
                    && (uint8(bz[i]) < 97 || uint8(bz[i]) > 122)
            ) {
                // Character is a special character
                return false;
            }
        }

        // No special characters found
        return true;
    }

    function _checkVoteAddress(
        address operatorAddress,
        bytes calldata voteAddress,
        bytes calldata blsProof
    ) internal view returns (bool) {
        if (voteAddress.length != BLS_PUBKEY_LENGTH || blsProof.length != BLS_SIG_LENGTH) {
            return false;
        }

        // get msg hash
        bytes32 msgHash = keccak256(abi.encodePacked(operatorAddress, voteAddress, block.chainid));
        bytes memory msgBz = new bytes(32);
        assembly {
            mstore(add(msgBz, 32), msgHash)
        }

        // call the precompiled contract to verify the BLS signature
        // the precompiled contract's address is 0x66
        bytes memory input = bytes.concat(msgBz, blsProof, voteAddress); // length: 32 + 96 + 48 = 176
        bytes memory output = new bytes(1);
        assembly {
            let len := mload(input)
            if iszero(staticcall(not(0), 0x66, add(input, 0x20), len, add(output, 0x20), 0x01)) {
                revert(0, 0)
            }
        }
        uint8 result = uint8(output[0]);
        if (result != uint8(1)) {
            return false;
        }
        return true;
    }

    function _deployStakeCredit(
        address operatorAddress,
        string memory moniker
    ) internal returns (address) {
        address creditProxy = address(new TransparentUpgradeableProxy(STAKE_CREDIT_ADDR, DEAD_ADDRESS, ""));
        IStakeCredit(creditProxy).initialize{ value: msg.value }(operatorAddress, moniker);
        emit StakeCreditInitialized(operatorAddress, creditProxy);

        return creditProxy;
    }

    function _currentMigrationValidatorCount() internal view returns (uint256) {
        (address[] memory consensusAddrs,) = IGiltValidatorSet(VALIDATOR_CONTRACT_ADDR).getMiningValidators();
        return consensusAddrs.length;
    }

    function _requiredMigrationApprovals(
        uint256 activeValidatorCount
    ) internal pure returns (uint256) {
        return (activeValidatorCount * 2 + 2) / 3;
    }

    function _bep410MsgSender() internal view returns (address) {
        if (agentToOperator[msg.sender] != address(0)) {
            return agentToOperator[msg.sender];
        }

        return msg.sender;
    }

    function _bep563MsgSender() internal view returns (address) {
        if (consensusToOperator[msg.sender] != address(0)) {
            return consensusToOperator[msg.sender];
        }

        return _bep410MsgSender();
    }

    function maxNodeIDsInitializer() internal {
        if (maxNodeIDs == 0) {
            maxNodeIDs = INIT_MAX_NUMBER_NODE_ID;
        }
    }
}
