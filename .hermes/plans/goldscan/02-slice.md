# Wave 2 — Indexer core (generic EVM)

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL/Elixir. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2`

## Outcome
Generic EVM indexer: one writer. Head-follower + backfill with missing-range tracker. Per-block fan-out jobs. Reorg handling via the existing finality owner. Fixture replay matches expected rows exactly. Reorg fixture replaces stale rows, no duplicates. Gap detector re-fetches a missing range.

## Repo map
- `packages/indexer/src/finality.ts` — already the sole finality owner. Import it. Do not reimplement.
- `packages/indexer/src/writer.ts` — the only function(s) that INSERT/UPDATE/DELETE chain-derived rows.
- `packages/indexer/src/head-follower.ts` — poll (or subscribe) the head from an RPC client interface.
- `packages/indexer/src/backfill.ts` — catchup + missing-range tracker.
- `packages/indexer/src/jobs/` — one job type per file:
  - `receipts.ts`
  - `logs.ts`
  - `internal-txs.ts`
  - `contract-detection.ts`
  - `token-transfers-erc20-721.ts` (Transfer topic only; no ERC1155 in this wave)
- Fixtures: `packages/indexer/fixtures/blocks.json` (recorded eth_* responses for a known range)
- Fixtures: `packages/indexer/fixtures/reorg.json` (a range then a competing parent that replaces a block)
- Fixtures: `packages/indexer/fixtures/gap.json` (a hole in numbers)
- Expected rows: `packages/indexer/fixtures/expected-rows.json`
- Tests: `packages/indexer/src/indexer-core.test.ts` (split files if approaching 500 lines)

## Constraints
- Indexer is the only writer of chain-derived data. Jobs must call `writer.ts`. Jobs must not open a second SQL write path.
- Finality: call `finalityStatusForBlock` from `finality.ts`. A block is canonical/`finalized` only past configured `GOLDSCAN_CONFIRMATION_DEPTH`. On reorg, affected rows are re-derived or marked `reverted` then replaced; never left stale; never duplicated by hash+number.
- RPC: inject a fake client that serves fixture JSON. No live chain. Methods needed: `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getTransactionReceipt`, plus whatever you need for traces/internal txs (fixture can include `result` traces).
- ERC20/721 Transfer topic extraction this wave. ERC1155 TransferSingle/TransferBatch is Wave 3 — do not implement 1155 decoding yet.
- One job type per file. Files preferably <500 lines.
- MIT only. No Blockscout copy.
- Edge cases to cover: empty range, duplicate block replay (idempotent), reorg, missing-range, partial receipt list.

## Ordered steps
1. Author fixture RPC recordings (synthetic is allowed because there is no live chain) covering:
   - at least 3 consecutive blocks with txs, receipts, logs, one ERC20 Transfer, one ERC721 Transfer, one contract-create.
   - a reorg that replaces the last of those blocks with a different hash at the same number.
   - a gap (e.g. indexed 1 and 3, missing 2).
2. Implement RPC client interface + fixture transport.
3. Implement writer (single write owner).
4. Implement jobs (one file each) and a per-block fan-out that enqueues them.
5. Implement head-follower (poll is enough) and backfill/missing-range tracker.
6. On head advance: persist blocks/txs; run jobs; apply finality using the one module.
7. On reorg fixture: stale rows for the old hash gone or `reverted` and replaced by the new canonical rows. No two canonical rows for the same number.
8. Tests must assert expected-rows.json equality for the happy-path range (row counts + hashes + transfer from/to/amount).
9. Run verification. Write `WAVE2-DONE.md`.

Do not implement GOLD bridge/staking event decode (Wave 3). Do not implement API (Wave 4/5). Do not implement frontend.

## Exact verification commands
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```
`npm test` must include the fixture replay, reorg, and missing-range tests.

## Definition of done
- Fixture chain indexes to exact expected state.
- Reorg fixture handled: no duplicate or stale canonical rows.
- Missing-range detector re-fetches a gap.
- One writer. One finality owner.
- No commit.
