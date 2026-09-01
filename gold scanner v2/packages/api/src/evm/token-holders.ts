import type { ApiContext } from "./types.js";
import { empty, notOk, ok } from "./response.js";

const GOLD_CONTRACT = "0x000000000000000000000000000000000000f001";

type HolderRow = {
  address: string;
  balance: string;
  tokenId?: string;
};

async function fetchHolders(
  ctx: ApiContext,
  contractAddress: string,
  tokenId: number | null,
): Promise<HolderRow[]> {
  const values: unknown[] = [contractAddress];
  let tokenFilter = "";
  if (tokenId !== null) {
    values.push(tokenId);
    tokenFilter = "AND token_id = $2";
  }

  const { rows } = await ctx.pool.query(
    `SELECT address, token_id::text AS token_id, balance::text AS balance
     FROM token_balances
     WHERE contract_address = $1
       AND balance <> 0
       ${tokenFilter}
     ORDER BY balance DESC, address ASC`,
    values,
  );

  return rows.map((row) => ({
    address: String(row.address),
    balance: String(row.balance),
    ...(row.token_id !== null && row.token_id !== undefined
      ? { tokenId: String(row.token_id) }
      : {}),
  }));
}

export async function tokenHolderList(params: URLSearchParams, ctx: ApiContext) {
  const contractaddress = params.get("contractaddress")?.trim().toLowerCase();
  if (!contractaddress) {
    return notOk("Missing contractaddress parameter");
  }

  const { rows: tokenRows } = await ctx.pool.query(
    `SELECT type FROM token_contracts WHERE address = $1`,
    [contractaddress],
  );

  if (tokenRows.length === 0) {
    return notOk("Invalid contract address");
  }

  const tokenType = String(tokenRows[0]!.type);
  const tokenidParam = params.get("tokenid");

  if (tokenType === "erc1155" && contractaddress === GOLD_CONTRACT) {
    if (tokenidParam === null || tokenidParam === "") {
      const [id1, id2] = await Promise.all([
        fetchHolders(ctx, contractaddress, 1),
        fetchHolders(ctx, contractaddress, 2),
      ]);
      return ok({ id1, id2 });
    }

    const tokenId = parseInt(tokenidParam, 10);
    if (Number.isNaN(tokenId) || (tokenId !== 1 && tokenId !== 2)) {
      return notOk("GOLD tokenid must be 1 or 2");
    }
    const holders = await fetchHolders(ctx, contractaddress, tokenId);
    return holders.length === 0 ? empty("No holders found") : ok(holders);
  }

  if (tokenidParam !== null && tokenidParam !== "") {
    const tokenId = parseInt(tokenidParam, 10);
    if (Number.isNaN(tokenId)) {
      return notOk("Invalid tokenid");
    }
    const holders = await fetchHolders(ctx, contractaddress, tokenId);
    return holders.length === 0 ? empty("No holders found") : ok(holders);
  }

  const defaultTokenId = tokenType === "erc20" ? 0 : null;
  const holders = await fetchHolders(ctx, contractaddress, defaultTokenId);
  return holders.length === 0 ? empty("No holders found") : ok(holders);
}
