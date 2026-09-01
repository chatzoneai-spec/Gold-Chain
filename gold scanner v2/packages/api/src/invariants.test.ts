import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { XAUT_SCALE } from "../../indexer/src/gold-topics.js";
import { createIndexerState, indexToHead } from "../../indexer/src/indexer.js";
import { FixtureRpcClient } from "../../indexer/src/rpc/fixture-client.js";
import { computeSolvency } from "./gold/solvency.js";
import {
  migrate,
  resetDatabase,
  withPoolClient,
} from "./test/db.js";

const CONFIRMATION_DEPTH = "2";

const CORR = {
  pending: "0xc000000000000000000000000000000000000000000000000000000000000005",
};

async function indexWave3(client: pg.PoolClient): Promise<void> {
  const rpc = new FixtureRpcClient("wave3.json");
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

async function clearIndexedData(client: pg.PoolClient): Promise<void> {
  await client.query(
    `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
            checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
            logs, receipts, transactions, token_contracts, contracts, addresses, blocks
     RESTART IDENTITY CASCADE`,
  );
}

describe("solvency invariants", () => {
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
    await withPoolClient(clearIndexedData);
  });

  it("computeSolvency ignores pending deposits and reverted locks", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const solvency = await computeSolvency(client);

      assert.equal(solvency.paxg.lockedOnEthereum, solvency.paxg.goldSupply);
      assert.equal(
        BigInt(solvency.xaut.lockedOnEthereum),
        BigInt(solvency.xaut.goldSupply) * XAUT_SCALE,
      );

      const { rows: pendingLocked } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'locked'
           AND finality_status = 'finalized'`,
        [CORR.pending],
      );
      assert.equal(pendingLocked[0]?.count, 0);

      const { rows: pendingMinted } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'minted_or_credited'
           AND finality_status = 'finalized'`,
        [CORR.pending],
      );
      assert.equal(pendingMinted[0]?.count, 0);
    });
  });

  it("GOLD ID 1 supply matches locked PAXG and ID 2 matches locked XAUT", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const solvency = await computeSolvency(client);

      assert.equal(solvency.paxg.goldTokenId, "1");
      assert.equal(solvency.xaut.goldTokenId, "2");
      assert.equal(solvency.paxg.routeAsset, "paxg");
      assert.equal(solvency.xaut.routeAsset, "xaut");
      assert.equal(solvency.paxg.lockedOnEthereum, solvency.paxg.goldSupply);
      assert.equal(
        BigInt(solvency.xaut.lockedOnEthereum),
        BigInt(solvency.xaut.goldSupply) * XAUT_SCALE,
      );
      assert.equal(solvency.paxg.lockedOnEthereum, "1150");
      assert.equal(solvency.paxg.goldSupply, "1150");
      assert.equal(solvency.xaut.lockedOnEthereum, "12000000000000");
      assert.equal(solvency.xaut.goldSupply, "12");
      assert.notEqual(solvency.paxg.goldSupply, solvency.xaut.goldSupply);
    });
  });
});
