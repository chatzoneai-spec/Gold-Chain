import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  GOLD_STAKING_EVENT_TOPIC,
  stakeAssetFromCode,
  stakingEventTypeFromCode,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processStakingEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_STAKING_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, amount, assetCode] = abiDecodeStatic(log.data, 3);
    const eventType = stakingEventTypeFromCode(Number(eventTypeCode));
    const stakeAsset = stakeAssetFromCode(Number(assetCode));
    const validatorAddress = log.topics[2]
      ? topicToAddress(log.topics[2])
      : null;

    await writer.insertStakingEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      stakerAddress: topicToAddress(log.topics[1]!),
      amount: amount.toString(),
      stakeAsset,
      validatorAddress,
      finalityStatus,
    });
  }
}
