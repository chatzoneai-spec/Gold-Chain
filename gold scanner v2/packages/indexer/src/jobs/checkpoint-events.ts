import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  chainStatusFromCode,
  GOLD_CHECKPOINT_EVENT_TOPIC,
} from "../gold-topics.js";
import { hexToNumber } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processCheckpointEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_CHECKPOINT_EVENT_TOPIC) {
      continue;
    }

    const [checkpointWord, validatorSetWord, statusCode] = abiDecodeStatic(
      log.data,
      3,
    );
    const chainStatus = chainStatusFromCode(Number(statusCode));

    await writer.insertCheckpoint({
      blockNumber: hexToNumber(log.blockNumber),
      checkpointHash: `0x${checkpointWord.toString(16).padStart(64, "0")}`,
      validatorSetHash: `0x${validatorSetWord.toString(16).padStart(64, "0")}`,
      chainStatus,
      finalityStatus,
    });
  }
}
