import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  DATABASE_URL,
  migrate,
  resetDatabase,
  withClient,
} from "./test/db.js";

let fixtureCounter = 0;

async function seedChainFixture(): Promise<{
  goldContract: string;
  holder: string;
  blockNumber: number;
  txHash: string;
}> {
  fixtureCounter += 1;
  const blockNumber = fixtureCounter;
  const txHash = `0xtx${blockNumber}`;
  const blockHash = `0xblock${blockNumber}`;

  return withClient(async (client) => {
    await client.query(
      `INSERT INTO blocks (
         number, hash, parent_hash, timestamp, validator_address, gas_used, gas_limit
       ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
      [blockNumber, blockHash, "0xparent0", "0xvalidator", 21000, 30000000],
    );

    await client.query(
      `INSERT INTO transactions (
         hash, block_number, from_address, to_address, value, gas, nonce,
         transaction_index, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [txHash, blockNumber, `0xfrom${blockNumber}`, "0xto", 0, 21000, 0, 0, 1],
    );

    const holder = `0xholder${blockNumber}`;
    const goldContract = `0xgold${blockNumber}`;
    const fromAddress = `0xfrom${blockNumber}`;

    await client.query(
      `INSERT INTO addresses (address) VALUES ($1), ($2), ($3)`,
      [holder, goldContract, fromAddress],
    );
    await client.query(`INSERT INTO contracts (address) VALUES ($1)`, [
      goldContract,
    ]);
    await client.query(
      `INSERT INTO token_contracts (address, type, name, symbol, decimals)
       VALUES ($1, 'erc1155', 'GOLD', 'GOLD', NULL)`,
      [goldContract],
    );

    return { goldContract, holder, blockNumber, txHash, fromAddress };
  });
}

describe("schema migrations", () => {
  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await resetDatabase();
  });

  it("migration up on an empty database succeeds", () => {
    migrate("up");
  });

  it("migration down then up succeeds cleanly", () => {
    migrate("down");
    migrate("up");
  });

  it("rejects duplicate block hashes", async () => {
    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO blocks (
               number, hash, parent_hash, timestamp, validator_address, gas_used, gas_limit
             ) VALUES
               (2, '0xdup', '0xparent', NOW(), '0xvalidator', 0, 0),
               (3, '0xdup', '0xparent', NOW(), '0xvalidator', 0, 0)`,
          ),
        ),
      /duplicate key|unique/i,
    );
  });

  it("stores gold_supply token_id 1 and 2 as separate rows", async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO gold_supply (token_id, supply) VALUES (1, 100), (2, 200)`,
      );

      const { rows } = await client.query(
        `SELECT token_id, supply FROM gold_supply ORDER BY token_id`,
      );

      assert.deepEqual(rows, [
        { token_id: "1", supply: "100" },
        { token_id: "2", supply: "200" },
      ]);
    });
  });

  it("rejects duplicate gold_supply token_id", async () => {
    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO gold_supply (token_id, supply) VALUES (1, 999)`,
          ),
        ),
      /duplicate key|unique/i,
    );
  });

  it("allows token_balances for GOLD token_id 1 and 2 on the same address", async () => {
    const { goldContract, holder } = await seedChainFixture();

    await withClient(async (client) => {
      await client.query(
        `INSERT INTO token_balances (address, contract_address, token_id, balance)
         VALUES ($1, $2, 1, 10), ($1, $2, 2, 20)`,
        [holder, goldContract],
      );

      const { rows } = await client.query(
        `SELECT token_id, balance
         FROM token_balances
         WHERE address = $1 AND contract_address = $2
         ORDER BY token_id`,
        [holder, goldContract],
      );

      assert.deepEqual(rows, [
        { token_id: "1", balance: "10" },
        { token_id: "2", balance: "20" },
      ]);
    });
  });

  it("rejects duplicate token_balances triple", async () => {
    const { goldContract, holder } = await seedChainFixture();

    await assert.rejects(
      () =>
        withClient(async (client) => {
          await client.query(
            `INSERT INTO token_balances (address, contract_address, token_id, balance)
             VALUES ($1, $2, 1, 1)`,
            [holder, goldContract],
          );
          await client.query(
            `INSERT INTO token_balances (address, contract_address, token_id, balance)
             VALUES ($1, $2, 1, 2)`,
            [holder, goldContract],
          );
        }),
      /duplicate key|unique/i,
    );
  });

  it("rejects erc1155 token_transfers without token_id", async () => {
    const { goldContract, blockNumber, txHash, fromAddress, holder } =
      await seedChainFixture();

    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO token_transfers (
               block_number, transaction_hash, contract_address, from_address,
               to_address, token_standard, token_id, amount, log_index
             ) VALUES ($1, $2, $3, $4, $5, 'erc1155', NULL, 1, 0)`,
            [blockNumber, txHash, goldContract, fromAddress, holder],
          ),
        ),
      /token_transfers_erc1155_token_id_required|violates check constraint/i,
    );
  });

  it("rejects bridge_state values outside the locked enum", async () => {
    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO bridge_transfers (
               route_asset, root_amount, child_amount, bridge_state, direction,
               source_layer, amount_exact
             ) VALUES ('paxg', 1, 1, 'burned', 'deposit', 'ethereum', true)`,
          ),
        ),
      /invalid input value for enum goldchain_bridge_state/i,
    );
  });

  it("rejects route_asset values outside the locked enum", async () => {
    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO bridge_transfers (
               route_asset, root_amount, child_amount, bridge_state, direction,
               source_layer, amount_exact
             ) VALUES ('weth', 1, 1, 'locked', 'deposit', 'ethereum', true)`,
          ),
        ),
      /invalid input value for enum route_asset/i,
    );
  });

  it("accepts all locked bridge_state and route_asset enum values", async () => {
    await withClient(async (client) => {
      const bridgeStates = [
        "locked",
        "synced",
        "minted_or_credited",
        "burned_or_debited",
        "released",
      ] as const;

      for (const bridgeState of bridgeStates) {
        await client.query(
          `INSERT INTO bridge_transfers (
             route_asset, root_amount, child_amount, bridge_state, direction,
             source_layer, amount_exact
           ) VALUES ('paxg', 1, 1, $1, 'deposit', 'ethereum', true)`,
          [bridgeState],
        );
      }

      await client.query(
        `INSERT INTO bridge_transfers (
           route_asset, root_amount, child_amount, bridge_state, direction,
           source_layer, amount_exact
         ) VALUES ('xaut', 1, 1, 'locked', 'exit', 'gold_chain', false)`,
      );

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM bridge_transfers`,
      );
      assert.equal(rows[0]?.count, 6);
    });
  });

  it("uses DATABASE_URL for postgres tests", () => {
    assert.match(DATABASE_URL, /goldscan_v2_test/);
  });
});
