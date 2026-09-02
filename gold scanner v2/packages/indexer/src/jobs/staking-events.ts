import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  DELEGATED_TOPIC,
  GOLD_STAKING_EVENT_TOPICS,
  stakeAssetFromTokenId,
  TOKEN_B1155_DELEGATED_TOPIC,
  TOKEN_B1155_UNDELEGATED_TOPIC,
  topicMatches,
  UNDELEGATED_TOPIC,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processStakingEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (!topicMatches(log.topics[0], GOLD_STAKING_EVENT_TOPICS)) {
      continue;
    }

    const topic0 = log.topics[0]!.toLowerCase();
    const operatorAddress = topicToAddress(log.topics[1]!);
    const delegator = topicToAddress(log.topics[2]!);

    if (topic0 === TOKEN_B1155_DELEGATED_TOPIC) {
      const tokenId = BigInt(log.topics[3]!);
      const [tokenBAmount] = abiDecodeStatic(log.data, 1);
      await writer.insertStakingEvent({
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        eventType: "stake",
        stakerAddress: delegator,
        amount: tokenBAmount.toString(),
        stakeAsset: stakeAssetFromTokenId(tokenId),
        validatorAddress: operatorAddress,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === TOKEN_B1155_UNDELEGATED_TOPIC) {
      const tokenId = BigInt(log.topics[3]!);
      const [tokenBAmount] = abiDecodeStatic(log.data, 1);
      await writer.insertStakingEvent({
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        eventType: "unstake",
        stakerAddress: delegator,
        amount: tokenBAmount.toString(),
        stakeAsset: stakeAssetFromTokenId(tokenId),
        validatorAddress: operatorAddress,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === DELEGATED_TOPIC) {
      const [, giltAmount] = abiDecodeStatic(log.data, 2);
      await writer.insertStakingEvent({
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        eventType: "stake",
        stakerAddress: delegator,
        amount: giltAmount.toString(),
        stakeAsset: "gilt",
        validatorAddress: operatorAddress,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === UNDELEGATED_TOPIC) {
      const [, giltAmount] = abiDecodeStatic(log.data, 2);
      await writer.insertStakingEvent({
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        eventType: "unbond",
        stakerAddress: delegator,
        amount: giltAmount.toString(),
        stakeAsset: "gilt",
        validatorAddress: operatorAddress,
        finalityStatus,
      });
    }
  }
}
