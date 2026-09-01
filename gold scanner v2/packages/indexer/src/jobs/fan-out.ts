import type { IndexerWriter } from "../writer.js";
import type { RpcClient, RpcBlock } from "../rpc/types.js";
import { finalityStatusForBlock } from "../finality.js";
import { processReceipts } from "./receipts.js";
import { processLogs } from "./logs.js";
import { processInternalTxs } from "./internal-txs.js";
import { processContractDetection } from "./contract-detection.js";
import { processTokenTransfersErc20Erc721 } from "./token-transfers-erc20-721.js";
import { processTokenTransfersErc1155 } from "./token-transfers-erc1155.js";
import { processBridgeEvents } from "./bridge-events.js";
import { processStakingEvents } from "./staking-events.js";
import { processValidatorEvents } from "./validator-events.js";
import { processGovernanceEvents } from "./governance-events.js";
import { processCheckpointEvents } from "./checkpoint-events.js";

export async function runBlockJobs(
  rpc: RpcClient,
  writer: IndexerWriter,
  block: RpcBlock,
  headNumber: number,
): Promise<void> {
  const blockNumber = Number.parseInt(block.number, 16);
  const finalityStatus = finalityStatusForBlock({ blockNumber, headNumber });

  for (const tx of block.transactions) {
    const receipt = await processReceipts(rpc, writer, tx.hash);
    if (!receipt) {
      continue;
    }

    await processContractDetection(writer, receipt);
    await processLogs(writer, receipt.logs, finalityStatus);
    await processTokenTransfersErc20Erc721(writer, receipt.logs, finalityStatus);
    await processTokenTransfersErc1155(writer, receipt.logs, finalityStatus);
    await processBridgeEvents(writer, receipt.logs, finalityStatus);
    await processStakingEvents(writer, receipt.logs, finalityStatus);
    await processValidatorEvents(writer, receipt.logs, finalityStatus);
    await processGovernanceEvents(writer, receipt.logs, finalityStatus);
    await processCheckpointEvents(writer, receipt.logs, finalityStatus);
    await processInternalTxs(rpc, writer, tx.hash, blockNumber, finalityStatus);
  }
}
