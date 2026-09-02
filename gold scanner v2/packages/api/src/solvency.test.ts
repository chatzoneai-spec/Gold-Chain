import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { computeSolvency } from "./gold/solvency.js";
import { migrate, DATABASE_URL } from "./test/db.js";

describe("solvency netting", () => {
  before(async () => {
    migrate("up");
  });

  after(async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query(`TRUNCATE bridge_transfers, gold_supply RESTART IDENTITY CASCADE`);
    } finally {
      client.release();
      await pool.end();
    }
  });

  afterEach(async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query(`TRUNCATE bridge_transfers, gold_supply RESTART IDENTITY CASCADE`);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("lockedOnEthereum is locked_sum minus released_sum for the same route asset", async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO bridge_transfers (
           route_asset, root_amount, child_amount, bridge_state, finality_status,
           root_tx_hash, child_tx_hash, direction, source_layer,
           receipt_correlation_id, amount_exact
         ) VALUES
           ('paxg', '1000', '1000', 'locked', 'finalized', '0x1', NULL, 'deposit', 'ethereum', '0xabc', true),
           ('paxg', '250', '250', 'released', 'finalized', '0x2', NULL, 'exit', 'ethereum', '0xabc', true)`,
      );
      await client.query(
        `INSERT INTO gold_supply (token_id, supply) VALUES ('1', '1000')`,
      );

      const solvency = await computeSolvency(client);
      assert.equal(solvency.paxg.lockedOnEthereum, "750");
      assert.equal(solvency.paxg.goldSupply, "1000");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
