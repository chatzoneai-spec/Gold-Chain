import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { MissingRangeTracker } from "./backfill.js";
import { HeadFollower } from "./head-follower.js";
import {
  createIndexerState,
  indexBlockNumbers,
  indexToHead,
} from "./indexer.js";
import { FixtureRpcClient } from "./rpc/fixture-client.js";
import { migrate, resetDatabase, DATABASE_URL } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";
const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

type ExpectedRows = {
  head: number;
  blocks: Array<{ number: number; hash: string; finality_status: string }>;
  transactionCount: number;
  receiptCount: number;
  logCount: number;
  internalTxCount: number;
  contractCount: number;
  tokenContractCount: number;
  tokenTransfers: Array<{
    block_number: number;
    transaction_hash: string;
    contract_address: string;
    from_address: string;
    to_address: string;
    token_standard: string;
    token_id: string | null;
    amount: string;
    log_index: number;
  }>;
  contracts: Array<{ address: string }>;
};

function loadExpectedRows(): ExpectedRows {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, "expected-rows.json"), "utf8"),
  ) as ExpectedRows;
}

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

async function assertMatchesExpected(client: pg.PoolClient): Promise<void> {
  const expected = loadExpectedRows();

  const { rows: blocks } = await client.query(
    `SELECT number, hash, finality_status
     FROM blocks
     WHERE finality_status <> 'reverted'
     ORDER BY number`,
  );

  assert.equal(blocks.length, expected.blocks.length);
  for (let index = 0; index < expected.blocks.length; index += 1) {
    const actual = blocks[index]!;
    const want = expected.blocks[index]!;
    assert.equal(Number(actual.number), want.number);
    assert.equal(actual.hash, want.hash);
    assert.equal(actual.finality_status, want.finality_status);
  }

  const { rows: txCount } = await client.query(
    `SELECT COUNT(*)::int AS count FROM transactions WHERE finality_status <> 'reverted'`,
  );
  assert.equal(txCount[0]?.count, expected.transactionCount);

  const { rows: receiptCount } = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM receipts r
     JOIN transactions t ON t.hash = r.transaction_hash
     WHERE t.finality_status <> 'reverted'`,
  );
  assert.equal(receiptCount[0]?.count, expected.receiptCount);

  const { rows: logCount } = await client.query(
    `SELECT COUNT(*)::int AS count FROM logs WHERE finality_status <> 'reverted'`,
  );
  assert.equal(logCount[0]?.count, expected.logCount);

  const { rows: internalCount } = await client.query(
    `SELECT COUNT(*)::int AS count FROM internal_txs WHERE finality_status <> 'reverted'`,
  );
  assert.equal(internalCount[0]?.count, expected.internalTxCount);

  const { rows: contractCount } = await client.query(
    `SELECT COUNT(*)::int AS count FROM contracts`,
  );
  assert.equal(contractCount[0]?.count, expected.contractCount);

  const { rows: tokenContractCount } = await client.query(
    `SELECT COUNT(*)::int AS count FROM token_contracts`,
  );
  assert.equal(tokenContractCount[0]?.count, expected.tokenContractCount);

  const { rows: transfers } = await client.query(
    `SELECT block_number, transaction_hash, contract_address, from_address,
            to_address, token_standard, token_id, amount, log_index
     FROM token_transfers
     WHERE finality_status <> 'reverted'
     ORDER BY block_number, log_index`,
  );

  assert.equal(transfers.length, expected.tokenTransfers.length);
  for (let index = 0; index < expected.tokenTransfers.length; index += 1) {
    const actual = transfers[index]!;
    const want = expected.tokenTransfers[index]!;
    assert.equal(Number(actual.block_number), want.block_number);
    assert.equal(actual.transaction_hash, want.transaction_hash);
    assert.equal(actual.contract_address, want.contract_address);
    assert.equal(actual.from_address, want.from_address);
    assert.equal(actual.to_address, want.to_address);
    assert.equal(actual.token_standard, want.token_standard);
    assert.equal(
      actual.token_id === null ? null : String(actual.token_id),
      want.token_id,
    );
    assert.equal(String(actual.amount), want.amount);
    assert.equal(actual.log_index, want.log_index);
  }
}

describe("indexer core", () => {
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

  it("fixture replay indexes to exact expected state", async () => {
    const rpc = new FixtureRpcClient("blocks.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexToHead(rpc, client, state);
      await assertMatchesExpected(client);
    });
  });

  it("duplicate block replay is idempotent", async () => {
    const rpc = new FixtureRpcClient("blocks.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexToHead(rpc, client, state);
      await indexToHead(rpc, client, state);
      await assertMatchesExpected(client);

      const { rows } = await client.query(
        `SELECT number, COUNT(*)::int AS count
         FROM blocks
         WHERE finality_status <> 'reverted'
         GROUP BY number
         HAVING COUNT(*) > 1`,
      );
      assert.equal(rows.length, 0);
    });
  });

  it("reorg fixture replaces stale rows without duplicates", async () => {
    const rpc = new FixtureRpcClient("reorg.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexToHead(rpc, client, state);

      const { rows: beforeReorg } = await client.query(
        `SELECT hash FROM blocks WHERE number = 3 AND finality_status <> 'reverted'`,
      );
      assert.equal(
        beforeReorg[0]?.hash,
        "0xblock000000000000000000000000000000000000000000000000000000000003",
      );

      rpc.advanceStage();
      await indexToHead(rpc, client, state);

      const { rows: canonicalBlock3 } = await client.query(
        `SELECT hash, finality_status FROM blocks WHERE number = 3`,
      );
      assert.equal(canonicalBlock3.length, 1);
      assert.equal(
        canonicalBlock3[0]?.hash,
        "0xblock0000000000000000000000000000000000000000000000000000000000reorg",
      );
      assert.notEqual(canonicalBlock3[0]?.finality_status, "reverted");

      const { rows: staleTx } = await client.query(
        `SELECT hash, finality_status FROM transactions
         WHERE hash = '0xtx00000000000000000000000000000000000000000000000000000000000004'`,
      );
      assert.equal(staleTx.length, 1);
      assert.equal(staleTx[0]?.finality_status, "reverted");

      const { rows: canonicalTx } = await client.query(
        `SELECT hash FROM transactions
         WHERE block_number = 3 AND finality_status <> 'reverted'`,
      );
      assert.equal(canonicalTx.length, 1);
      assert.equal(
        canonicalTx[0]?.hash,
        "0xtx0000000000000000000000000000000000000000000000000000000000reorg",
      );

      const { rows: duplicateNumbers } = await client.query(
        `SELECT number, COUNT(*)::int AS count
         FROM blocks
         WHERE finality_status <> 'reverted'
         GROUP BY number
         HAVING COUNT(*) > 1`,
      );
      assert.equal(duplicateNumbers.length, 0);

      const { rows: staleTransfers } = await client.query(
        `SELECT COUNT(*)::int AS count FROM token_transfers
         WHERE transaction_hash = '0xtx00000000000000000000000000000000000000000000000000000000000004'
           AND finality_status <> 'reverted'`,
      );
      assert.equal(staleTransfers[0]?.count, 0);
    });
  });

  it("missing-range tracker detects and backfill re-fetches a gap", async () => {
    const rpc = new FixtureRpcClient("gap.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexBlockNumbers(rpc, client, [1, 3], state);

      const tracker = new MissingRangeTracker();
      tracker.markRangeIndexed(1, 1);
      tracker.markRangeIndexed(3, 3);
      const gaps = tracker.getMissingRanges(3);
      assert.deepEqual(gaps, [{ from: 2, to: 2 }]);

      const { rows: missingBlock } = await client.query(
        `SELECT COUNT(*)::int AS count FROM blocks WHERE number = 2`,
      );
      assert.equal(missingBlock[0]?.count, 0);

      state.tracker.markRangeIndexed(1, 1);
      state.tracker.markRangeIndexed(3, 3);
      state.lastIndexedHead = 3;

      const gapsFromState = state.tracker.getMissingRanges(3);
      assert.deepEqual(gapsFromState, [{ from: 2, to: 2 }]);

      await indexToHead(rpc, client, state);

      const { rows: filledBlock } = await client.query(
        `SELECT number, hash FROM blocks WHERE number = 2 AND finality_status <> 'reverted'`,
      );
      assert.equal(filledBlock.length, 1);
      assert.equal(
        filledBlock[0]?.hash,
        "0xblock000000000000000000000000000000000000000000000000000000000002",
      );
    });
  });

  it("head follower polls fixture head", async () => {
    const rpc = new FixtureRpcClient("blocks.json");
    const follower = new HeadFollower(rpc);

    const head = await follower.pollHead();
    assert.equal(head, 3);
    assert.equal(follower.getLastHead(), 3);
  });

  it("empty range produces no indexed blocks", async () => {
    const tracker = new MissingRangeTracker();
    assert.deepEqual(tracker.getMissingRanges(0), []);
  });

  it("partial receipt list still indexes available receipts", async () => {
    const rpc = new FixtureRpcClient("blocks.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexBlockNumbers(rpc, client, [2], state);

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM receipts`,
      );
      assert.equal(rows[0]?.count, 2);
    });
  });
});
