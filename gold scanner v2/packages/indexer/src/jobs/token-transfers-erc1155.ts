import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic, abiDecodeUint256Array } from "../abi.js";
import {
  TRANSFER_BATCH_TOPIC,
  TRANSFER_SINGLE_TOPIC,
  ZERO_ADDRESS,
} from "../gold-topics.js";
import { hexToNumber, topicToAddress } from "../util.js";
import type { FinalityStatus } from "../finality.js";

type Erc1155Transfer = {
  blockNumber: number;
  transactionHash: string;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  tokenId: string;
  amount: string;
  logIndex: number;
};

function decodeTransferSingle(log: RpcLog): Erc1155Transfer {
  const [tokenId, amount] = abiDecodeStatic(log.data, 2);
  return {
    blockNumber: hexToNumber(log.blockNumber),
    transactionHash: log.transactionHash,
    contractAddress: log.address,
    fromAddress: topicToAddress(log.topics[2]!),
    toAddress: topicToAddress(log.topics[3]!),
    tokenId: tokenId.toString(),
    amount: amount.toString(),
    logIndex: hexToNumber(log.logIndex),
  };
}

function decodeTransferBatch(log: RpcLog): Erc1155Transfer[] {
  const ids = abiDecodeUint256Array(log.data, 0);
  const values = abiDecodeUint256Array(log.data, 1);
  if (ids.length !== values.length) {
    throw new Error("TransferBatch ids/values length mismatch");
  }

  const blockNumber = hexToNumber(log.blockNumber);
  const logIndex = hexToNumber(log.logIndex);
  const fromAddress = topicToAddress(log.topics[2]!);
  const toAddress = topicToAddress(log.topics[3]!);

  return ids.map((id, index) => ({
    blockNumber,
    transactionHash: log.transactionHash,
    contractAddress: log.address,
    fromAddress,
    toAddress,
    tokenId: id.toString(),
    amount: values[index]!.toString(),
    logIndex,
  }));
}

async function writeTransfer(
  writer: IndexerWriter,
  transfer: Erc1155Transfer,
  finalityStatus: FinalityStatus,
): Promise<void> {
  await writer.upsertTokenTransfer({
    blockNumber: transfer.blockNumber,
    transactionHash: transfer.transactionHash,
    contractAddress: transfer.contractAddress,
    fromAddress: transfer.fromAddress,
    toAddress: transfer.toAddress,
    tokenStandard: "erc1155",
    tokenId: transfer.tokenId,
    amount: transfer.amount,
    logIndex: transfer.logIndex,
    finalityStatus,
  });
}

export async function processTokenTransfersErc1155(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  const contracts = new Set<string>();

  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 === TRANSFER_SINGLE_TOPIC) {
      const transfer = decodeTransferSingle(log);
      await writeTransfer(writer, transfer, finalityStatus);
      contracts.add(transfer.contractAddress);
      continue;
    }

    if (topic0 === TRANSFER_BATCH_TOPIC) {
      const transfers = decodeTransferBatch(log);
      for (const transfer of transfers) {
        await writeTransfer(writer, transfer, finalityStatus);
        contracts.add(transfer.contractAddress);
      }
    }
  }

  for (const contractAddress of contracts) {
    await writer.refreshTokenBalancesForContract(contractAddress);
  }

  if (finalityStatus === "finalized") {
    await writer.refreshGoldSupply();
  }
}

export function isMintTransfer(transfer: Erc1155Transfer): boolean {
  return transfer.fromAddress.toLowerCase() === ZERO_ADDRESS;
}

export function isBurnTransfer(transfer: Erc1155Transfer): boolean {
  return transfer.toAddress.toLowerCase() === ZERO_ADDRESS;
}
