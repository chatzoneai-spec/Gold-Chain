import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, processBlock } from "./indexer.js";
import { FixtureRpcClient } from "./rpc/fixture-client.js";
import { migrate, resetDatabase, DATABASE_URL } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";

describe("indexer live feed wiring", () => {
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

  it("processBlock broadcasts block and tx events via onIndexed callback", async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      const rpc = new FixtureRpcClient("wave3.json");
      const state = createIndexerState();
      const events: Array<{ type: string }> = [];

      await processBlock(rpc, client, 1, 8, state, {
        onIndexed: (event) => {
          events.push(event);
        },
      });

      assert.ok(events.some((event) => event.type === "block"));
      assert.ok(events.some((event) => event.type === "tx"));
      assert.equal(events.length, 2);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
