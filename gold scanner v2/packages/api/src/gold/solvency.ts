import type pg from "pg";
import type { SolvencyResult } from "./types.js";

type Client = pg.PoolClient | pg.Pool;

const LOCKED_SUM_SQL = `
  SELECT COALESCE(SUM(root_amount::numeric), 0)::text AS total
  FROM bridge_transfers
  WHERE route_asset = $1
    AND bridge_state = 'locked'
    AND finality_status = 'finalized'
    AND source_layer = 'ethereum'
`;

const SUPPLY_SQL = `
  SELECT COALESCE(supply::text, '0') AS supply
  FROM gold_supply
  WHERE token_id = $1
`;

async function lockedTotal(
  client: Client,
  routeAsset: "paxg" | "xaut",
): Promise<string> {
  const { rows } = await client.query<{ total: string }>(LOCKED_SUM_SQL, [
    routeAsset,
  ]);
  return rows[0]?.total ?? "0";
}

async function goldSupply(client: Client, tokenId: string): Promise<string> {
  const { rows } = await client.query<{ supply: string }>(SUPPLY_SQL, [
    tokenId,
  ]);
  return rows[0]?.supply ?? "0";
}

/** Single owner for solvency math — reads finalized canonical rows only. */
export async function computeSolvency(client: Client): Promise<SolvencyResult> {
  const [paxgLocked, xautLocked, goldId1, goldId2] = await Promise.all([
    lockedTotal(client, "paxg"),
    lockedTotal(client, "xaut"),
    goldSupply(client, "1"),
    goldSupply(client, "2"),
  ]);

  return {
    paxg: {
      routeAsset: "paxg",
      goldTokenId: "1",
      lockedOnEthereum: paxgLocked,
      goldSupply: goldId1,
    },
    xaut: {
      routeAsset: "xaut",
      goldTokenId: "2",
      lockedOnEthereum: xautLocked,
      goldSupply: goldId2,
    },
  };
}
