import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { hexToNumber } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processLogs(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    await writer.upsertLog({
      transactionHash: log.transactionHash,
      blockNumber: hexToNumber(log.blockNumber),
      address: log.address,
      topics: log.topics,
      data: log.data,
      logIndex: hexToNumber(log.logIndex),
      finalityStatus,
    });
  }
}
