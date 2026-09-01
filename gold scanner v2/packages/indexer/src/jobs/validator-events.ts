import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import { GOLD_VALIDATOR_EVENT_TOPIC } from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

const VALIDATOR_EVENT_TYPES = ["created", "slashed"] as const;

export async function processValidatorEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_VALIDATOR_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, amount] = abiDecodeStatic(log.data, 2);
    const eventType = VALIDATOR_EVENT_TYPES[Number(eventTypeCode)] ?? "unknown";

    await writer.insertValidatorEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      validatorAddress: topicToAddress(log.topics[1]!),
      amount: amount === 0n ? null : amount.toString(),
      finalityStatus,
    });
  }
}
