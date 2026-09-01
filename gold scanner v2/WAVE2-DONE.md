# Wave 2 — Done Report

## Scope delivered

Generic EVM indexer core with fixture-only RPC replay, one SQL writer, head-follower, backfill/missing-range tracker, per-block job fan-out, and reorg handling via the existing `finality.ts` owner.

## Verification commands (exit codes)

| Command | Exit |
|---------|------|
| `export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql" && export GOLDSCAN_CONFIRMATION_DEPTH=2 && cd "/workspace/gold scanner v2" && npm test` | 0 |
| `cd "/workspace/gold scanner v2" && npm run lint` | 0 |

## Test counts

Indexer package:

```
# tests 26
# suites 4
# pass 26
# fail 0
```

Monorepo total (indexer + api + frontend):

```
# tests 28
# suites 6
# pass 28
# fail 0
```

Wave 2 indexer-core assertions:

1. Fixture replay matches `expected-rows.json` exactly (blocks, counts, ERC20/ERC721 transfers)
2. Duplicate block replay is idempotent (no duplicate canonical rows per number)
3. Reorg fixture: block 3 hash replaced; stale tx `0xtx04` marked `reverted`; canonical tx `0xtxreorg` active; no duplicate canonical rows per number; stale ERC721 transfer gone
4. Missing-range: gap `{from:2,to:2}` detected; backfill fills block 2
5. Head follower polls fixture head
6. Empty range produces no gaps
7. Partial receipt list indexes available receipts

## Reorg proof

After stage-0 index, block 3 hash = `0xblock...003`. After `advanceStage()` + `indexToHead()`:

- Canonical block 3 hash = `0xblock...reorg` (one row, not reverted)
- Stale tx `0xtx...04` finality_status = `reverted`
- Canonical block-3 tx = `0xtx...reorg` only
- No duplicate canonical rows per block number

## Gap proof

`MissingRangeTracker.getMissingRanges(3)` with indexed `[1,3]` returns `[{from:2,to:2}]`. After `indexToHead()`, block 2 exists with hash `0xblock...002`.

## Architecture constraints met

- One writer: `packages/indexer/src/writer.ts` — sole INSERT/UPDATE/DELETE path for chain-derived rows
- One finality owner: `packages/indexer/src/finality.ts` imported by writer and indexer
- No ERC1155 decode (Wave 3)
- No live RPC — `FixtureRpcClient` serves fixture JSON only
- One job type per file under `packages/indexer/src/jobs/`

## Files added/changed (Wave 2 only)

- `packages/indexer/fixtures/blocks.json`
- `packages/indexer/fixtures/reorg.json`
- `packages/indexer/fixtures/gap.json`
- `packages/indexer/fixtures/expected-rows.json`
- `packages/indexer/src/rpc/types.ts`
- `packages/indexer/src/rpc/fixture-client.ts`
- `packages/indexer/src/writer.ts`
- `packages/indexer/src/head-follower.ts`
- `packages/indexer/src/backfill.ts`
- `packages/indexer/src/indexer.ts`
- `packages/indexer/src/util.ts`
- `packages/indexer/src/indexer-core.test.ts`
- `packages/indexer/src/jobs/receipts.ts`
- `packages/indexer/src/jobs/logs.ts`
- `packages/indexer/src/jobs/internal-txs.ts`
- `packages/indexer/src/jobs/contract-detection.ts`
- `packages/indexer/src/jobs/token-transfers-erc20-721.ts`
- `packages/indexer/src/jobs/fan-out.ts`
- `packages/indexer/src/jobs/README.md`
- `packages/indexer/package.json` (serial test concurrency for DB isolation)
- `WAVE2-DONE.md`

## Not done (per spec)

- No commit
- No push
- No ERC1155 decode (Wave 3)
- No GOLD bridge/staking event decode (Wave 3)
- No API (Wave 4/5)
- No frontend (Wave 6)
