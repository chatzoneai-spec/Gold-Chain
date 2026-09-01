import type { ApiContext } from "./types.js";
import { empty, notOk, ok } from "./response.js";
import { parsePagination, sqlLimitOffset } from "./pagination.js";

function parseBlockParam(value: string | null, defaultValue: number): number {
  if (value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export async function handleLogsModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  if (action.toLowerCase() !== "getlogs") {
    return notOk(`Unknown action: ${action}`);
  }

  const address = params.get("address")?.trim().toLowerCase();
  const fromBlock = parseBlockParam(params.get("fromBlock"), 0);
  const toBlock = parseBlockParam(params.get("toBlock"), 99999999);
  const pagination = parsePagination(params);
  const { limit, offset } = sqlLimitOffset(pagination);

  const values: unknown[] = [fromBlock, toBlock];
  const filters: string[] = [];

  if (address) {
    values.push(address);
    filters.push(`AND l.address = $${values.length}`);
  }

  for (let index = 0; index < 4; index += 1) {
    const topic = params.get(`topic${index}`);
    if (topic) {
      values.push(topic.toLowerCase());
      filters.push(`AND l.topics[${index + 1}] = $${values.length}`);
    }
  }

  values.push(limit, offset);
  const limitParam = values.length - 1;
  const offsetParam = values.length;

  const { rows } = await ctx.pool.query(
    `SELECT l.transaction_hash, l.block_number, l.address, l.topics, l.data,
            l.log_index, l.finality_status
     FROM logs l
     JOIN blocks b ON b.number = l.block_number
     WHERE l.finality_status <> 'reverted'
       AND b.finality_status <> 'reverted'
       AND l.block_number BETWEEN $1 AND $2
       ${filters.join("\n       ")}
     ORDER BY l.block_number ASC, l.log_index ASC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values,
  );

  if (rows.length === 0) {
    return empty("No logs found");
  }

  return ok(
    rows.map((row) => ({
      transactionHash: row.transaction_hash,
      blockNumber: String(row.block_number),
      address: row.address,
      topics: row.topics,
      data: row.data,
      logIndex: String(row.log_index),
      finalityStatus: row.finality_status,
    })),
  );
}
