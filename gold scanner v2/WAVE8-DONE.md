# Wave 8 — Indexer leftovers (queue, ERC20/721 balances, gold-view event fields)

## Branch
`cursor/goldscan-v2-5d59` (no commit, no push)

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Exit code: 0

| Package | Tests | Pass |
|---------|-------|------|
| indexer | 44 | 44 |
| api | 41 | 41 |
| frontend | 10 | 10 |
| **Total** | **95** | **95** |

Lint: clean across all workspaces.

## Delivered

1. **In-process job queue** — `packages/indexer/src/queue.ts` (FIFO enqueue/drain). `runBlockJobs` enqueues one job per existing job file per tx, drains in fixed order (receipts → contract detection → logs → erc20/721 → erc1155 → bridge → staking → validator → governance → checkpoint → internal txs). `queue.test.ts` covers receipts drain + Wave 2 exact replay.

2. **ERC20/721 balances on ingest** — `processTokenTransfersErc20Erc721` refreshes `token_balances` per touched contract. `refreshTokenBalancesForContract` uses `COALESCE(token_id, 0)` so ERC20 null ids aggregate as `0` without collapsing ERC1155 ids 1/2. Reorg clears refresh contract addresses from deleted block transfers via `clearDerivedRowsForBlock`.

3. **Gold-view schema + decode** — migration `1725000000006_gold-view-fields.js` adds `stake_asset`, `validator_address`, `commission_bps`, `jailed`, `elected`, `voter_address`, `support`, `timelock_eta`, `chain_status`, and `contracts.source_code`/`abi`. Decoders extended backward-compatibly (`abiDecodeStatic` returns `0n` for missing words). Fixture `wave8.json` + `wave8.test.ts`.

4. **Wave 2/3/7 regression** — all prior fixture tests still pass (indexer-core, wave3, invariants, api gold/solvency, frontend e2e).

## Leftover risks

- `pg` client deprecation warning on concurrent-query paths (pre-existing).
- `contracts.source_code`/`abi` columns exist but are not populated by the indexer yet (Wave 9 verify scope).
- Queue is single-process FIFO only; no backpressure or persistence across restarts (by design for this wave).
