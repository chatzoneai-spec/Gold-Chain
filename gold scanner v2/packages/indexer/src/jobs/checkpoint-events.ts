import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  COMMITMENT_PLANTED_TOPIC,
  COMMITMENT_UPDATED_TOPIC,
  GOLD_CHECKPOINT_EVENT_TOPICS,
  NEW_HEADER_BLOCK_TOPIC,
  topicMatches,
} from "../gold-topics.js";
import { hexToNumber } from "../util.js";
import type { FinalityStatus } from "../finality.js";

const HALTED_POWER_SENTINEL = 0n;

function decodeNewHeaderBlock(
  log: RpcLog,
  finalityStatus: FinalityStatus,
) {
  const headerBlockId = BigInt(log.topics[2]!);
  const [, , rootWord] = abiDecodeStatic(log.data, 3);

  return {
    blockNumber: hexToNumber(log.blockNumber),
    checkpointHash: `0x${rootWord.toString(16).padStart(64, "0")}`,
    validatorSetHash: `0x${headerBlockId.toString(16).padStart(64, "0")}`,
    chainStatus: "committed" as const,
    finalityStatus,
  };
}

function decodeCommitmentPlanted(
  log: RpcLog,
  finalityStatus: FinalityStatus,
) {
  const epoch = BigInt(log.topics[1]!);
  const [totalPower, validatorCount] = abiDecodeStatic(log.data, 2);

  return {
    blockNumber: hexToNumber(log.blockNumber),
    checkpointHash: `0x${epoch.toString(16).padStart(64, "0")}`,
    validatorSetHash: `0x${(totalPower ^ validatorCount).toString(16).padStart(64, "0")}`,
    chainStatus: "committed" as const,
    finalityStatus,
  };
}

function decodeCommitmentUpdated(
  log: RpcLog,
  finalityStatus: FinalityStatus,
) {
  const epoch = BigInt(log.topics[1]!);
  const [totalPower, validatorCount] = abiDecodeStatic(log.data, 2);
  const chainStatus =
    totalPower === HALTED_POWER_SENTINEL ? ("halted" as const) : ("committed" as const);

  return {
    blockNumber: hexToNumber(log.blockNumber),
    checkpointHash: `0x${epoch.toString(16).padStart(64, "0")}`,
    validatorSetHash: `0x${validatorCount.toString(16).padStart(64, "0")}`,
    chainStatus,
    finalityStatus,
  };
}

export async function processCheckpointEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (!topicMatches(log.topics[0], GOLD_CHECKPOINT_EVENT_TOPICS)) {
      continue;
    }

    const topic0 = log.topics[0]!.toLowerCase();
    let row;

    if (topic0 === NEW_HEADER_BLOCK_TOPIC) {
      row = decodeNewHeaderBlock(log, finalityStatus);
    } else if (topic0 === COMMITMENT_PLANTED_TOPIC) {
      row = decodeCommitmentPlanted(log, finalityStatus);
    } else if (topic0 === COMMITMENT_UPDATED_TOPIC) {
      row = decodeCommitmentUpdated(log, finalityStatus);
    } else {
      continue;
    }

    await writer.insertCheckpoint(row);
  }
}
