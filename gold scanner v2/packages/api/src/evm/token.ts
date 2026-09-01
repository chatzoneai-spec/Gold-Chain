import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";
import { tokenHolderList } from "./token-holders.js";
import {
  formatTokenInfoRow,
  resolveTotalSupply,
} from "./token-supply.js";

export async function handleTokenModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "tokeninfo":
      return tokenInfo(params, ctx);
    case "gettoken":
      return tokenInfo(params, ctx);
    case "tokenholderlist":
      return tokenHolderList(params, ctx);
    case "tokenlist":
      return tokenList(ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function tokenList(ctx: ApiContext) {
  const { rows } = await ctx.pool.query(
    `SELECT address, type, name, symbol, decimals
     FROM token_contracts
     ORDER BY address ASC`,
  );

  if (rows.length === 0) {
    return empty("No tokens found");
  }

  return ok(
    rows.map((row) => ({
      contractAddress: row.address,
      tokenType: row.type,
      tokenName: row.name ?? "",
      symbol: row.symbol ?? "",
      divisor: row.decimals === null ? "" : String(row.decimals),
    })),
  );
}

async function tokenInfo(params: URLSearchParams, ctx: ApiContext) {
  const contractaddress = params
    .get("contractaddress")
    ?.trim()
    .toLowerCase();
  if (!contractaddress) {
    return notOk("Missing contractaddress parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT tc.address, tc.type, tc.name, tc.symbol, tc.decimals
     FROM token_contracts tc
     WHERE tc.address = $1`,
    [contractaddress],
  );

  if (rows.length === 0) {
    return notOk("Invalid contract address");
  }

  const row = rows[0]!;
  const tokenidParam = params.get("tokenid");
  const totalSupply = await resolveTotalSupply(
    ctx,
    contractaddress,
    String(row.type),
    tokenidParam,
  );

  return ok([formatTokenInfoRow(row, totalSupply)]);
}
