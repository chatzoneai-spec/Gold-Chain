import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pg from "pg";
import { createIndexerState, indexToHead } from "../../indexer/src/indexer.js";
import { FixtureRpcClient } from "../../indexer/src/rpc/fixture-client.js";
import { createApp } from "../../api/src/http.js";
import { computeSolvency } from "../../api/src/gold/solvency.js";
import {
  DATABASE_URL,
  migrate,
  resetDatabase,
} from "../../api/src/test/db.js";
import { SolvencyHero } from "./components/SolvencyHero.js";
import type { SolvencyResult } from "./lib/types.js";

const CONFIRMATION_DEPTH = "2";

async function indexWave3(client: pg.PoolClient): Promise<void> {
  const rpc = new FixtureRpcClient("wave3.json");
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

describe("fixture pipeline e2e", () => {
  after(async () => {
    await resetDatabase();
  });

  it("recorded RPC → indexer → Postgres → API → SolvencyHero render", async () => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = CONFIRMATION_DEPTH;
    await resetDatabase();
    migrate("up");

    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      await indexWave3(client);
      const expected = await computeSolvency(client);

      const app = createApp({ pool });
      await new Promise<void>((resolve) => {
        app.server.listen(0, "127.0.0.1", () => resolve());
      });
      const address = app.server.address();
      assert.ok(address && typeof address === "object");
      const port = address.port;

      const response = await fetch(`http://127.0.0.1:${port}/gold/solvency`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as SolvencyResult;

      assert.deepEqual(body.paxg, expected.paxg);
      assert.deepEqual(body.xaut, expected.xaut);

      const html = renderToStaticMarkup(<SolvencyHero data={body} />);
      assert.match(html, /solvency-hero/);
      assert.match(html, /solvency-asset-1/);
      assert.match(html, /solvency-asset-2/);
      assert.match(html, new RegExp(expected.paxg.lockedOnEthereum));
      assert.match(html, new RegExp(expected.paxg.goldSupply));
      assert.match(html, new RegExp(expected.xaut.goldSupply));

      await new Promise<void>((resolve, reject) => {
        app.server.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      client.release();
      await pool.end();
    }
  });
});
