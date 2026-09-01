import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import { GOLD_STAKING_EVENT_TOPIC } from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

const STAKING_EVENT_TYPES = ["stake", "unstake"] as const;

export async function processStakingEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_STAKING_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, amount] = abiDecodeStatic(log.data, 2);
    const eventType = STAKING_EVENT_TYPES[Number(eventTypeCode)] ?? "unknown";

    await writer.insertStakingEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      stakerAddress: topicToAddress(log.topics[1]!),
      amount: amount.toString(),
      finalityStatus,
    });
  }
}
