import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";

export async function handleTransactionModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "gettxreceiptstatus":
      return getTxReceiptStatus(params, ctx);
    case "getstatus":
      return getTxStatus(params, ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function getTxReceiptStatus(params: URLSearchParams, ctx: ApiContext) {
  const txhash = params.get("txhash")?.trim().toLowerCase();
  if (!txhash) {
    return notOk("Missing txhash parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT t.status, t.finality_status
     FROM transactions t
     WHERE t.hash = $1 AND t.finality_status <> 'reverted'`,
    [txhash],
  );

  if (rows.length === 0) {
    return notOk("Unable to locate Transaction Hash");
  }

  return ok({
    status: rows[0]!.status === 1 ? "1" : "0",
    finalityStatus: rows[0]!.finality_status,
  });
}

async function getTxStatus(params: URLSearchParams, ctx: ApiContext) {
  const txhash = params.get("txhash")?.trim().toLowerCase();
  if (!txhash) {
    return notOk("Missing txhash parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT t.status, t.finality_status, t.block_number
     FROM transactions t
     WHERE t.hash = $1 AND t.finality_status <> 'reverted'`,
    [txhash],
  );

  if (rows.length === 0) {
    return notOk("Unable to locate Transaction Hash");
  }

  const row = rows[0]!;
  return ok({
    isError: row.status === 1 ? "0" : "1",
    errDescription: row.status === 1 ? "" : "execution reverted",
    finalityStatus: row.finality_status,
    blockNumber: String(row.block_number),
  });
}

export async function handleBlockModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "getblockbynumber":
      return getBlockByNumber(params, ctx);
    case "getblockbyhash":
      return getBlockByHash(params, ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function getBlockByNumber(params: URLSearchParams, ctx: ApiContext) {
  const tag = params.get("tag") ?? params.get("blockno");
  if (!tag) {
    return notOk("Missing block number");
  }

  const blockNumber = tag === "latest" ? null : parseInt(tag, 10);
  const query =
    blockNumber === null
      ? `SELECT number, hash, parent_hash, timestamp, validator_address,
                gas_used::text, gas_limit::text, finality_status
         FROM blocks
         WHERE finality_status <> 'reverted'
         ORDER BY number DESC
         LIMIT 1`
      : `SELECT number, hash, parent_hash, timestamp, validator_address,
                gas_used::text, gas_limit::text, finality_status
         FROM blocks
         WHERE number = $1 AND finality_status <> 'reverted'`;

  const { rows } = await ctx.pool.query(
    query,
    blockNumber === null ? [] : [blockNumber],
  );

  if (rows.length === 0) {
    return notOk("Block not found");
  }

  return ok(formatBlock(rows[0]!));
}

async function getBlockByHash(params: URLSearchParams, ctx: ApiContext) {
  const hash = params.get("hash")?.trim().toLowerCase();
  if (!hash) {
    return notOk("Missing block hash");
  }

  const { rows } = await ctx.pool.query(
    `SELECT number, hash, parent_hash, timestamp, validator_address,
            gas_used::text, gas_limit::text, finality_status
     FROM blocks
     WHERE hash = $1 AND finality_status <> 'reverted'`,
    [hash],
  );

  if (rows.length === 0) {
    return notOk("Block not found");
  }

  return ok(formatBlock(rows[0]!));
}

function formatBlock(row: Record<string, unknown>) {
  return {
    number: String(row.number),
    hash: row.hash,
    parentHash: row.parent_hash,
    timestamp: String(Math.floor(new Date(String(row.timestamp)).getTime() / 1000)),
    validator: row.validator_address,
    gasUsed: row.gas_used,
    gasLimit: row.gas_limit,
    finalityStatus: row.finality_status,
  };
}

export async function getTransactionByHash(
  params: URLSearchParams,
  ctx: ApiContext,
) {
  const txhash = params.get("txhash")?.trim().toLowerCase();
  if (!txhash) {
    return notOk("Missing txhash parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT t.hash, t.block_number, t.from_address, t.to_address, t.value::text,
            t.gas::text, t.gas_price::text, t.input, t.nonce::text,
            t.transaction_index, t.status, t.finality_status,
            b.hash AS block_hash, b.timestamp,
            r.cumulative_gas_used::text, r.gas_used::text, r.contract_address
     FROM transactions t
     JOIN blocks b ON b.number = t.block_number
     LEFT JOIN receipts r ON r.transaction_hash = t.hash
     WHERE t.hash = $1 AND t.finality_status <> 'reverted'`,
    [txhash],
  );

  if (rows.length === 0) {
    return notOk("Unable to locate Transaction Hash");
  }

  const row = rows[0]!;
  return ok({
    blockNumber: String(row.block_number),
    timeStamp: String(Math.floor(new Date(row.timestamp).getTime() / 1000)),
    hash: row.hash,
    nonce: row.nonce,
    blockHash: row.block_hash,
    transactionIndex: String(row.transaction_index),
    from: row.from_address,
    to: row.to_address ?? "",
    value: row.value,
    gas: row.gas,
    gasPrice: row.gas_price ?? "0",
    isError: row.status === 1 ? "0" : "1",
    txreceipt_status: String(row.status),
    input: row.input,
    contractAddress: row.contract_address ?? "",
    cumulativeGasUsed: row.cumulative_gas_used ?? "0",
    gasUsed: row.gas_used ?? "0",
    finalityStatus: row.finality_status,
  });
}
