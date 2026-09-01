import type pg from "pg";
import { finalityStatusForBlock, type FinalityStatus } from "./finality.js";
import type {
  BlockRow,
  InternalTxRow,
  LogRow,
  ReceiptRow,
  TokenTransferRow,
  TransactionRow,
} from "./writer-types.js";

type Client = pg.PoolClient;

export async function ensureAddress(client: Client, address: string): Promise<void> {
  await client.query(
    `INSERT INTO addresses (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`,
    [address],
  );
}

export async function upsertBlock(client: Client, row: BlockRow): Promise<void> {
  await client.query(
    `INSERT INTO blocks (
       number, hash, parent_hash, timestamp, validator_address, gas_used, gas_limit, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (number) DO UPDATE SET
       hash = EXCLUDED.hash,
       parent_hash = EXCLUDED.parent_hash,
       timestamp = EXCLUDED.timestamp,
       validator_address = EXCLUDED.validator_address,
       gas_used = EXCLUDED.gas_used,
       gas_limit = EXCLUDED.gas_limit,
       finality_status = EXCLUDED.finality_status`,
    [
      row.number,
      row.hash,
      row.parentHash,
      row.timestamp,
      row.validatorAddress,
      row.gasUsed.toString(),
      row.gasLimit.toString(),
      row.finalityStatus,
    ],
  );
}

