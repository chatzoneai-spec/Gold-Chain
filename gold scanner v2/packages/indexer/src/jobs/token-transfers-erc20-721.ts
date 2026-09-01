import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { hexToNumber, topicToAddress, weiHexToDecimalString } from "../util.js";
import type { FinalityStatus } from "../finality.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export async function processTokenTransfersErc20Erc721(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  const contracts = new Set<string>();

  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) {
      continue;
    }

    const blockNumber = hexToNumber(log.blockNumber);
    const logIndex = hexToNumber(log.logIndex);

    if (log.topics.length === 3) {
      const fromAddress = topicToAddress(log.topics[1]!);
      const toAddress = topicToAddress(log.topics[2]!);
      const amount = weiHexToDecimalString(log.data || "0x0");

      await writer.upsertTokenTransfer({
        blockNumber,
        transactionHash: log.transactionHash,
        contractAddress: log.address,
        fromAddress,
        toAddress,
        tokenStandard: "erc20",
        tokenId: null,
        amount,
        logIndex,
        finalityStatus,
      });
      contracts.add(log.address);
      continue;
    }

    if (log.topics.length === 4) {
      const fromAddress = topicToAddress(log.topics[1]!);
      const toAddress = topicToAddress(log.topics[2]!);
      const tokenId = hexToNumber(log.topics[3]!).toString();

      await writer.upsertTokenTransfer({
        blockNumber,
        transactionHash: log.transactionHash,
        contractAddress: log.address,
        fromAddress,
        toAddress,
        tokenStandard: "erc721",
        tokenId,
        amount: "1",
        logIndex,
        finalityStatus,
      });
      contracts.add(log.address);
    }
  }

  for (const contractAddress of contracts) {
    await writer.refreshTokenBalancesForContract(contractAddress);
  }
}
