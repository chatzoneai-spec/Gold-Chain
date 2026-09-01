import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";

export async function handleStatsModule(
  action: string,
  _params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "txcount":
      return txCount(ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function txCount(ctx: ApiContext) {
  const { rows } = await ctx.pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM transactions
     WHERE finality_status <> 'reverted'`,
  );
  return ok(rows[0]?.count ?? "0");
}
