pragma solidity 0.6.4;

import "./System.sol";
import "./lib/RLPReader.sol";

contract StateReceiver is System {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    uint256 public lastStateId;

    mapping(uint256 => bytes) public failedStateSyncs;
    mapping(uint256 => uint8) public failedStateSyncReasons;

    uint8 public constant FAILURE_NONE = 0;
    uint8 public constant FAILURE_NON_CONTRACT_RECEIVER = 1;
    uint8 public constant FAILURE_RECEIVER_REVERTED = 2;

    event StateCommitted(uint256 indexed stateId, bool success);
    event StateSyncFailureRecorded(uint256 indexed stateId, address indexed receiver, uint8 reason);

    function commitState(uint256 syncTime, bytes calldata recordBytes) external onlySystem returns (bool success) {
        syncTime;

        RLPReader.RLPItem[] memory dataList = recordBytes.toRlpItem().toList();
        uint256 stateId = dataList[0].toUint();
        require(lastStateId + 1 == stateId, "StateIds are not sequential");
        lastStateId++;

        address receiver = dataList[1].toAddress();
        bytes memory stateData = dataList[2].toBytes();

        if (!isContract(receiver)) {
            failedStateSyncs[stateId] = abi.encode(receiver, stateData);
            failedStateSyncReasons[stateId] = FAILURE_NON_CONTRACT_RECEIVER;
            emit StateCommitted(stateId, false);
            emit StateSyncFailureRecorded(stateId, receiver, FAILURE_NON_CONTRACT_RECEIVER);
            return false;
        }

        uint256 txGas = 5000000;
        bytes memory data = abi.encodeWithSignature("onStateReceive(uint256,bytes)", stateId, stateData);
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := call(txGas, receiver, 0, add(data, 0x20), mload(data), 0, 0)
        }
        emit StateCommitted(stateId, success);
        if (!success) {
            failedStateSyncs[stateId] = abi.encode(receiver, stateData);
            failedStateSyncReasons[stateId] = FAILURE_RECEIVER_REVERTED;
            emit StateSyncFailureRecorded(stateId, receiver, FAILURE_RECEIVER_REVERTED);
        }
    }
}
