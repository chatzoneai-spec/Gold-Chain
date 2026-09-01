import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, indexToHead } from "../../indexer/src/indexer.js";
import { FixtureRpcClient } from "../../indexer/src/rpc/fixture-client.js";
import {
  createGoldRouteRegistry,
  dispatchGoldGet,
  registerGoldRoutes,
} from "./gold/register.js";
import { computeSolvency } from "./gold/solvency.js";
import type { SolvencyResult } from "./gold/types.js";
import {
  DATABASE_URL,
  migrate,
  resetDatabase,
  withPoolClient,
} from "./test/db.js";

const CONFIRMATION_DEPTH = "2";

const CORR = {
  redeem: "0xc000000000000000000000000000000000000000000000000000000000000004",
  pending: "0xc000000000000000000000000000000000000000000000000000000000000005",
};

async function indexWave3(client: pg.PoolClient): Promise<void> {
  const rpc = new FixtureRpcClient("wave3.json");
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: DATABASE_URL });
}

async function clearIndexedData(client: pg.PoolClient): Promise<void> {
  await client.query(
    `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
            checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
            logs, receipts, transactions, token_contracts, contracts, addresses, blocks
     RESTART IDENTITY CASCADE`,
  );
}

describe("gold api", () => {
  let pool: pg.Pool;
  let registry: ReturnType<typeof createGoldRouteRegistry>;

  before(async () => {
    await resetDatabase();
    migrate("up");
    pool = createTestPool();
    registry = createGoldRouteRegistry();
    registerGoldRoutes(registry, pool);
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(() => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = CONFIRMATION_DEPTH;
  });

  afterEach(async () => {
    await withPoolClient(clearIndexedData);
  });

  it("solvency ignores pending and reverted rows; per-ID never collapsed", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const solvency = await computeSolvency(client);

      assert.equal(solvency.paxg.goldTokenId, "1");
      assert.equal(solvency.xaut.goldTokenId, "2");
      assert.equal(solvency.paxg.lockedOnEthereum, "1000");
      assert.equal(solvency.paxg.goldSupply, "1150");
      assert.equal(solvency.xaut.lockedOnEthereum, "4000000000001");
      assert.equal(solvency.xaut.goldSupply, "12");
      assert.notEqual(solvency.paxg.goldSupply, solvency.xaut.goldSupply);
      assert.ok(!("combinedTotalLabelled" in (solvency as SolvencyResult & Record<string, unknown>)));

      const { rows: pendingLocked } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM bridge_transfers
         WHERE receipt_correlation_id = $1
           AND bridge_state = 'locked'
           AND finality_status = 'finalized'`,
        [CORR.pending],
      );
      assert.equal(pendingLocked[0]?.count, 0);

      const response = await dispatchGoldGet(registry, pool, "/gold/solvency");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, solvency);
    });
  });

  it("redemption receipts link burned_or_debited to released on correlation id with route_asset", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const response = await dispatchGoldGet(
        registry,
        pool,
        "/gold/redemption-receipts",
        `?receiptCorrelationId=${CORR.redeem}`,
      );

      assert.equal(response.status, 200);
      const receipt = response.body as {
        receiptCorrelationId: string;
        routeAsset: string;
        complete: boolean;
        stages: Array<{ bridgeState: string; routeAsset: string; complete: boolean }>;
      };

      assert.equal(receipt.receiptCorrelationId, CORR.redeem);
      assert.equal(receipt.routeAsset, "paxg");
      assert.equal(receipt.complete, true);
      assert.equal(receipt.stages.length, 2);
      assert.equal(receipt.stages[0]?.bridgeState, "burned_or_debited");
      assert.equal(receipt.stages[1]?.bridgeState, "released");
      assert.equal(receipt.stages[0]?.routeAsset, "paxg");
      assert.equal(receipt.stages[1]?.routeAsset, "paxg");
      assert.equal(receipt.stages[0]?.complete, true);
      assert.equal(receipt.stages[1]?.complete, true);
    });
  });

  it("bridge activity separates finalized and pending; pending never marked complete", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const response = await dispatchGoldGet(registry, pool, "/gold/bridge-activity");
      assert.equal(response.status, 200);

      const body = response.body as {
        finalized: Array<{ complete: boolean; finalityStatus: string }>;
        pending: Array<{ complete: boolean; finalityStatus: string }>;
      };

      assert.ok(body.finalized.length > 0);
      assert.ok(body.pending.length > 0);
      assert.ok(body.finalized.every((row) => row.finalityStatus === "finalized"));
      assert.ok(body.finalized.every((row) => row.complete === true));
      assert.ok(body.pending.every((row) => row.finalityStatus === "pending"));
      assert.ok(body.pending.every((row) => row.complete === false));

      const pendingMint = body.pending.find(
        (row) =>
          (row as { receiptCorrelationId?: string }).receiptCorrelationId ===
          CORR.pending,
      );
      if (pendingMint) {
        assert.equal(pendingMint.complete, false);
      }
    });
  });

  it("returns empty lists and not-found for missing data", async () => {
    const staking = await dispatchGoldGet(registry, pool, "/gold/staking");
    assert.equal(staking.status, 200);
    assert.deepEqual((staking.body as { items: unknown[] }).items, []);

    const missingReceipt = await dispatchGoldGet(
      registry,
      pool,
      "/gold/redemption-receipts",
      "?receiptCorrelationId=0xdead",
    );
    assert.equal(missingReceipt.status, 404);

    const unknownRoute = await dispatchGoldGet(registry, pool, "/gold/unknown");
    assert.equal(unknownRoute.status, 404);
  });

  it("migration status defaults to INACTIVE and reads finalized governance rows", async () => {
    const inactive = await dispatchGoldGet(registry, pool, "/gold/migration-status");
    assert.equal(inactive.status, 200);
    assert.deepEqual(inactive.body, { status: "INACTIVE" });

    await withPoolClient(async (client) => {
      await client.query(
        `INSERT INTO blocks (number, hash, parent_hash, timestamp, validator_address, gas_used, gas_limit, finality_status)
         VALUES (1, '0xblock1', '0xparent', NOW(), '0xvalidator', 0, 0, 'finalized')`,
      );
      await client.query(
        `INSERT INTO transactions (
           hash, block_number, from_address, to_address, value, gas, gas_price,
           max_fee_per_gas, max_priority_fee_per_gas, input, nonce, transaction_index,
           status, finality_status
         ) VALUES (
           '0xtx1', 1, '0xfrom', '0xto', '0', 21000, '0', NULL, NULL, '0x', 0, 0, 1, 'finalized'
         )`,
      );
      await client.query(
        `INSERT INTO governance_events (
           block_number, transaction_hash, event_type, proposer_address, proposal_id, finality_status
         ) VALUES (1, '0xtx1', 'migration_active', '0xfrom', '0xproposal', 'finalized')`,
      );

      const active = await dispatchGoldGet(registry, pool, "/gold/migration-status");
      assert.equal(active.status, 200);
      assert.deepEqual(active.body, { status: "ACTIVE" });
    });
  });

  it("staking validators delegation checkpoints and governance return finalized rows", async () => {
    await withPoolClient(async (client) => {
      await indexWave3(client);

      const staking = await dispatchGoldGet(registry, pool, "/gold/staking");
      assert.equal(staking.status, 200);
      const stakingBody = staking.body as {
        items: Array<{ eventType: string; complete: boolean }>;
      };
      assert.equal(stakingBody.items.length, 1);
      assert.equal(stakingBody.items[0]?.eventType, "stake");
      assert.equal(stakingBody.items[0]?.complete, true);

      const validators = await dispatchGoldGet(registry, pool, "/gold/validators");
      assert.equal(validators.status, 200);
      const validatorBody = validators.body as {
        items: Array<{ eventType: string; complete: boolean }>;
      };
      assert.equal(validatorBody.items.length, 1);
      assert.equal(validatorBody.items[0]?.eventType, "slashed");
      assert.equal(validatorBody.items[0]?.complete, true);

      const delegation = await dispatchGoldGet(registry, pool, "/gold/delegation");
      assert.equal(delegation.status, 200);
      const delegationBody = delegation.body as {
        items: Array<{ delegatorAddress: string; complete: boolean }>;
      };
      assert.equal(delegationBody.items.length, 1);
      assert.equal(delegationBody.items[0]?.complete, true);

      const checkpoints = await dispatchGoldGet(registry, pool, "/gold/checkpoints");
      assert.equal(checkpoints.status, 200);
      assert.equal(
        (checkpoints.body as { items: unknown[] }).items.length,
        1,
      );

      const governance = await dispatchGoldGet(registry, pool, "/gold/governance");
      assert.equal(governance.status, 200);
      assert.equal(
        (governance.body as { items: unknown[] }).items.length,
        1,
      );
    });
  });
});
