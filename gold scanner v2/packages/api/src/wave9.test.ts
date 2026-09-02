import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import solc from "solc";
import { createIndexerState } from "../../indexer/src/indexer.js";
import { FixtureRpcClient } from "../../indexer/src/rpc/fixture-client.js";
import { handleContractCallWithRpc } from "./contract-call.js";
import { createApp } from "./http.js";
import { indexWithFeed } from "./index-with-feed.js";
import type { WebSocketFeed } from "./ws.js";
import {
  createGoldRouteRegistry,
  dispatchGoldGet,
  registerGoldRoutes,
} from "./gold/register.js";
import { ADDR_A, ADDR_B, TX_1, TX_2, seedApiFixture } from "./test/seed.js";
import {
  createPool,
  migrate,
  resetDatabase,
  withPoolClient,
} from "./test/db.js";

const CONFIRMATION_DEPTH = "2";
const GOLD = "0x000000000000000000000000000000000000f001";
const ERC20 = "0x000000000000000000000000000000000000e201";
const VALIDATOR1 = "0x0000000000000000000000000000000000000d01";
const VALIDATOR2 = "0x0000000000000000000000000000000000000d02";
const USER_A = "0x0000000000000000000000000000000000000a01";
const PROPOSAL_ID =
  "0x00c1000000000000000000000000000000000000000000000000000000000001";

const VERIFY_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Wave9Tiny {
}`;

function compileTiny(): { bytecode: string; abi: string } {
  const input = {
    language: "Solidity",
    sources: { "contract.sol": { content: VERIFY_SOURCE } },
    settings: {
      optimizer: { enabled: false, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  };
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: () => ({ contents: "" }) }),
  ) as {
    contracts: Record<
      string,
      Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>
    >;
  };
  const contract = output.contracts["contract.sol"]!.Wave9Tiny!;
  return {
    bytecode: `0x${contract.evm.bytecode.object}`,
    abi: JSON.stringify(contract.abi),
  };
}

async function indexWave3(client: pg.PoolClient, feed: WebSocketFeed): Promise<void> {
  const rpc = new FixtureRpcClient("wave3.json");
  const state = createIndexerState();
  await indexWithFeed(rpc, client, state, feed);
}

async function indexWave8(client: pg.PoolClient, feed: WebSocketFeed): Promise<void> {
  const rpc = new FixtureRpcClient("wave8.json");
  const state = createIndexerState();
  await indexWithFeed(rpc, client, state, feed);
}

async function apiGet(
  port: number,
  query: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const params = new URLSearchParams(query);
  const response = await fetch(`http://127.0.0.1:${port}/api?${params}`);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function postJson(
  port: number,
  path: string,
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

