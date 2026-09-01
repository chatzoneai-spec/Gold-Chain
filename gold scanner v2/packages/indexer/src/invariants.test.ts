import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, indexToHead } from "./indexer.js";
import { FixtureRpcClient } from "./rpc/fixture-client.js";
import { migrate, resetDatabase, DATABASE_URL } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";
const GOLD = "0x000000000000000000000000000000000000f001";
const ERC20 = "0x000000000000000000000000000000000000e201";
const ERC721 = "0x000000000000000000000000000000000000e701";
const ADDR_E = "0x0000000000000000000000000000000000000e02";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

const WAVE3_EXPECTED_TRANSFERS = [
  {
    block_number: 1,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000001",
    token_id: "1",
    amount: "100",
    log_index: 0,
  },
  {
    block_number: 2,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000002",
    token_id: "2",
    amount: "5",
    log_index: 0,
  },
  {
    block_number: 3,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000003",
    token_id: "1",
    amount: "10",
    log_index: 0,
  },
  {
    block_number: 3,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000003",
    token_id: "2",
    amount: "20",
    log_index: 0,
  },
  {
    block_number: 4,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000004",
    token_id: "1",
    amount: "500",
    log_index: 0,
  },
  {
    block_number: 4,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000004",
    token_id: "1",
    amount: "50",
    log_index: 1,
  },
  {
    block_number: 5,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000006",
    token_id: "1",
    amount: "1000",
    log_index: 1,
  },
  {
    block_number: 6,
    transaction_hash:
      "0x2000000000000000000000000000000000000000000000000000000000000008",
    token_id: "2",
    amount: "12",
    log_index: 1,
  },
  {
    block_number: 6,
    transaction_hash:
      "0x200000000000000000000000000000000000000000000000000000000000000a",
    token_id: "1",
    amount: "300",
    log_index: 1,
  },
  {
    block_number: 8,
    transaction_hash:
      "0x200000000000000000000000000000000000000000000000000000000000000e",
    token_id: "1",
    amount: "500",
    log_index: 0,
  },
];

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

async function indexFixture(
  client: pg.PoolClient,
  fixtureName: string,
): Promise<void> {
  const rpc = new FixtureRpcClient(fixtureName);
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

describe("indexer invariants", () => {
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

  it("every Wave 2 fixture token transfer appears in token_transfers", async () => {
    const expected = JSON.parse(
      readFileSync(path.join(fixturesDir, "expected-rows.json"), "utf8"),
    ) as {
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
    };

    await withPoolClient(async (client) => {
      await indexFixture(client, "blocks.json");

      for (const want of expected.tokenTransfers) {
        const { rows } = await client.query(
          want.token_id === null
            ? `SELECT block_number, transaction_hash, contract_address, from_address,
                      to_address, token_standard, token_id, amount, log_index, finality_status
               FROM token_transfers
               WHERE transaction_hash = $1
                 AND log_index = $2
                 AND token_id IS NULL`
            : `SELECT block_number, transaction_hash, contract_address, from_address,
                      to_address, token_standard, token_id, amount, log_index, finality_status
               FROM token_transfers
               WHERE transaction_hash = $1
                 AND log_index = $2
                 AND token_id = $3`,
          want.token_id === null
            ? [want.transaction_hash, want.log_index]
            : [want.transaction_hash, want.log_index, want.token_id],
        );

        assert.equal(rows.length, 1, `missing transfer ${want.transaction_hash}`);
        const row = rows[0]!;
        assert.equal(Number(row.block_number), want.block_number);
        assert.equal(row.contract_address, want.contract_address);
        assert.equal(row.from_address, want.from_address);
        assert.equal(row.to_address, want.to_address);
        assert.equal(row.token_standard, want.token_standard);
        assert.equal(String(row.amount), want.amount);
        assert.notEqual(row.finality_status, "reverted");
      }
    });
  });

  it("every Wave 3 fixture GOLD transfer appears in token_transfers", async () => {
    await withPoolClient(async (client) => {
      await indexFixture(client, "wave3.json");

      for (const want of WAVE3_EXPECTED_TRANSFERS) {
        const { rows } = await client.query(
          `SELECT block_number, transaction_hash, contract_address, token_id, amount,
                  log_index, finality_status
           FROM token_transfers
           WHERE transaction_hash = $1
             AND log_index = $2
             AND token_id = $3
             AND contract_address = $4`,
          [want.transaction_hash, want.log_index, want.token_id, GOLD],
        );

        assert.equal(rows.length, 1, `missing GOLD transfer ${want.transaction_hash}`);
        const row = rows[0]!;
        assert.equal(Number(row.block_number), want.block_number);
        assert.equal(String(row.amount), want.amount);
        assert.notEqual(row.finality_status, "reverted");
      }
    });
  });

  it("reorg fixture leaves no stale token_balances from orphaned transfers", async () => {
    await withPoolClient(async (client) => {
      const rpc = new FixtureRpcClient("reorg.json");
      const state = createIndexerState();
      await indexToHead(rpc, client, state);
      rpc.advanceStage();
      await indexToHead(rpc, client, state);

      const { rows: orphanedRecipient } = await client.query(
        `SELECT balance
         FROM token_balances
         WHERE contract_address = $1
           AND address = $2
           AND token_id = '7'`,
        [ERC721, ADDR_E],
      );
      assert.equal(orphanedRecipient.length, 0);

      const { rows: canonicalErc20 } = await client.query(
        `SELECT amount, finality_status
         FROM token_transfers
         WHERE contract_address = $1
           AND transaction_hash = '0xtx00000000000000000000000000000000000000000000000000000000000002'
           AND finality_status <> 'reverted'`,
        [ERC20],
      );
      assert.equal(canonicalErc20.length, 1);
      assert.equal(canonicalErc20[0]?.amount, "1000");

      const { rows: staleTransfers } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM token_transfers
         WHERE transaction_hash = '0xtx00000000000000000000000000000000000000000000000000000000000004'
           AND finality_status <> 'reverted'`,
      );
      assert.equal(staleTransfers[0]?.count, 0);
    });
  });
});
