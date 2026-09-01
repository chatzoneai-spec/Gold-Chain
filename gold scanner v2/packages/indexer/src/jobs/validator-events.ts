import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  GOLD_VALIDATOR_EVENT_TOPIC,
  validatorEventTypeFromCode,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processValidatorEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_VALIDATOR_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, amount, commissionBps, jailedWord, electedWord] =
      abiDecodeStatic(log.data, 5);
    const eventType = validatorEventTypeFromCode(Number(eventTypeCode));

    await writer.insertValidatorEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      validatorAddress: topicToAddress(log.topics[1]!),
      amount: amount === 0n ? null : amount.toString(),
      commissionBps: Number(commissionBps),
      jailed: jailedWord !== 0n,
      elected: electedWord !== 0n,
      finalityStatus,
    });
  }
}