describe("wave9 api", () => {
  let pool: pg.Pool;
  let port: number;
  let app: ReturnType<typeof createApp>;
  let registry: ReturnType<typeof createGoldRouteRegistry>;

  before(async () => {
    await resetDatabase();
    migrate("up");
    pool = createPool();
    registry = createGoldRouteRegistry();
    registerGoldRoutes(registry, pool);
  });

  after(async () => {
    await pool.end();
    await resetDatabase();
  });

  beforeEach(async () => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = CONFIRMATION_DEPTH;
    delete process.env.GOLDSCAN_RPC_URL;

    const client = await pool.connect();
    try {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await seedApiFixture(client);
    } finally {
      client.release();
    }

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

  it("stats txcount returns non-reverted transaction count", async () => {
    const { body } = await apiGet(port, { module: "stats", action: "txcount" });
    assert.equal(body.status, "1");
    assert.equal(body.result, "4");
  });

  it("block getblocktxlist returns txs for seeded block 2", async () => {
    const { body } = await apiGet(port, {
      module: "block",
      action: "getblocktxlist",
      blockno: "2",
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result.length, 3);
    assert.ok(result.every((row) => row.blockNumber === "2"));
  });

  it("block getblocktxlist returns empty for block with no txs", async () => {
    const { body } = await apiGet(port, {
      module: "block",
      action: "getblocktxlist",
      blockno: "999",
    });
    assert.equal(body.status, "1");
    assert.equal(body.message, "No transactions found");
    assert.deepEqual(body.result, []);
  });

  it("account tokentx filtered by txhash returns transfers for that tx", async () => {
    const { body } = await apiGet(port, {
      module: "account",
      action: "tokentx",
      txhash: TX_2,
    });
    assert.equal(body.status, "1");
    const result = body.result as Array<Record<string, string>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.hash, TX_2);
    assert.equal(result[0]!.contractAddress, ERC20);
  });

  it("tx gettxbyhash includes decodedInput for native transfer", async () => {
    const { body } = await apiGet(port, {
      module: "tx",
      action: "gettxbyhash",
      txhash: TX_1,
    });
    assert.equal(body.status, "1");
    const result = body.result as Record<string, unknown>;
    const decoded = result.decodedInput as {
      selector: string;
      signature: string;
      args: unknown[];
    };
    assert.equal(decoded.selector, "0x");
    assert.equal(decoded.signature, "nativeTransfer");
    assert.deepEqual(decoded.args, []);
  });

  it("token tokeninfo erc20 totalSupply from token_balances sum", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `INSERT INTO token_balances (address, contract_address, token_id, balance)
         VALUES ($1, $2, 0, 1000)
         ON CONFLICT (address, contract_address, token_id)
         DO UPDATE SET balance = EXCLUDED.balance`,
        [ADDR_B, ERC20],
      );
    });

    const { body } = await apiGet(port, {
      module: "token",
      action: "tokeninfo",
      contractaddress: ERC20,
    });
    assert.equal(body.status, "1");
    const row = (body.result as Array<Record<string, unknown>>)[0]!;
    assert.equal(row.totalSupply, "1000");
  });

  it("token tokeninfo GOLD without tokenid returns per-ID supplies not summed", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave3(client, app.feed);
    });

    const { body } = await apiGet(port, {
      module: "token",
      action: "tokeninfo",
      contractaddress: GOLD,
    });
    assert.equal(body.status, "1");
    const row = (body.result as Array<Record<string, unknown>>)[0]!;
    const supplies = row.totalSupply as Array<{ tokenId: string; totalSupply: string }>;
    assert.equal(supplies.length, 2);
    assert.equal(supplies[0]!.tokenId, "1");
    assert.equal(supplies[1]!.tokenId, "2");
    assert.notEqual(supplies[0]!.totalSupply, supplies[1]!.totalSupply);
    assert.notEqual(
      supplies[0]!.totalSupply,
      String(BigInt(supplies[0]!.totalSupply) + BigInt(supplies[1]!.totalSupply)),
    );
  });

  it("token tokenholderlist keeps GOLD id 1 and id 2 separate", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave3(client, app.feed);
    });

    const id1 = await apiGet(port, {
      module: "token",
      action: "tokenholderlist",
      contractaddress: GOLD,
      tokenid: "1",
    });
    const id2 = await apiGet(port, {
      module: "token",
      action: "tokenholderlist",
      contractaddress: GOLD,
      tokenid: "2",
    });
    const both = await apiGet(port, {
      module: "token",
      action: "tokenholderlist",
      contractaddress: GOLD,
    });

    const holders1 = id1.body.result as Array<{ address: string; balance: string }>;
    const holders2 = id2.body.result as Array<{ address: string; balance: string }>;
    const split = both.body.result as {
      id1: Array<{ address: string; balance: string }>;
      id2: Array<{ address: string; balance: string }>;
    };

    assert.ok(holders1.length > 0);
    assert.ok(holders2.length > 0);
    assert.notDeepEqual(holders1, holders2);
    assert.deepEqual(split.id1, holders1);
    assert.deepEqual(split.id2, holders2);
  });

  it("validator-set exposes GILT vs GOLD ID 1 stake split from wave8", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave8(client, app.feed);
    });

    const response = await dispatchGoldGet(registry, pool, "/gold/validator-set");
    assert.equal(response.status, 200);
    const rows = response.body as Array<{
      validatorAddress: string;
      giltStake: string;
      goldId1Stake: string;
      goldId2Stake: string;
      votingPower: string;
      elected: boolean;
      jailed: boolean;
    }>;

    const v1 = rows.find((row) => row.validatorAddress === VALIDATOR1);
    assert.ok(v1);
    assert.equal(v1.giltStake, "10000");
    assert.equal(v1.goldId1Stake, "500");
    assert.equal(v1.goldId2Stake, "0");
    assert.equal(v1.votingPower, "10500");
    assert.equal(v1.elected, true);

    const v2 = rows.find((row) => row.validatorAddress === VALIDATOR2);
    assert.ok(v2);
    assert.equal(v2.jailed, true);
  });

  it("delegations and unbonding from wave8 fixture", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave8(client, app.feed);
    });

    const response = await dispatchGoldGet(registry, pool, "/gold/delegations");
    assert.equal(response.status, 200);
    const body = response.body as {
      delegations: Array<{ stakeAsset: string; amount: string }>;
      unbonding: Array<{ stakeAsset: string; amount: string }>;
    };

    assert.ok(
      body.delegations.some(
        (row) => row.stakeAsset === "gilt" && row.amount === "10000",
      ),
    );
    assert.ok(
      body.delegations.some(
        (row) => row.stakeAsset === "gold_id_1" && row.amount === "500",
      ),
    );
    assert.equal(body.unbonding.length, 1);
    assert.equal(body.unbonding[0]!.stakeAsset, "gilt");
    assert.equal(body.unbonding[0]!.amount, "2000");
  });

  it("checkpoint-status reports committed and not halted from finalized rows", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave8(client, app.feed);
    });

    const response = await dispatchGoldGet(registry, pool, "/gold/checkpoint-status");
    assert.equal(response.status, 200);
    const body = response.body as {
      halted: boolean;
      diverged: boolean;
      lastCommitted: { blockNumber: number; checkpointHash: string } | null;
    };

    assert.equal(body.halted, false);
    assert.equal(body.diverged, false);
    assert.ok(body.lastCommitted);
    assert.equal(body.lastCommitted!.blockNumber, 5);
  });

  it("governance-board groups votes and clears executed from timelock queue", async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE bridge_transfers, staking_events, validator_events, governance_events,
                checkpoints, gold_supply, token_transfers, token_balances, internal_txs,
                logs, receipts, transactions, token_contracts, contracts, addresses, blocks
         RESTART IDENTITY CASCADE`,
      );
      await indexWave8(client, app.feed);
    });

    const response = await dispatchGoldGet(registry, pool, "/gold/governance-board");
    assert.equal(response.status, 200);
    const body = response.body as {
      proposals: Array<{
        proposalId: string;
        proposerAddress: string;
        votes: Array<{ voterAddress: string; support: string }>;
      }>;
      timelockQueue: Array<{ proposalId: string }>;
    };

    assert.equal(body.proposals.length, 1);
    assert.equal(body.proposals[0]!.proposalId, PROPOSAL_ID);
    assert.equal(body.proposals[0]!.proposerAddress, USER_A);
    assert.equal(body.proposals[0]!.votes.length, 1);
    assert.equal(body.proposals[0]!.votes[0]!.support, "for");
    assert.equal(body.timelockQueue.length, 0);
  });

  it("POST /verify rejects path traversal in compilerVersion", async () => {
    const { status, body } = await postJson(port, "/verify", {
      address: ADDR_A,
      source: VERIFY_SOURCE,
      compilerVersion: "../8.20.0",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "invalid_compiler_version");
  });

  it("POST /contract/verify rejects path traversal in compilerVersion", async () => {
    const { status, body } = await postJson(port, "/contract/verify", {
      address: ADDR_A,
      source: VERIFY_SOURCE,
      compilerVersion: "../8.20.0",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "invalid_compiler_version");
  });

  it("POST /verify matches compiled bytecode and marks contract verified", async () => {
    const compiled = compileTiny();
    const verifyAddress = "0x0000000000000000000000000000000000000f99";

    await withPoolClient(async (client) => {
      await client.query(`INSERT INTO addresses (address, gilt_balance) VALUES ($1, 0)`, [
        verifyAddress,
      ]);
      await client.query(
        `INSERT INTO contracts (address, bytecode, is_verified)
         VALUES ($1, $2, false)`,
        [verifyAddress, compiled.bytecode],
      );
    });

    const { status, body } = await postJson(port, "/verify", {
      address: verifyAddress,
      source: VERIFY_SOURCE,
      compilerVersion: "v0.8.20",
    });
    assert.equal(status, 200);
    assert.equal(body.verified, true);

    const { rows } = await pool.query(
      `SELECT is_verified, abi IS NOT NULL AS has_abi FROM contracts WHERE address = $1`,
      [verifyAddress],
    );
    assert.equal(rows[0]!.is_verified, true);
    assert.equal(rows[0]!.has_abi, true);
  });

  it("POST /verify returns bytecode_mismatch on wrong source", async () => {
    const compiled = compileTiny();
    const verifyAddress = "0x0000000000000000000000000000000000000f98";

    await withPoolClient(async (client) => {
      await client.query(`INSERT INTO addresses (address, gilt_balance) VALUES ($1, 0)`, [
        verifyAddress,
      ]);
      await client.query(
        `INSERT INTO contracts (address, bytecode, is_verified)
         VALUES ($1, $2, false)`,
        [verifyAddress, compiled.bytecode],
      );
    });

    const wrongSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Wave9Tiny {
    uint256 public x = 1;
}`;
    const { status, body } = await postJson(port, "/verify", {
      address: verifyAddress,
      source: wrongSource,
      compilerVersion: "v0.8.20",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "bytecode_mismatch");
  });

  it("POST /contract/call returns 503 when RPC unavailable", async () => {
    delete process.env.GOLDSCAN_RPC_URL;
    const { status, body } = await postJson(port, "/contract/call", {
      address: ADDR_A,
      data: "0x",
    });
    assert.equal(status, 503);
    assert.equal(body.error, "rpc_unavailable");
  });

  it("POST /contract/call returns mock RPC result", async () => {
    const response = await handleContractCallWithRpc(
      { address: ADDR_A, data: "0xdeadbeef" },
      async () => "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
    assert.equal(response.status, 200);
    assert.equal(
      (response.body as { result: string }).result,
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("POST /contract/encode returns calldata for write UI", async () => {
    const { status, body } = await postJson(port, "/contract/encode", {
      address: ERC20,
      signature: "transfer(address,uint256)",
      args: [ADDR_B, "1000"],
    });
    assert.equal(status, 200);
    assert.equal(body.to, ERC20);
    assert.match(String(body.data), /^0x[a-f0-9]+$/i);
  });
});
