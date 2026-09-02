import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  GOLD_GOVERNANCE_EVENT_TOPICS,
  governanceSupportFromCode,
  PROPOSAL_CREATED_TOPIC,
  PROPOSAL_EXECUTED_TOPIC,
  PROPOSAL_QUEUED_TOPIC,
  topicMatches,
  VOTE_CAST_TOPIC,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

function proposalIdFromWord(word: bigint): string {
  return `0x${word.toString(16).padStart(64, "0")}`;
}

export async function processGovernanceEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (!topicMatches(log.topics[0], GOLD_GOVERNANCE_EVENT_TOPICS)) {
      continue;
    }

    const topic0 = log.topics[0]!.toLowerCase();
    const blockNumber = hexToNumber(log.blockNumber);

    if (topic0 === PROPOSAL_CREATED_TOPIC) {
      const [proposalIdWord, proposerWord] = abiDecodeStatic(log.data, 2);
      const proposerAddress = topicToAddress(
        `0x${proposerWord.toString(16).padStart(64, "0")}`,
      );
      await writer.insertGovernanceEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "proposal_created",
        proposerAddress,
        voterAddress: null,
        proposalId: proposalIdFromWord(proposalIdWord),
        support: null,
        timelockEta: null,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === VOTE_CAST_TOPIC) {
      const voterAddress = topicToAddress(log.topics[1]!);
      const [proposalIdWord, supportCode] = abiDecodeStatic(log.data, 2);
      await writer.insertGovernanceEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "vote",
        proposerAddress: null,
        voterAddress,
        proposalId: proposalIdFromWord(proposalIdWord),
        support: governanceSupportFromCode(supportCode),
        timelockEta: null,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === PROPOSAL_QUEUED_TOPIC) {
      const [proposalIdWord, timelockEtaUnix] = abiDecodeStatic(log.data, 2);
      const timelockEta =
        timelockEtaUnix === 0n
          ? null
          : new Date(Number(timelockEtaUnix) * 1000);
      await writer.insertGovernanceEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "queued",
        proposerAddress: null,
        voterAddress: null,
        proposalId: proposalIdFromWord(proposalIdWord),
        support: null,
        timelockEta,
        finalityStatus,
      });
      continue;
    }

    if (topic0 === PROPOSAL_EXECUTED_TOPIC) {
      const [proposalIdWord] = abiDecodeStatic(log.data, 1);
      await writer.insertGovernanceEvent({
        blockNumber,
        transactionHash: log.transactionHash,
        eventType: "executed",
        proposerAddress: null,
        voterAddress: null,
        proposalId: proposalIdFromWord(proposalIdWord),
        support: null,
        timelockEta: null,
        finalityStatus,
      });
    }
  }
}
