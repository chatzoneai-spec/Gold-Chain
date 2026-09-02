import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState } from "../../indexer/src/indexer.js";
import { FixtureRpcClient } from "../../indexer/src/rpc/fixture-client.js";
import { processBlockWithFeed } from "./index-with-feed.js";
import { createWebSocketFeed, type LiveFeedEvent } from "./ws.js";
import { DATABASE_URL, migrate, resetDatabase } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";

describe("indexer feed wiring via WebSocket feed", () => {
  before(async () => {
    await resetDatabase();
    migrate("up");
  });

  after(async () => {
    await resetDatabase();
    migrate("up");
  });

  beforeEach(() => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = CONFIRMATION_DEPTH;
  });

  afterEach(async () => {
    await resetDatabase();
    migrate("up");
  });

  it("processBlockWithFeed broadcasts block and tx events through feed.broadcast", async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      const rpc = new FixtureRpcClient("wave3.json");
      const state = createIndexerState();
      const feed = createWebSocketFeed();
      const broadcasts: LiveFeedEvent[] = [];
      feed.emitter.on("broadcast", (event: LiveFeedEvent) => {
        broadcasts.push(event);
      });

      await processBlockWithFeed(rpc, client, 1, 8, state, feed);

      assert.ok(broadcasts.some((event) => event.type === "block"));
      assert.ok(broadcasts.some((event) => event.type === "tx"));
      assert.equal(broadcasts.length, 2);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
