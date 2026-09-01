import type pg from "pg";
import { finalityStatusForBlock } from "./finality.js";
import type { RpcClient } from "./rpc/types.js";
import { MissingRangeTracker } from "./backfill.js";
import { runBlockJobs } from "./jobs/fan-out.js";
import {
  blockTimestampToDate,
  hexToBigInt,
  hexToNumber,
  weiHexToDecimalString,
} from "./util.js";
import { IndexerWriter } from "./writer.js";

export type IndexerState = {
  tracker: MissingRangeTracker;
  lastIndexedHead: number;
};

export function createIndexerState(): IndexerState {
  return {
    tracker: new MissingRangeTracker(),
    lastIndexedHead: 0,
  };
}

export async function processBlock(
  rpc: RpcClient,
  client: pg.PoolClient,
  blockNumber: number,
  headNumber: number,
  state: IndexerState,
): Promise<boolean> {
  const block = await rpc.getBlockByNumber(blockNumber);
  if (!block) {
    return false;
  }

  const writer = new IndexerWriter(client);

  if (blockNumber > 1) {
    const parentNumber = blockNumber - 1;
    const storedParentHash = await writer.getBlockHashAtNumber(parentNumber);
    if (storedParentHash && storedParentHash !== block.parentHash) {
      await writer.markBlockRevertedFromNumber(blockNumber);
      await writer.clearDerivedRowsForBlock(blockNumber);
    }
  }

  const storedHash = await writer.getBlockHashAtNumber(blockNumber);
  if (storedHash && storedHash !== block.hash) {
    await writer.markBlockRevertedByNumber(blockNumber);
    await writer.clearDerivedRowsForBlock(blockNumber);
  }

  const finalityStatus = finalityStatusForBlock({ blockNumber, headNumber });

  await writer.upsertBlock({
    number: blockNumber,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: blockTimestampToDate(block.timestamp),
    validatorAddress: block.miner,
    gasUsed: hexToBigInt(block.gasUsed),
    gasLimit: hexToBigInt(block.gasLimit),
    finalityStatus,
  });

  await writer.clearDerivedRowsForBlock(blockNumber);

  const activeTxHashes: string[] = [];
  for (const tx of block.transactions) {
    activeTxHashes.push(tx.hash);
    const receipt = await rpc.getTransactionReceipt(tx.hash);
    const status = receipt ? hexToNumber(receipt.status) : 0;

    await writer.upsertTransaction({
      hash: tx.hash,
      blockNumber,
      fromAddress: tx.from,
      toAddress: tx.to,
      value: weiHexToDecimalString(tx.value),
      gas: hexToBigInt(tx.gas),
      gasPrice: tx.gasPrice ? weiHexToDecimalString(tx.gasPrice) : null,
      maxFeePerGas: tx.maxFeePerGas
        ? weiHexToDecimalString(tx.maxFeePerGas)
        : null,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
        ? weiHexToDecimalString(tx.maxPriorityFeePerGas)
        : null,
      input: tx.input,
      nonce: hexToBigInt(tx.nonce),
      transactionIndex: hexToNumber(tx.transactionIndex),
      status,
      finalityStatus,
    });
  }

  await writer.markOrphanedTransactionsReverted(blockNumber, activeTxHashes);

  await runBlockJobs(rpc, writer, block, headNumber);
  state.tracker.markIndexed(blockNumber);
  state.lastIndexedHead = Math.max(state.lastIndexedHead, blockNumber);

  return true;
}

export async function indexToHead(
  rpc: RpcClient,
  client: pg.PoolClient,
  state: IndexerState,
): Promise<number> {
  const head = await rpc.getBlockNumber();
  const writer = new IndexerWriter(client);

  const missingRanges = state.tracker.getMissingRanges(head);
  for (const range of missingRanges) {
    for (let blockNumber = range.from; blockNumber <= range.to; blockNumber += 1) {
      await processBlock(rpc, client, blockNumber, head, state);
    }
  }

  let reorgFrom: number | null = null;
  const verifyUpTo = Math.min(state.lastIndexedHead, head);
  for (let blockNumber = 1; blockNumber <= verifyUpTo; blockNumber += 1) {
    const rpcBlock = await rpc.getBlockByNumber(blockNumber);
    if (!rpcBlock) {
      continue;
    }
    const storedHash = await writer.getBlockHashAtNumber(blockNumber);
    if (storedHash && storedHash !== rpcBlock.hash) {
      reorgFrom = blockNumber;
      break;
    }
  }

  if (reorgFrom !== null) {
    for (let blockNumber = reorgFrom; blockNumber <= head; blockNumber += 1) {
      await processBlock(rpc, client, blockNumber, head, state);
    }
  } else {
    for (
      let blockNumber = state.lastIndexedHead + 1;
      blockNumber <= head;
      blockNumber += 1
    ) {
      await processBlock(rpc, client, blockNumber, head, state);
    }
  }

  if (state.lastIndexedHead > 0) {
    await writer.updateFinalityForRange(1, head, head);
  }

  return head;
}

export async function indexBlockNumbers(
  rpc: RpcClient,
  client: pg.PoolClient,
  blockNumbers: number[],
  state: IndexerState,
): Promise<void> {
  const head = await rpc.getBlockNumber();

  for (const blockNumber of blockNumbers) {
    await processBlock(rpc, client, blockNumber, head, state);
  }

  const writer = new IndexerWriter(client);
  const maxBlock = Math.max(...blockNumbers, head);
  await writer.updateFinalityForRange(1, maxBlock, head);
}
