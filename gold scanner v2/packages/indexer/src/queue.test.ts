import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, indexToHead } from "./indexer.js";
import { JobQueue } from "./queue.js";
import { IndexerWriter } from "./writer.js";
import { processReceipts } from "./jobs/receipts.js";
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

describe("indexer job queue", () => {
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

  it("enqueue receipts job for fixture tx then drain leaves receipt row", async () => {
    await withPoolClient(async (client) => {
      const rpc = new FixtureRpcClient("blocks.json");
      const writer = new IndexerWriter(client);
      const txHash =
        "0xtx00000000000000000000000000000000000000000000000000000000000001";

      await writer.upsertBlock({
        number: 1,
        hash: "0xblock000000000000000000000000000000000000000000000000000000000001",
        parentHash:
          "0xgenesis0000000000000000000000000000000000000000000000000000000000",
        timestamp: new Date(0),
        validatorAddress: "0x0000000000000000000000000000000000000001",
        gasUsed: 21000n,
        gasLimit: 30000000n,
        finalityStatus: "finalized",
      });
      await writer.upsertTransaction({
        hash: txHash,
        blockNumber: 1,
        fromAddress: "0x0000000000000000000000000000000000000101",
        toAddress: null,
        value: "0",
        gas: 21000n,
        gasPrice: "1000000000",
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        input: "0x608060405234801561001057600080fd5b50",
        nonce: 0n,
        transactionIndex: 0,
        status: 1,
        finalityStatus: "finalized",
      });

      const queue = new JobQueue();
      queue.enqueue({
        type: "receipts",
        payload: { txHash },
      });

      await queue.drain(async (job) => {
        if (job.type === "receipts") {
          const payload = job.payload as { txHash: string };
          await processReceipts(rpc, writer, payload.txHash);
        }
      });

      const { rows } = await client.query(
        `SELECT transaction_hash FROM receipts WHERE transaction_hash = $1`,
        [txHash],
      );
      assert.equal(rows.length, 1);
    });
  });

  it("Wave 2 fixture replay still exact through queued fan-out", async () => {
    const rpc = new FixtureRpcClient("blocks.json");
    const state = createIndexerState();

    await withPoolClient(async (client) => {
      await indexToHead(rpc, client, state);
      await assertMatchesExpected(client);
    });
  });
});
