import type { IndexerWriter } from "../writer.js";
import type { RpcClient, RpcReceipt } from "../rpc/types.js";
import { hexToBigInt, hexToNumber } from "../util.js";

export async function processReceipts(
  rpc: RpcClient,
  writer: IndexerWriter,
  txHash: string,
): Promise<RpcReceipt | null> {
  const receipt = await rpc.getTransactionReceipt(txHash);
  if (!receipt) {
    return null;
  }

  await writer.upsertReceipt({
    transactionHash: receipt.transactionHash,
    cumulativeGasUsed: hexToBigInt(receipt.cumulativeGasUsed),
    gasUsed: hexToBigInt(receipt.gasUsed),
    contractAddress: receipt.contractAddress,
    status: hexToNumber(receipt.status),
    logsBloom: receipt.logsBloom,
  });

  return receipt;
}
