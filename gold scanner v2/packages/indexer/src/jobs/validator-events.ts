import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  COMMISSION_RATE_EDITED_TOPIC,
  GOLD_VALIDATOR_EVENT_TOPICS,
  STAKE_CREDIT_INITIALIZED_TOPIC,
  TOKEN_B1155_SLASHED_TOPIC,
  topicMatches,
  VALIDATOR_CREATED_TOPIC,
  VALIDATOR_JAILED_TOPIC,
  VALIDATOR_SLASHED_TOPIC,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processValidatorEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  const commissionByTx = new Map<string, number>();

  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() === COMMISSION_RATE_EDITED_TOPIC) {
      const [commissionRate] = abiDecodeStatic(log.data, 1);
      commissionByTx.set(log.transactionHash, Number(commissionRate));
    }
  }

  for (const log of logs) {
    if (!topicMatches(log.topics[0], GOLD_VALIDATOR_EVENT_TOPICS)) {
      continue;
    }

    const topic0 = log.topics[0]!.toLowerCase();
    const blockNumber = hexToNumber(log.blockNumber);

    if (topic0 === VALIDATOR_CREATED_TOPIC) {
      const operatorAddress = topicToAddress(log.topics[2]!);
      const commissionBps =
        commissionByTx.get(log.transactionHash) ?? 0;
      await writer.insertValidatorEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "created",
        validatorAddress: operatorAddress,
        amount: null,
        commissionBps,
        jailed: false,
        elected: false,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === STAKE_CREDIT_INITIALIZED_TOPIC) {
      const operatorAddress = topicToAddress(log.topics[1]!);
      await writer.insertValidatorEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "elected",
        validatorAddress: operatorAddress,
        amount: null,
        commissionBps: 0,
        jailed: false,
        elected: true,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === VALIDATOR_JAILED_TOPIC) {
      const operatorAddress = topicToAddress(log.topics[1]!);
      await writer.insertValidatorEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "jailed",
        validatorAddress: operatorAddress,
        amount: null,
        commissionBps: 0,
        jailed: true,
        elected: false,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === VALIDATOR_SLASHED_TOPIC) {
      const operatorAddress = topicToAddress(log.topics[1]!);
      const [, slashAmount] = abiDecodeStatic(log.data, 2);
      await writer.insertValidatorEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "slashed",
        validatorAddress: operatorAddress,
        amount: slashAmount === 0n ? null : slashAmount.toString(),
        commissionBps: 0,
        jailed: false,
        elected: false,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === TOKEN_B1155_SLASHED_TOPIC) {
      const operatorAddress = topicToAddress(log.topics[1]!);
      const tokenId = BigInt(log.topics[2]!);
      const [tokenBAmount] = abiDecodeStatic(log.data, 1);
      await writer.insertValidatorEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "slashed",
        validatorAddress: operatorAddress,
        amount: tokenBAmount.toString(),
        commissionBps: 0,
        jailed: false,
        elected: false,
        finalityStatus,
      });
      void tokenId;
    }
  }
}
