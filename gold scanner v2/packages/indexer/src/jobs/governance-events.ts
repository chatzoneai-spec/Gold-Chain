import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  GOLD_GOVERNANCE_EVENT_TOPIC,
  governanceEventTypeFromCode,
  governanceSupportFromCode,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

export async function processGovernanceEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_GOVERNANCE_EVENT_TOPIC) {
      continue;
    }

    const [eventTypeCode, proposalWord, supportCode, timelockEtaUnix] =
      abiDecodeStatic(log.data, 4);
    const eventType = governanceEventTypeFromCode(Number(eventTypeCode));
    const proposalId = `0x${proposalWord.toString(16).padStart(64, "0")}`;
    const support = governanceSupportFromCode(supportCode);

    let proposerAddress: string | null = null;
    let voterAddress: string | null = null;
    if (log.topics[1]) {
      const topicAddress = topicToAddress(log.topics[1]);
      if (eventType === "proposal_created") {
        proposerAddress = topicAddress;
      } else if (eventType === "vote") {
        voterAddress = topicAddress;
      }
    }

    let timelockEta: Date | null = null;
    if (eventType === "queued" && timelockEtaUnix !== 0n) {
      timelockEta = new Date(Number(timelockEtaUnix) * 1000);
    }

    await writer.insertGovernanceEvent({
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
      eventType,
      proposerAddress,
      voterAddress,
      proposalId,
      support,
      timelockEta,
      finalityStatus,
    });
  }
}