export async function markEvmDerivedRowsReverted(
  client: Client,
  blockNumber: number,
): Promise<void> {
  await client.query(
    `UPDATE transactions SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE logs SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE internal_txs SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE token_transfers SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
}

export async function clearEvmDerivedRowsForBlock(
  client: Client,
  blockNumber: number,
): Promise<void> {
  await client.query(`DELETE FROM token_transfers WHERE block_number = $1`, [blockNumber]);
  await client.query(`DELETE FROM internal_txs WHERE block_number = $1`, [blockNumber]);
  await client.query(`DELETE FROM logs WHERE block_number = $1`, [blockNumber]);
  await client.query(
    `DELETE FROM receipts WHERE transaction_hash IN (
       SELECT hash FROM transactions WHERE block_number = $1
     )`,
    [blockNumber],
  );
}

export async function markOrphanedTransactionsReverted(
  client: Client,
  blockNumber: number,
  activeTxHashes: string[],
): Promise<void> {
  if (activeTxHashes.length === 0) {
    await client.query(
      `UPDATE transactions SET finality_status = 'reverted' WHERE block_number = $1`,
      [blockNumber],
    );
    return;
  }

  await client.query(
    `UPDATE transactions SET finality_status = 'reverted'
     WHERE block_number = $1 AND NOT (hash = ANY($2::text[]))`,
    [blockNumber, activeTxHashes],
  );
}

export async function upsertTransaction(
  client: Client,
  row: TransactionRow,
): Promise<void> {
  await ensureAddress(client, row.fromAddress);
  if (row.toAddress) {
    await ensureAddress(client, row.toAddress);
  }

  await client.query(
    `INSERT INTO transactions (
       hash, block_number, from_address, to_address, value, gas, gas_price,
       max_fee_per_gas, max_priority_fee_per_gas, input, nonce, transaction_index,
       status, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (hash) DO UPDATE SET
       block_number = EXCLUDED.block_number,
       from_address = EXCLUDED.from_address,
       to_address = EXCLUDED.to_address,
       value = EXCLUDED.value,
       gas = EXCLUDED.gas,
       gas_price = EXCLUDED.gas_price,
       max_fee_per_gas = EXCLUDED.max_fee_per_gas,
       max_priority_fee_per_gas = EXCLUDED.max_priority_fee_per_gas,
       input = EXCLUDED.input,
       nonce = EXCLUDED.nonce,
       transaction_index = EXCLUDED.transaction_index,
       status = EXCLUDED.status,
       finality_status = EXCLUDED.finality_status`,
    [
      row.hash,
      row.blockNumber,
      row.fromAddress,
      row.toAddress,
      row.value,
      row.gas.toString(),
      row.gasPrice,
      row.maxFeePerGas,
      row.maxPriorityFeePerGas,
      row.input,
      row.nonce.toString(),
      row.transactionIndex,
      row.status,
      row.finalityStatus,
    ],
  );
}

export async function upsertReceipt(client: Client, row: ReceiptRow): Promise<void> {
  await client.query(
    `INSERT INTO receipts (
       transaction_hash, cumulative_gas_used, gas_used, contract_address, status, logs_bloom
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (transaction_hash) DO UPDATE SET
       cumulative_gas_used = EXCLUDED.cumulative_gas_used,
       gas_used = EXCLUDED.gas_used,
       contract_address = EXCLUDED.contract_address,
       status = EXCLUDED.status,
       logs_bloom = EXCLUDED.logs_bloom`,
    [
      row.transactionHash,
      row.cumulativeGasUsed.toString(),
      row.gasUsed.toString(),
      row.contractAddress,
      row.status,
      row.logsBloom,
    ],
  );
}

export async function upsertLog(client: Client, row: LogRow): Promise<void> {
  await ensureAddress(client, row.address);
  await client.query(
    `INSERT INTO logs (
       transaction_hash, block_number, address, topics, data, log_index, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.transactionHash,
      row.blockNumber,
      row.address,
      row.topics,
      row.data,
      row.logIndex,
      row.finalityStatus,
    ],
  );
}

export async function upsertInternalTx(
  client: Client,
  row: InternalTxRow,
): Promise<void> {
  await ensureAddress(client, row.fromAddress);
  if (row.toAddress) {
    await ensureAddress(client, row.toAddress);
  }

  await client.query(
    `INSERT INTO internal_txs (
       transaction_hash, block_number, from_address, to_address, value, type,
       trace_address, error, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.transactionHash,
      row.blockNumber,
      row.fromAddress,
      row.toAddress,
      row.value,
      row.type,
      row.traceAddress,
      row.error,
      row.finalityStatus,
    ],
  );
}

export async function upsertContract(
  client: Client,
  address: string,
  bytecode: string | null = null,
): Promise<void> {
  await ensureAddress(client, address);
  await client.query(
    `INSERT INTO contracts (address, bytecode) VALUES ($1, $2)
     ON CONFLICT (address) DO UPDATE SET bytecode = COALESCE(EXCLUDED.bytecode, contracts.bytecode)`,
    [address, bytecode],
  );
}

export async function upsertTokenContract(
  client: Client,
  address: string,
  type: "erc20" | "erc721" | "erc1155",
  name: string | null = null,
  symbol: string | null = null,
  decimals: number | null = null,
): Promise<void> {
  await upsertContract(client, address);
  await client.query(
    `INSERT INTO token_contracts (address, type, name, symbol, decimals)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (address) DO UPDATE SET
       type = EXCLUDED.type,
       name = COALESCE(EXCLUDED.name, token_contracts.name),
       symbol = COALESCE(EXCLUDED.symbol, token_contracts.symbol),
       decimals = COALESCE(EXCLUDED.decimals, token_contracts.decimals)`,
    [address, type, name, symbol, decimals],
  );
}

export async function upsertTokenTransfer(
  client: Client,
  row: TokenTransferRow,
): Promise<void> {
  await ensureAddress(client, row.fromAddress);
  await ensureAddress(client, row.toAddress);
  await upsertTokenContract(client, row.contractAddress, row.tokenStandard);

  await client.query(
    `INSERT INTO token_transfers (
       block_number, transaction_hash, contract_address, from_address, to_address,
       token_standard, token_id, amount, log_index, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (transaction_hash, log_index, token_id) DO UPDATE SET
       block_number = EXCLUDED.block_number,
       contract_address = EXCLUDED.contract_address,
       from_address = EXCLUDED.from_address,
       to_address = EXCLUDED.to_address,
       token_standard = EXCLUDED.token_standard,
       amount = EXCLUDED.amount,
       finality_status = EXCLUDED.finality_status`,
    [
      row.blockNumber,
      row.transactionHash,
      row.contractAddress,
      row.fromAddress,
      row.toAddress,
      row.tokenStandard,
      row.tokenId,
      row.amount,
      row.logIndex,
      row.finalityStatus,
    ],
  );
}

export async function updateEvmFinalityForBlock(
  client: Client,
  blockNumber: number,
  status: FinalityStatus,
): Promise<void> {
  await client.query(
    `UPDATE blocks SET finality_status = $1 WHERE number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE transactions SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE logs SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE internal_txs SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE token_transfers SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
}

export function finalityStatusForBlockNumber(
  blockNumber: number,
  headNumber: number,
  revertedFrom: number | null,
): FinalityStatus {
  const reorged = revertedFrom !== null && blockNumber >= revertedFrom;
  return reorged
    ? "reverted"
    : finalityStatusForBlock({ blockNumber, headNumber });
}

export async function getBlockHashAtNumber(
  client: Client,
  blockNumber: number,
): Promise<string | null> {
  const { rows } = await client.query<{ hash: string; finality_status: string }>(
    `SELECT hash, finality_status FROM blocks WHERE number = $1`,
    [blockNumber],
  );
  const row = rows[0];
  if (!row || row.finality_status === "reverted") {
    return null;
  }
  return row.hash;
}
