import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, indexToHead } from "./indexer.js";
import { FixtureRpcClient } from "./rpc/fixture-client.js";
import { XAUT_SCALE } from "./gold-topics.js";
import { migrate, resetDatabase, DATABASE_URL } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";
const GOLD = "0x000000000000000000000000000000000000f001";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";

const CORR = {
  paxg: "0xc000000000000000000000000000000000000000000000000000000000000001",
  xaut: "0xc000000000000000000000000000000000000000000000000000000000000002",
  xautBad: "0xc000000000000000000000000000000000000000000000000000000000000003",
  redeem: "0xc000000000000000000000000000000000000000000000000000000000000004",
  pending: "0xc000000000000000000000000000000000000000000000000000000000000005",
};

async function withPoolClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function indexWave3(client: pg.PoolClient): Promise<void> {
  const rpc = new FixtureRpcClient("wave3.json");
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

describe("wave3 gold indexing", () => {
  before(async () => {
    await resetDatabase();
    migrate("up");
  });

  after(async () => {
    await resetDatabase();
  });

  beforeEach(() => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = CONFIRMATION_DEPTH;
  });

  afterEach(async () => {
    await resetDatabase();
    migrate("up");
  });

  it("ERC1155 per-ID balances exact for GOLD id 1 and id 2 (never summed)", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows } = await client.query(
        `SELECT token_id, balance
         FROM token_balances
         WHERE contract_address = $1 AND address = $2
         ORDER BY token_id`,
        [GOLD, USER_A],
      );

      assert.deepEqual(rows, [
        { token_id: "1", balance: "1540" },
        { token_id: "2", balance: "-13" },
      ]);

      const { rows: bRows } = await client.query(
        `SELECT token_id, balance
         FROM token_balances
         WHERE contract_address = $1 AND address = $2
         ORDER BY token_id`,
        [GOLD, USER_B],
      );
      assert.deepEqual(bRows, [
        { token_id: "1", balance: "110" },
        { token_id: "2", balance: "20" },
      ]);

      const { rows: summed } = await client.query(
        `SELECT SUM(balance::numeric) AS total
         FROM token_balances
         WHERE contract_address = $1`,
        [GOLD],
      );
      const { rows: perId } = await client.query(
        `SELECT token_id, balance
         FROM token_balances
         WHERE contract_address = $1
         ORDER BY token_id, address`,
        [GOLD],
      );
      assert.notEqual(perId.length, 0);
      assert.ok(perId.some((row) => row.token_id === "1"));
      assert.ok(perId.some((row) => row.token_id === "2"));
      assert.ok(summed[0]?.total !== perId[0]?.balance);
    });
  });

  it("XAUT scaling exact to the 1e12 unit when amount_exact=true", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows } = await client.query(
        `SELECT root_amount, child_amount, amount_exact
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'minted_or_credited'
           AND finality_status = 'finalized'`,
        [CORR.xaut],
      );

      assert.equal(rows.length, 1);
      const row = rows[0]!;
      assert.equal(row.amount_exact, true);
      assert.equal(
        BigInt(row.root_amount),
        BigInt(row.child_amount) * XAUT_SCALE,
      );
    });
  });

  it("non-finalized deposit is NOT counted as minted inventory in gold_supply", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows: supply } = await client.query(
        `SELECT token_id, supply FROM gold_supply ORDER BY token_id`,
      );
      assert.deepEqual(supply, [
        { token_id: "1", supply: "1150" },
        { token_id: "2", supply: "12" },
      ]);

      const { rows: pendingMinted } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'minted_or_credited'
           AND finality_status = 'finalized'`,
        [CORR.pending],
      );
      assert.equal(pendingMinted[0]?.count, 0);

      const { rows: pendingRow } = await client.query(
        `SELECT finality_status
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'minted_or_credited'`,
        [CORR.pending],
      );
      assert.equal(pendingRow.length, 1);
      assert.equal(pendingRow[0]?.finality_status, "pending");
    });
  });

  it("redeemed burn produces receipt-linked pair on same correlation id with correct route_asset", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows } = await client.query(
        `SELECT bridge_state, route_asset, receipt_correlation_id, finality_status
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
         ORDER BY bridge_state`,
        [CORR.redeem],
      );

      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.bridge_state, "burned_or_debited");
      assert.equal(rows[0]?.route_asset, "paxg");
      assert.equal(rows[1]?.bridge_state, "released");
      assert.equal(rows[1]?.route_asset, "paxg");
      assert.equal(rows[0]?.receipt_correlation_id, CORR.redeem);
      assert.equal(rows[1]?.receipt_correlation_id, CORR.redeem);
      assert.equal(rows[0]?.finality_status, "finalized");
      assert.equal(rows[1]?.finality_status, "finalized");
    });
  });

  it("non-exact XAUT amount is flagged amount_exact=false and never rounded", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows } = await client.query(
        `SELECT root_amount, child_amount, amount_exact
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1`,
        [CORR.xautBad],
      );

      assert.equal(rows.length, 1);
      const row = rows[0]!;
      assert.equal(row.amount_exact, false);
      assert.equal(row.root_amount, "12000000000001");
      assert.equal(row.child_amount, "12");
      assert.notEqual(
        BigInt(row.root_amount),
        BigInt(row.child_amount) * XAUT_SCALE,
      );
    });
  });

  it("duplicate wave3 replay is idempotent for gold tables", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);
      await indexWave3(client);

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM bridge_transfers`,
      );
      assert.equal(rows[0]?.count, 8);
    });
  });

  it("indexes staking validator governance and checkpoint event rows", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const { rows: staking } = await client.query(
        `SELECT COUNT(*)::int AS count FROM staking_events`,
      );
      const { rows: validator } = await client.query(
        `SELECT COUNT(*)::int AS count FROM validator_events`,
      );
      const { rows: governance } = await client.query(
        `SELECT COUNT(*)::int AS count FROM governance_events`,
      );
      const { rows: checkpoints } = await client.query(
        `SELECT COUNT(*)::int AS count FROM checkpoints`,
      );

      assert.equal(staking[0]?.count, 1);
      assert.equal(validator[0]?.count, 1);
      assert.equal(governance[0]?.count, 1);
      assert.equal(checkpoints[0]?.count, 1);
    });
  });
});
