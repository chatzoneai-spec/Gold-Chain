import type { IndexerWriter } from "../writer.js";
import type { RpcReceipt } from "../rpc/types.js";

export async function processContractDetection(
  writer: IndexerWriter,
  receipt: RpcReceipt,
): Promise<void> {
  if (receipt.contractAddress) {
    await writer.upsertContract(receipt.contractAddress);
  }

  for (const log of receipt.logs) {
    await writer.upsertContract(log.address);
  }
}
