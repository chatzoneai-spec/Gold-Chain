import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";

const GOLD_CONTRACT = "0x000000000000000000000000000000000000f001";

async function erc20Supply(ctx: ApiContext, contractAddress: string): Promise<string> {
  const { rows } = await ctx.pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(balance), 0)::text AS total
     FROM token_balances
     WHERE contract_address = $1
       AND token_id = 0`,
    [contractAddress],
  );
  return rows[0]?.total ?? "0";
}

async function erc721Supply(ctx: ApiContext, contractAddress: string): Promise<string> {
  const { rows } = await ctx.pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM token_balances
     WHERE contract_address = $1
       AND balance > 0`,
    [contractAddress],
  );
  return rows[0]?.count ?? "0";
}

async function goldSupplyForId(
  ctx: ApiContext,
  tokenId: string,
): Promise<string> {
  const { rows } = await ctx.pool.query<{ supply: string }>(
    `SELECT supply::text AS supply FROM gold_supply WHERE token_id = $1`,
    [tokenId],
  );
  return rows[0]?.supply ?? "0";
}

export async function resolveTotalSupply(
  ctx: ApiContext,
  contractAddress: string,
  tokenType: string,
  tokenidParam: string | null,
): Promise<string | Array<{ tokenId: string; totalSupply: string }>> {
  if (tokenType === "erc1155" && contractAddress === GOLD_CONTRACT) {
    if (tokenidParam !== null && tokenidParam !== "") {
      const tokenId = tokenidParam;
      return await goldSupplyForId(ctx, tokenId);
    }
    const [supply1, supply2] = await Promise.all([
      goldSupplyForId(ctx, "1"),
      goldSupplyForId(ctx, "2"),
    ]);
    return [
      { tokenId: "1", totalSupply: supply1 },
      { tokenId: "2", totalSupply: supply2 },
    ];
  }

  if (tokenType === "erc1155" && tokenidParam) {
    const { rows } = await ctx.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(balance), 0)::text AS total
       FROM token_balances
       WHERE contract_address = $1
         AND token_id = $2`,
      [contractAddress, tokenidParam],
    );
    return rows[0]?.total ?? "0";
  }

  if (tokenType === "erc20") {
    return erc20Supply(ctx, contractAddress);
  }

  if (tokenType === "erc721") {
    return erc721Supply(ctx, contractAddress);
  }

  return "0";
}

export function formatTokenInfoRow(
  row: Record<string, unknown>,
  totalSupply: string | Array<{ tokenId: string; totalSupply: string }>,
) {
  const base = {
    contractAddress: row.address,
    tokenType: row.type,
    tokenName: row.name ?? "",
    symbol: row.symbol ?? "",
    divisor: row.decimals === null ? "" : String(row.decimals),
  };

  if (Array.isArray(totalSupply)) {
    return { ...base, totalSupply };
  }

  return { ...base, totalSupply };
}

export { notOk, ok };
