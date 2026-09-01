import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createIndexerState, indexToHead } from "./indexer.js";
import { FixtureRpcClient } from "./rpc/fixture-client.js";
import { migrate, resetDatabase, DATABASE_URL } from "./test/db.js";

const CONFIRMATION_DEPTH = "2";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";
const VALIDATOR1 = "0x0000000000000000000000000000000000000d01";
const VALIDATOR2 = "0x0000000000000000000000000000000000000d02";
const ERC20 = "0x000000000000000000000000000000000000e201";
const ADDR_B = "0x0000000000000000000000000000000000000b02";
const PROPOSAL_ID =
  "0x00c1000000000000000000000000000000000000000000000000000000000001";

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

async function indexWave8(client: pg.PoolClient): Promise<void> {
  const rpc = new FixtureRpcClient("wave8.json");
  const state = createIndexerState();
  await indexToHead(rpc, client, state);
}

describe("wave8 gold-view fields", () => {
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

  it("GILT and GOLD ID 1 staking rows are separate (stake_asset not collapsed)", async () => {
    await withPoolClient(async (client) => {
      await indexWave8(client);

      const { rows } = await client.query(
        `SELECT stake_asset, amount, validator_address, event_type
         FROM staking_events
         WHERE event_type = 'stake'
         ORDER BY stake_asset`,
      );

      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.stake_asset, "gilt");
      assert.equal(rows[0]?.amount, "10000");
      assert.equal(rows[0]?.validator_address, VALIDATOR1);
      assert.equal(rows[1]?.stake_asset, "gold_id_1");
      assert.equal(rows[1]?.amount, "500");
      assert.equal(rows[1]?.validator_address, VALIDATOR1);
    });
  });

  it("unbond row exists", async () => {
    await withPoolClient(async (client) => {
      await indexWave8(client);

      const { rows } = await client.query(
        `SELECT event_type, amount, stake_asset
         FROM staking_events
         WHERE event_type = 'unbond'`,
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.amount, "2000");
      assert.equal(rows[0]?.stake_asset, "gilt");
    });
  });

  it("validator elected/commission/jailed fields exact", async () => {
    await withPoolClient(async (client) => {
      await indexWave8(client);

      const { rows: created } = await client.query(
        `SELECT commission_bps, jailed, elected
         FROM validator_events
         WHERE validator_address = $1 AND event_type = 'created'`,
        [VALIDATOR1],
      );
      assert.equal(created.length, 1);
      assert.equal(created[0]?.commission_bps, 500);
      assert.equal(created[0]?.jailed, false);
      assert.equal(created[0]?.elected, false);

      const { rows: elected } = await client.query(
        `SELECT commission_bps, jailed, elected
         FROM validator_events
         WHERE validator_address = $1 AND event_type = 'elected'`,
        [VALIDATOR1],
      );
      assert.equal(elected.length, 1);
      assert.equal(elected[0]?.elected, true);
      assert.equal(elected[0]?.jailed, false);

      const { rows: jailed } = await client.query(
        `SELECT jailed, elected
         FROM validator_events
         WHERE validator_address = $1 AND event_type = 'jailed'`,
        [VALIDATOR2],
      );
      assert.equal(jailed.length, 1);
      assert.equal(jailed[0]?.jailed, true);
      assert.equal(jailed[0]?.elected, false);
    });
  });

  it("governance vote/queued/executed rows exist", async () => {
    await withPoolClient(async (client) => {
      await indexWave8(client);

      const { rows: created } = await client.query(
        `SELECT event_type, proposer_address, proposal_id
         FROM governance_events
         WHERE event_type = 'proposal_created'`,
      );
      assert.equal(created.length, 1);
      assert.equal(created[0]?.proposer_address, USER_A);
      assert.equal(created[0]?.proposal_id, PROPOSAL_ID);

      const { rows: vote } = await client.query(
        `SELECT voter_address, support
         FROM governance_events
         WHERE event_type = 'vote'`,
      );
      assert.equal(vote.length, 1);
      assert.equal(vote[0]?.voter_address, USER_B);
      assert.equal(vote[0]?.support, "for");

      const { rows: queued } = await client.query(
        `SELECT timelock_eta, finality_status
         FROM governance_events
         WHERE event_type = 'queued'`,
      );
      assert.equal(queued.length, 1);
      assert.ok(queued[0]?.timelock_eta instanceof Date);
      assert.equal(
        Math.floor((queued[0]?.timelock_eta as Date).getTime() / 1000),
        1_700_000_000,
      );
      assert.equal(queued[0]?.finality_status, "finalized");

      const { rows: executed } = await client.query(
        `SELECT event_type, finality_status
         FROM governance_events
         WHERE event_type = 'executed'`,
      );
      assert.equal(executed.length, 1);
      assert.equal(executed[0]?.finality_status, "finalized");
    });
  });

  it("checkpoint chain_status committed and halted stored as separate rows", async () => {
    await withPoolClient(async (client) => {
      await indexWave8(client);

      const { rows: committed } = await client.query(
        `SELECT chain_status, finality_status
         FROM checkpoints
         WHERE chain_status = 'committed'`,
      );
      assert.equal(committed.length, 1);
      assert.equal(committed[0]?.finality_status, "finalized");

      const { rows: halted } = await client.query(
        `SELECT chain_status, finality_status
         FROM checkpoints
         WHERE chain_status = 'halted'`,
      );
      assert.equal(halted.length, 1);
      assert.equal(halted[0]?.finality_status, "pending");
    });
  });

  it("ERC20 transfer in Wave 2 fixture produces token_balances row after normal index", async () => {
    await withPoolClient(async (client) => {
      const rpc = new FixtureRpcClient("blocks.json");
      const state = createIndexerState();
      await indexToHead(rpc, client, state);

      const { rows } = await client.query(
        `SELECT balance
         FROM token_balances
         WHERE contract_address = $1
           AND address = $2
           AND token_id = 0`,
        [ERC20, ADDR_B],
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.balance, "1000");
    });
  });
});
