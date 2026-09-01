import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import { GOLD_GOVERNANCE_EVENT_TOPIC } from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

const GOVERNANCE_EVENT_TYPES = ["proposal_created"] as const;

export async function processGovernanceEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_GOVERNANCE_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, proposalWord] = abiDecodeStatic(log.data, 2);
    const eventType = GOVERNANCE_EVENT_TYPES[Number(eventTypeCode)] ?? "unknown";
    const proposalId = `0x${proposalWord.toString(16).padStart(64, "0")}`;

    await writer.insertGovernanceEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      proposerAddress: topicToAddress(log.topics[1]!),
      proposalId,
      finalityStatus,
    });
  }
}
