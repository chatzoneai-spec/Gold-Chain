import type pg from "pg";
import {
  indexBlockNumbers,
  indexToHead,
  processBlock,
  type IndexerState,
} from "../../indexer/src/indexer.js";
import type { RpcClient } from "../../indexer/src/rpc/types.js";
import type { WebSocketFeed } from "./ws.js";

export function feedIndexerOptions(feed: WebSocketFeed) {
  return { onIndexed: feed.broadcast };
}

export async function indexWithFeed(
  rpc: RpcClient,
  client: pg.PoolClient,
  state: IndexerState,
  feed: WebSocketFeed,
): Promise<number> {
  return indexToHead(rpc, client, state, feedIndexerOptions(feed));
}

export async function indexBlockNumbersWithFeed(
  rpc: RpcClient,
  client: pg.PoolClient,
  blockNumbers: number[],
  state: IndexerState,
  feed: WebSocketFeed,
): Promise<void> {
  return indexBlockNumbers(
    rpc,
    client,
    blockNumbers,
    state,
    feedIndexerOptions(feed),
  );
}

export async function processBlockWithFeed(
  rpc: RpcClient,
  client: pg.PoolClient,
  blockNumber: number,
  headNumber: number,
  state: IndexerState,
  feed: WebSocketFeed,
): Promise<boolean> {
  return processBlock(
    rpc,
    client,
    blockNumber,
    headNumber,
    state,
    feedIndexerOptions(feed),
  );
}
