import type { ApiContext } from "./types.js";
import { empty, notOk, ok } from "./response.js";
import { formatTransactionRow, TX_SELECT_SQL } from "./tx-format.js";

export async function getBlockTxList(
  params: URLSearchParams,
  ctx: ApiContext,
) {
  const tag = params.get("blockno") ?? params.get("tag");
  if (!tag) {
    return notOk("Missing block number");
  }

  const blockNumber = tag === "latest" ? null : parseInt(tag, 10);
  if (blockNumber !== null && Number.isNaN(blockNumber)) {
    return notOk("Invalid block number");
  }

  const query =
    blockNumber === null
      ? `${TX_SELECT_SQL}
         WHERE t.finality_status <> 'reverted'
         ORDER BY t.block_number DESC, t.transaction_index DESC
         LIMIT 1`
      : `${TX_SELECT_SQL}
         WHERE t.block_number = $1
           AND t.finality_status <> 'reverted'
         ORDER BY t.transaction_index ASC`;

  const { rows } = await ctx.pool.query(
    query,
    blockNumber === null ? [] : [blockNumber],
  );

  if (rows.length === 0) {
    return empty("No transactions found");
  }

  return ok(rows.map((row) => formatTransactionRow(row)));
}
