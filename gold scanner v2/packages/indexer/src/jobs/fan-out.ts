import type { IndexerWriter } from "../writer.js";
import type { RpcClient, RpcBlock, RpcReceipt } from "../rpc/types.js";
import { finalityStatusForBlock } from "../finality.js";
import { JobQueue } from "../queue.js";
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

type TxJobPayload = {
  txHash: string;
  blockNumber: number;
  finalityStatus: ReturnType<typeof finalityStatusForBlock>;
};

export async function runBlockJobs(
  rpc: RpcClient,
  writer: IndexerWriter,
  block: RpcBlock,
  headNumber: number,
): Promise<void> {
  const blockNumber = Number.parseInt(block.number, 16);
  const finalityStatus = finalityStatusForBlock({ blockNumber, headNumber });

  for (const tx of block.transactions) {
    const queue = new JobQueue();
    const payload: TxJobPayload = {
      txHash: tx.hash,
      blockNumber,
      finalityStatus,
    };

    queue.enqueue({ type: "receipts", payload });
    queue.enqueue({ type: "contract-detection", payload });
    queue.enqueue({ type: "logs", payload });
    queue.enqueue({ type: "token-transfers-erc20-721", payload });
    queue.enqueue({ type: "token-transfers-erc1155", payload });
    queue.enqueue({ type: "bridge-events", payload });
    queue.enqueue({ type: "staking-events", payload });
    queue.enqueue({ type: "validator-events", payload });
    queue.enqueue({ type: "governance-events", payload });
    queue.enqueue({ type: "checkpoint-events", payload });
    queue.enqueue({ type: "internal-txs", payload });

    let receipt: RpcReceipt | null = null;

    await queue.drain(async (job) => {
      if (!receipt && job.type !== "receipts") {
        return;
      }

      switch (job.type) {
        case "receipts": {
          receipt = await processReceipts(rpc, writer, payload.txHash);
          break;
        }
        case "contract-detection":
          await processContractDetection(writer, receipt!);
          break;
        case "logs":
          await processLogs(writer, receipt!.logs, payload.finalityStatus);
          break;
        case "token-transfers-erc20-721":
          await processTokenTransfersErc20Erc721(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "token-transfers-erc1155":
          await processTokenTransfersErc1155(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "bridge-events":
          await processBridgeEvents(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "staking-events":
          await processStakingEvents(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "validator-events":
          await processValidatorEvents(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "governance-events":
          await processGovernanceEvents(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "checkpoint-events":
          await processCheckpointEvents(
            writer,
            receipt!.logs,
            payload.finalityStatus,
          );
          break;
        case "internal-txs":
          await processInternalTxs(
            rpc,
            writer,
            payload.txHash,
            payload.blockNumber,
            payload.finalityStatus,
          );
          break;
        default:
          throw new Error(`Unknown job type: ${(job as { type: string }).type}`);
      }
    });
  }
}
