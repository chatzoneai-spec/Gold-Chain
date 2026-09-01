import type pg from "pg";

export const ADDR_A = "0x0000000000000000000000000000000000000a01";
export const ADDR_B = "0x0000000000000000000000000000000000000b02";
export const ADDR_C = "0x000000000000000000000000000000000000c001";
export const ADDR_D = "0x0000000000000000000000000000000000000d01";
export const ADDR_E = "0x0000000000000000000000000000000000000e02";
export const TOKEN_ERC20 = "0x000000000000000000000000000000000000e201";
export const TOKEN_ERC721 = "0x000000000000000000000000000000000000e701";
export const BLOCK_1_HASH =
  "0xblock000000000000000000000000000000000000000000000000000000000001";
export const BLOCK_2_HASH =
  "0xblock000000000000000000000000000000000000000000000000000000000002";
export const TX_1 =
  "0xtx00000000000000000000000000000000000000000000000000000000000001";
export const TX_2 =
  "0xtx00000000000000000000000000000000000000000000000000000000000002";
export const TX_3 =
  "0xtx00000000000000000000000000000000000000000000000000000000000003";
export const TX_4 =
  "0xtx00000000000000000000000000000000000000000000000000000000000004";
export const TOPIC_0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export async function seedApiFixture(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO blocks (number, hash, parent_hash, timestamp, validator_address, gas_used, gas_limit, finality_status)
     VALUES
       (1, $1, '0x00', '2024-01-01T00:00:00Z', '0xval01', 21000, 30000000, 'finalized'),
       (2, $2, $1, '2024-01-01T00:00:01Z', '0xval01', 42000, 30000000, 'pending')`,
    [BLOCK_1_HASH, BLOCK_2_HASH],
  );

  await client.query(
    `INSERT INTO transactions
       (hash, block_number, from_address, to_address, value, gas, gas_price, input, nonce, transaction_index, status, finality_status)
     VALUES
       ($1, 1, $3, $4, 100, 21000, 1000000000, '0x', 0, 0, 1, 'finalized'),
       ($2, 2, $3, $4, 0, 50000, 1000000000, '0xdead', 1, 0, 1, 'pending'),
       ($5, 2, $6, $4, 0, 50000, 1000000000, '0x', 2, 1, 0, 'pending'),
       ($7, 2, $8, $9, 0, 50000, 1000000000, '0x', 3, 1, 1, 'pending')`,
    [TX_1, TX_2, ADDR_A, ADDR_B, TX_3, ADDR_C, TX_4, ADDR_D, ADDR_E],
  );

  await client.query(
    `INSERT INTO receipts (transaction_hash, cumulative_gas_used, gas_used, contract_address, status, logs_bloom)
     VALUES
       ($1, 21000, 21000, NULL, 1, '0x'),
       ($2, 42000, 21000, NULL, 1, '0x'),
       ($3, 63000, 21000, NULL, 0, '0x'),
       ($4, 84000, 21000, NULL, 1, '0x')`,
    [TX_1, TX_2, TX_3, TX_4],
  );

  await client.query(
    `INSERT INTO logs (transaction_hash, block_number, address, topics, data, log_index, finality_status)
     VALUES
       ($1, 2, $2, ARRAY[$3], '0x', 0, 'pending'),
       ($4, 2, $5, ARRAY[$3], '0x', 0, 'pending')`,
    [TX_2, TOKEN_ERC20, TOPIC_0, TX_4, TOKEN_ERC721],
  );

  await client.query(
    `INSERT INTO internal_txs
       (transaction_hash, block_number, from_address, to_address, value, type, trace_address, error, finality_status)
     VALUES
       ($1, 1, $2, $3, 50, 'call', '0', NULL, 'finalized')`,
    [TX_1, ADDR_A, ADDR_B],
  );

  await client.query(
    `INSERT INTO addresses (address, gilt_balance) VALUES
       ($1, 1000000000000000000),
       ($2, 0),
       ($3, 0),
       ($4, 0),
       ($5, 0),
       ('0xval01', 0),
       ($6, 0),
       ($7, 0)`,
    [ADDR_A, ADDR_B, ADDR_C, TOKEN_ERC20, TOKEN_ERC721, ADDR_D, ADDR_E],
  );

  await client.query(
    `INSERT INTO contracts (address, bytecode, is_verified, compiler_version, optimization_enabled, optimization_runs, evm_version)
     VALUES
       ($1, '0x6000', true, 'v0.8.20', true, 200, 'paris'),
       ($2, '0x6001', false, NULL, NULL, NULL, NULL),
       ($3, '0x6002', false, NULL, NULL, NULL, NULL)`,
    [ADDR_C, TOKEN_ERC20, TOKEN_ERC721],
  );

  await client.query(
    `INSERT INTO token_contracts (address, type, name, symbol, decimals) VALUES
       ($1, 'erc20', 'Test Gold', 'TGOLD', 18),
       ($2, 'erc721', 'Test NFT', 'TNFT', NULL)`,
    [TOKEN_ERC20, TOKEN_ERC721],
  );

  await client.query(
    `INSERT INTO token_transfers
       (block_number, transaction_hash, contract_address, from_address, to_address, token_standard, token_id, amount, log_index, finality_status)
     VALUES
       (2, $1, $2, $3, $4, 'erc20', NULL, 1000, 0, 'pending'),
       (2, $5, $6, $7, $4, 'erc721', 7, 1, 0, 'pending')`,
    [TX_2, TOKEN_ERC20, ADDR_A, ADDR_B, TX_4, TOKEN_ERC721, ADDR_D],
  );
}
