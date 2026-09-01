import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";

export async function handleTokenModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "tokeninfo":
      return tokenInfo(params, ctx);
    case "getToken":
      return tokenInfo(params, ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
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
  return ok([
    {
      contractAddress: row.address,
      tokenType: row.type,
      tokenName: row.name ?? "",
      symbol: row.symbol ?? "",
      divisor: row.decimals === null ? "" : String(row.decimals),
      totalSupply: "",
    },
  ]);
}
