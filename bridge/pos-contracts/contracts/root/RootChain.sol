pragma solidity ^0.5.2;

import {SafeMath} from "../common/oz/math/SafeMath.sol";

import {RootChainStorage} from "./RootChainStorage.sol";

import {IRootChain} from "./IRootChain.sol";
import {IValidatorSetCommitment} from "../staking/IValidatorSetCommitment.sol";

contract RootChain is RootChainStorage, IRootChain {
    using SafeMath for uint256;

    modifier onlyDepositManager() {
        require(msg.sender == registry.getDepositManagerAddress(), "UNAUTHORIZED_DEPOSIT_MANAGER_ONLY");
        _;
    }

    function submitCheckpoint(bytes calldata data, uint256[3][] calldata sigs) external {
        (address proposer, uint256 start, uint256 end, bytes32 rootHash,, uint256 _giltChainID) =
            abi.decode(data, (address, uint256, uint256, bytes32, bytes32, uint256));
        require(CHAINID == _giltChainID, "Invalid gilt chain id");

        require(_buildHeaderBlock(proposer, start, end, rootHash), "INCORRECT_HEADER_DATA");

        address commitmentAddr = registry.contractMap(keccak256("validatorSetCommitment"));
        require(commitmentAddr != address(0), "no commitment");
        uint256 _reward = IValidatorSetCommitment(commitmentAddr).verifyCheckpointSignatures(
            keccak256(abi.encodePacked(bytes(hex"01"), data)),
            sigs
        );

        require(_reward != 0, "Invalid checkpoint");
        emit NewHeaderBlock(proposer, _nextHeaderBlock, _reward, start, end, rootHash);
        _nextHeaderBlock = _nextHeaderBlock.add(MAX_DEPOSITS);
        _blockDepositId = 1;
    }

    function updateDepositId(uint256 numDeposits) external onlyDepositManager returns (uint256 depositId) {
        depositId = currentHeaderBlock().add(_blockDepositId);
        _blockDepositId = _blockDepositId.add(numDeposits);
        require(_blockDepositId <= MAX_DEPOSITS, "TOO_MANY_DEPOSITS");
    }

    function getLastChildBlock() external view returns (uint256) {
        return headerBlocks[currentHeaderBlock()].end;
    }

    function currentHeaderBlock() public view returns (uint256) {
        return _nextHeaderBlock.sub(MAX_DEPOSITS);
    }

    function _buildHeaderBlock(address proposer, uint256 start, uint256 end, bytes32 rootHash) private returns (bool) {
        uint256 nextChildBlock;
        if (_nextHeaderBlock > MAX_DEPOSITS) {
            nextChildBlock = headerBlocks[currentHeaderBlock()].end + 1;
        }
        if (nextChildBlock != start) {
            return false;
        }

        HeaderBlock memory headerBlock =
            HeaderBlock({root: rootHash, start: nextChildBlock, end: end, createdAt: now, proposer: proposer});

        headerBlocks[_nextHeaderBlock] = headerBlock;
        return true;
    }

    function setGiltConsensusId(string memory _giltconsensusId) public onlyOwner {
        giltconsensusId = keccak256(abi.encodePacked(_giltconsensusId));
    }
}
