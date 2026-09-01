import { requireHexAddress, requireHexHash } from "../validate.js";
import type { ApiContext } from "./types.js";
import { empty, notOk, ok } from "./response.js";
import { parsePagination, sqlLimitOffset } from "./pagination.js";

function requireAddress(params: URLSearchParams): string {
  return requireHexAddress(params.get("address"), "address");
}

function parseBlockRange(params: URLSearchParams): { start: number; end: number } {
  const start = parseBlockParam(params.get("startblock"), 0);
  const end = parseBlockParam(params.get("endblock"), 99999999);
  return { start, end };
}

function parseBlockParam(value: string | null, defaultValue: number): number {
  if (value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function sortOrder(params: URLSearchParams): "ASC" | "DESC" {
  return params.get("sort")?.toLowerCase() === "asc" ? "ASC" : "DESC";
}

export async function handleAccountModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "balance":
      return accountBalance(params, ctx);
    case "txlist":
      return accountTxList(params, ctx);
    case "txlistinternal":
      return accountInternalTxList(params, ctx);
    case "tokentx":
      return accountTokenTx(params, ctx, "erc20");
    case "tokennfttx":
      return accountTokenTx(params, ctx, "erc721");
    case "token1155tx":
      return accountTokenTx(params, ctx, "erc1155");
    case "addresstokenbalance":
      return addressTokenBalance(params, ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function addressTokenBalance(params: URLSearchParams, ctx: ApiContext) {
  const address = requireAddress(params);

  const { rows } = await ctx.pool.query(
    `SELECT tb.contract_address, tb.token_id::text AS token_id, tb.balance::text,
            tc.type AS token_standard
     FROM token_balances tb
     JOIN token_contracts tc ON tc.address = tb.contract_address
     WHERE tb.address = $1
       AND tb.balance <> 0
     ORDER BY tb.contract_address ASC, tb.token_id ASC`,
    [address],
  );

  if (rows.length === 0) {
    return empty("No token balances found");
  }

  return ok(
    rows.map((row) => ({
      contractAddress: row.contract_address,
      tokenID: row.token_id ?? "0",
      balance: row.balance,
      tokenStandard: row.token_standard,
    })),
  );
}

async function accountBalance(params: URLSearchParams, ctx: ApiContext) {
  const address = requireAddress(params);

  const { rows } = await ctx.pool.query(
    `SELECT gilt_balance::text AS balance FROM addresses WHERE address = $1`,
    [address],
  );

  if (rows.length === 0) {
    return ok("0");
  }

  return ok(rows[0]!.balance);
}

async function accountTxList(params: URLSearchParams, ctx: ApiContext) {
  const address = requireAddress(params);

  const { start, end } = parseBlockRange(params);
  const pagination = parsePagination(params);
  const { limit, offset } = sqlLimitOffset(pagination);
  const order = sortOrder(params);

  const { rows } = await ctx.pool.query(
    `SELECT t.hash, t.block_number, t.from_address, t.to_address, t.value::text,
            t.gas::text, t.gas_price::text, t.input, t.nonce::text,
            t.transaction_index, t.status, t.finality_status,
            b.hash AS block_hash, b.timestamp,
            r.cumulative_gas_used::text, r.gas_used::text, r.contract_address
     FROM transactions t
     JOIN blocks b ON b.number = t.block_number
     LEFT JOIN receipts r ON r.transaction_hash = t.hash
     WHERE t.finality_status <> 'reverted'
       AND b.finality_status <> 'reverted'
       AND t.block_number BETWEEN $1 AND $2
       AND (t.from_address = $3 OR t.to_address = $3)
     ORDER BY t.block_number ${order}, t.transaction_index ${order}
     LIMIT $4 OFFSET $5`,
    [start, end, address, limit, offset],
  );

  if (rows.length === 0) {
    return empty("No transactions found");
  }

  return ok(
    rows.map((row) => ({
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
    })),
  );
}

async function accountInternalTxList(params: URLSearchParams, ctx: ApiContext) {
  const address = requireAddress(params);

  const { start, end } = parseBlockRange(params);
  const pagination = parsePagination(params);
  const { limit, offset } = sqlLimitOffset(pagination);
  const order = sortOrder(params);

  const { rows } = await ctx.pool.query(
    `SELECT it.transaction_hash, it.block_number, it.from_address, it.to_address,
            it.value::text, it.type, it.trace_address, it.error, it.finality_status,
            b.timestamp
     FROM internal_txs it
     JOIN blocks b ON b.number = it.block_number
     WHERE it.finality_status <> 'reverted'
       AND b.finality_status <> 'reverted'
       AND it.block_number BETWEEN $1 AND $2
       AND (it.from_address = $3 OR it.to_address = $3)
     ORDER BY it.block_number ${order}, it.id ${order}
     LIMIT $4 OFFSET $5`,
    [start, end, address, limit, offset],
  );

  if (rows.length === 0) {
    return empty("No internal transactions found");
  }

  return ok(
    rows.map((row) => ({
      blockNumber: String(row.block_number),
      timeStamp: String(Math.floor(new Date(row.timestamp).getTime() / 1000)),
      hash: row.transaction_hash,
      from: row.from_address,
      to: row.to_address ?? "",
      value: row.value,
      type: row.type ?? "call",
      traceId: row.trace_address ?? "",
      isError: row.error ? "1" : "0",
      errCode: row.error ?? "",
      finalityStatus: row.finality_status,
    })),
  );
}

async function accountTokenTx(
  params: URLSearchParams,
  ctx: ApiContext,
  standard: "erc20" | "erc721" | "erc1155",
) {
  const txhashParam = params.get("txhash")?.trim().toLowerCase();
  const contractAddress = params.get("contractaddress")?.trim().toLowerCase();
  let address: string | null = null;
  if (txhashParam) {
    requireHexHash(txhashParam, "txhash");
  } else if (contractAddress && !params.get("address")) {
    address = null;
  } else {
    address = requireAddress(params);
  }
  const { start, end } = parseBlockRange(params);
  const pagination = parsePagination(params);
  const { limit, offset } = sqlLimitOffset(pagination);
  const order = sortOrder(params);

  const values: unknown[] = [start, end, standard, limit, offset];
  const filters = [
    "tt.finality_status <> 'reverted'",
    "b.finality_status <> 'reverted'",
    "tt.token_standard = $3",
    "tt.block_number BETWEEN $1 AND $2",
  ];

  if (address) {
    values.push(address);
    filters.push(`(tt.from_address = $${values.length} OR tt.to_address = $${values.length})`);
  }

  if (txhashParam) {
    values.push(txhashParam);
    filters.push(`tt.transaction_hash = $${values.length}`);
  }

  if (contractAddress) {
    values.push(contractAddress);
    filters.push(`tt.contract_address = $${values.length}`);
  } else if (!address && !txhashParam) {
    return notOk("Missing address, txhash, or contractaddress parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT tt.block_number, tt.transaction_hash, tt.contract_address,
            tt.from_address, tt.to_address, tt.token_id::text, tt.amount::text,
            tt.log_index, tt.finality_status, b.timestamp,
            tc.name, tc.symbol, tc.decimals
     FROM token_transfers tt
     JOIN blocks b ON b.number = tt.block_number
     JOIN token_contracts tc ON tc.address = tt.contract_address
     WHERE ${filters.join(" AND ")}
     ORDER BY tt.block_number ${order}, tt.log_index ${order}
     LIMIT $4 OFFSET $5`,
    values,
  );

  if (rows.length === 0) {
    return empty("No token transfers found");
  }

  return ok(
    rows.map((row) => ({
      blockNumber: String(row.block_number),
      timeStamp: String(Math.floor(new Date(row.timestamp).getTime() / 1000)),
      hash: row.transaction_hash,
      nonce: "0",
      blockHash: "",
      from: row.from_address,
      contractAddress: row.contract_address,
      to: row.to_address,
      value: row.amount,
      tokenName: row.name ?? "",
      tokenSymbol: row.symbol ?? "",
      tokenDecimal: row.decimals === null ? "" : String(row.decimals),
      transactionIndex: String(row.log_index),
      gas: "0",
      gasPrice: "0",
      gasUsed: "0",
      cumulativeGasUsed: "0",
      tokenID: row.token_id ?? "",
      finalityStatus: row.finality_status,
    })),
  );
}
