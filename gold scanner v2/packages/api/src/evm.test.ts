import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import WebSocket from "ws";
import { createApp, listen } from "./http.js";
import {
  ADDR_A,
  ADDR_B,
  ADDR_D,
  BLOCK_1_HASH,
  TOKEN_ERC20,
  TOKEN_ERC721,
  TX_1,
  TX_2,
  seedApiFixture,
} from "./test/seed.js";
import {
  DATABASE_URL,
  createPool,
  migrate,
  resetDatabase,
} from "./test/db.js";

async function apiGet(
  port: number,
  query: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const params = new URLSearchParams(query);
  const response = await fetch(`http://127.0.0.1:${port}/api?${params}`);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function apiRequest(
  port: number,
  method: string,
  query: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const params = new URLSearchParams(query);
  const response = await fetch(`http://127.0.0.1:${port}/api?${params}`, {
    method,
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

describe("evm api", () => {
  let pool: pg.Pool;
  let port: number;
  let app: ReturnType<typeof createApp>;

  before(async () => {
    await resetDatabase();
    migrate("up");
    pool = createPool();
  });

  after(async () => {
    await pool.end();
    await resetDatabase();
  });

  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query(
        `TRUNCATE token_transfers, token_balances, internal_txs, logs, receipts,
                transactions, token_contracts, contracts, addresses, blocks CASCADE`,
      );
      await seedApiFixture(client);
    });

    app = createApp({ pool });
    await new Promise<void>((resolve) => {
      app.server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      app.server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  it("account balance returns gilt balance for known address", async () => {
    const { status, body } = await apiGet(port, {
      module: "account",
      action: "balance",
      address: ADDR_A,
    });
    assert.equal(status, 200);
    assert.equal(body.status, "1");
    assert.equal(body.result, "1000000000000000000");
  });

  it("account balance returns zero for unknown address", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "balance",
      address: "0x000000000000000000000000000000000000ffff",
    });
    assert.equal(body.status, "1");
    assert.equal(body.result, "0");
  });

  it("account txlist returns seeded transactions", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "txlist",
      address: ADDR_A,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.ok(result.length >= 2);
    assert.ok(result.some((row) => row.hash === TX_1));
    assert.ok(result.some((row) => row.hash === TX_2));
  });

  it("account txlist empty for address with no transactions", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "txlist",
      address: "0x000000000000000000000000000000000000ffff",
    });
    assert.equal(body.status, "1");
    assert.deepEqual(body.result, []);
  });

  it("account txlist paginates results", async () => {
    const page1 = await apiGet(port, {
      module: "account",
      action: "txlist",
      address: ADDR_A,
      page: "1",
      offset: "1",
    });
    const page2 = await apiGet(port, {
      module: "account",
      action: "txlist",
      address: ADDR_A,
      page: "2",
      offset: "1",
    });
    const rows1 = page1.body.result as Array<Record<string, string>>;
    const rows2 = page2.body.result as Array<Record<string, string>>;
    assert.equal(rows1.length, 1);
    assert.equal(rows2.length, 1);
    assert.notEqual(rows1[0]!.hash, rows2[0]!.hash);
  });

  it("account txlistinternal returns internal transaction", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "txlistinternal",
      address: ADDR_A,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.hash, TX_1);
    assert.equal(result[0]!.value, "50");
  });

  it("account tokentx returns erc20 transfer", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "tokentx",
      address: ADDR_A,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.ok(result.some((row) => row.contractAddress === TOKEN_ERC20));
  });

  it("account tokennfttx returns erc721 transfer", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "tokennfttx",
      address: ADDR_D,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tokenID, "7");
  });

  it("transaction gettxreceiptstatus returns status for known tx", async () => {
    const { body } = await apiGet(port, {
      module: "transaction",
      action: "gettxreceiptstatus",
      txhash: TX_1,
    });
    assert.equal(body.status, "1");
    const result = body.result as Record<string, string>;
    assert.equal(result.status, "1");
  });

  it("transaction gettxreceiptstatus not-found for unknown tx", async () => {
    const { body } = await apiGet(port, {
      module: "transaction",
      action: "gettxreceiptstatus",
      txhash: "0xdead",
    });
    assert.equal(body.status, "0");
  });

  it("tx gettxbyhash returns transaction details", async () => {
    const { body } = await apiGet(port, {
      module: "tx",
      action: "gettxbyhash",
      txhash: TX_1,
    });
    assert.equal(body.status, "1");
    const result = body.result as Record<string, string>;
    assert.equal(result.hash, TX_1);
    assert.equal(result.from, ADDR_A);
  });

  it("block getblockbynumber returns block", async () => {
    const { body } = await apiGet(port, {
      module: "block",
      action: "getblockbynumber",
      tag: "1",
    });
    assert.equal(body.status, "1");
    const result = body.result as Record<string, string>;
    assert.equal(result.hash, BLOCK_1_HASH);
    assert.equal(result.finalityStatus, "finalized");
  });

  it("block getblockbyhash not-found for unknown hash", async () => {
    const { body } = await apiGet(port, {
      module: "block",
      action: "getblockbyhash",
      hash: "0xdead",
    });
    assert.equal(body.status, "0");
  });

  it("logs getLogs returns seeded logs", async () => {
    const { body } = await apiGet(port, {
      module: "logs",
      action: "getLogs",
      fromBlock: "2",
      toBlock: "2",
      address: TOKEN_ERC20,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.transactionHash, TX_2);
  });

  it("logs getLogs empty when no matches", async () => {
    const { body } = await apiGet(port, {
      module: "logs",
      action: "getLogs",
      fromBlock: "0",
      toBlock: "0",
    });
    assert.equal(body.status, "1");
    assert.deepEqual(body.result, []);
  });

  it("token tokeninfo returns token metadata", async () => {
    const { body } = await apiGet(port, {
      module: "token",
      action: "tokeninfo",
      contractaddress: TOKEN_ERC20,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result[0]!.symbol, "TGOLD");
  });

  it("token tokeninfo not-found for unknown contract", async () => {
    const { body } = await apiGet(port, {
      module: "token",
      action: "tokeninfo",
      contractaddress: "0xdead",
    });
    assert.equal(body.status, "0");
  });

  it("contract getsourcecode returns contract row", async () => {
    const { body } = await apiGet(port, {
      module: "contract",
      action: "getsourcecode",
      address: TOKEN_ERC20,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result[0]!.Bytecode, "0x6001");
  });

  it("contract getabi not-found for unverified contract", async () => {
    const { body } = await apiGet(port, {
      module: "contract",
      action: "getabi",
      address: TOKEN_ERC721,
    });
    assert.equal(body.status, "0");
  });

  it("rejects write attempts with 405", async () => {
    const { status, body } = await apiRequest(port, "POST", {
      module: "account",
      action: "balance",
      address: ADDR_A,
    });
    assert.equal(status, 405);
    assert.equal(body.message, "Method Not Allowed");
  });

  it("unknown module returns NOTOK", async () => {
    const { body } = await apiGet(port, {
      module: "nope",
      action: "balance",
    });
    assert.equal(body.status, "0");
  });
});

describe("websocket feed", () => {
  it("broadcasts block and tx events to connected clients", async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const app = createApp({ pool });
    await listen(app, 0);
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;

    const messages: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
    ws.on("message", (data) => {
      messages.push(String(data));
    });

    app.feed.broadcast({
      type: "block",
      number: "1",
      hash: BLOCK_1_HASH,
      timestamp: "1704067200",
      finalityStatus: "finalized",
    });
    app.feed.broadcast({
      type: "tx",
      hash: TX_1,
      blockNumber: "1",
      from: ADDR_A,
      to: ADDR_B,
      value: "100",
      finalityStatus: "finalized",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.close();
    await new Promise<void>((resolve, reject) => {
      app.server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();

    assert.equal(messages.length, 2);
    const blockMsg = JSON.parse(messages[0]!) as Record<string, string>;
    const txMsg = JSON.parse(messages[1]!) as Record<string, string>;
    assert.equal(blockMsg.type, "block");
    assert.equal(txMsg.type, "tx");
    assert.equal(txMsg.hash, TX_1);
  });
});
