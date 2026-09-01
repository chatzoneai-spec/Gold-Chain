# Wave 8 — Indexer leftovers (queue, ERC20/721 balances, gold-view event fields)

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59` — stay on it.
ROOT: `/workspace/gold scanner v2`

## Outcome
1. Per-block fan-out and backfill run through an in-process job queue. One job type per existing job file. Indexer remains the only writer of chain-derived rows.
2. ERC20 and ERC721 `token_balances` are refreshed during normal indexing (same owner as ERC1155: `refreshTokenBalancesForContract`). ERC20 uses `token_id` 0 in `token_balances` (`COALESCE(token_id, 0)` when aggregating; do not collapse ERC1155 IDs 1 and 2).
3. Gold event rows carry the fields the first-class views need. Old Wave 2/3 fixtures still index (missing extra ABI words decode as 0 / defaults). New fixture `wave8.json` covers the extra event types.
4. Existing Wave 2/3/7 tests still pass.

## Locked decisions (do not revisit)
- Queue is in-process TypeScript inside `packages/indexer`. No Redis. No second database writer.
- `IndexerWriter` remains the only SQL writer. Queue workers call writer methods / existing `process*` jobs. `indexer.ts` must not gain `client.query`.
- Confirmation owner stays `packages/indexer/src/finality.ts` via `GOLDSCAN_CONFIRMATION_DEPTH`.
- PAXG/XAUT on Ethereum are locked/released. Never burn root PAXG/XAUT.
- Files preferably under 500 lines. Split if you would exceed that.
- MIT only. No Blockscout source.

## Schema (migration `1725000000006_gold-view-fields.js`)
Add columns; do not drop existing ones. Update `MIGRATION_COUNT` to `6` in both `packages/indexer/src/test/db.ts` and `packages/api/src/test/db.ts`.

`staking_events`:
- `stake_asset` text NOT NULL DEFAULT `'gilt'` CHECK (`gilt`, `gold_id_1`, `gold_id_2`)
- `validator_address` text NULL
- `event_type` remains text. Allowed values now: `stake`, `unstake`, `unbond`.

`validator_events`:
- `commission_bps` integer NOT NULL DEFAULT 0
- `jailed` boolean NOT NULL DEFAULT false
- `elected` boolean NOT NULL DEFAULT false
- `event_type` allowed: `created`, `slashed`, `jailed`, `unjailed`, `elected`, `unelected`

`governance_events`:
- `voter_address` text NULL
- `support` text NULL CHECK (`for`, `against`, `abstain`) when not null
- `timelock_eta` timestamptz NULL
- `event_type` allowed: `proposal_created`, `vote`, `queued`, `executed`

`checkpoints`:
- `chain_status` text NOT NULL DEFAULT `'committed'` CHECK (`committed`, `diverged`, `halted`)

`contracts` (needed by Wave 9 verify; add now so schema is one migration):
- `source_code` text NULL
- `abi` text NULL

Down must drop these columns/constraints and the tables stay.

## Decoder (backward compatible)
`abiDecodeStatic` already returns `0n` for missing words. Decode extra words; defaults when 0:

Staking data words: `[eventType, amount, assetCode]`
- eventType 0 `stake`, 1 `unstake`, 2 `unbond`
- assetCode 0 `gilt`, 1 `gold_id_1`, 2 `gold_id_2`
- `topics[1]` staker; `topics[2]` if present → `validator_address`, else null

Validator data words: `[eventType, amount, commissionBps, jailed, elected]`
- eventType 0 `created`, 1 `slashed`, 2 `jailed`, 3 `unjailed`, 4 `elected`, 5 `unelected`
- jailed/elected: 0 false, nonzero true
- `topics[1]` validator

Governance data words: `[eventType, proposalWord, supportCode, timelockEtaUnix]`
- eventType 0 `proposal_created`, 1 `vote`, 2 `queued`, 3 `executed`
- supportCode 0 none/null, 1 `for`, 2 `against`, 3 `abstain`
- `topics[1]` proposer for created; voter for vote; else may be null
- `timelock_eta` from word 3 when event is `queued` and word ≠ 0; else null

Checkpoint data words: `[checkpointHash, validatorSetHash, statusCode]`
- status 0 `committed`, 1 `diverged`, 2 `halted`

Unknown extra codes → throw (do not silently coerce). Zero/missing extra words → defaults above.

Update `writer-types.ts` + insert SQL in `writer-gold.ts`.

## Job queue
New files (names locked):
- `packages/indexer/src/queue.ts` — enqueue + drain. FIFO. One job object `{ type, payload }`.
- Keep one job type per existing file under `packages/indexer/src/jobs/`.

`runBlockJobs` must enqueue the same job types it currently calls, then `drain` them in a fixed order matching today’s call order (receipts → contract detection → logs → erc20/721 transfers → erc1155 transfers → bridge → staking → validator → governance → checkpoint → internal txs). Do not change observable rows vs current indexer for Wave 2/3 fixtures.

Backfill/catchup also goes through the queue (same `runBlockJobs` path is enough if that is the only fan-out).

Test: enqueue a receipts job for a fixture tx, drain, receipt row exists. Test: Wave 2 replay still exact.

## ERC20/721 balances
After `processTokenTransfersErc20Erc721`, refresh balances for each touched contract via existing `refreshTokenBalancesForContract`.

Update `refreshTokenBalancesForContract` so ERC20 null `token_id` aggregates as `0`. ERC1155 IDs stay distinct. GOLD 1 and 2 never summed here.

Reorg path already deletes/rebuilds via writer; after this change the Wave 7 reorg invariant must pass **without** the test calling `refreshTokenBalancesForContract` itself. Remove that explicit refresh from `invariants.test.ts` if present — ingest must do it.

## Fixture `packages/indexer/fixtures/wave8.json`
Build via `packages/indexer/scripts/build-wave8-fixture.ts` (same pattern as wave3). Include finalized logs for:
- GILT stake and GOLD ID 1 stake to the same validator
- an `unbond` row
- validator created + elected + commission_bps=500 + not jailed
- a second validator jailed
- governance proposal_created, vote (for), queued (with eta), executed
- checkpoint `committed` and one `halted` (halted may be pending so views can separate last committed vs halt)

Confirmation depth 2. Head high enough that the view-relevant logs are finalized except any you intentionally mark pending.

Tests in `packages/indexer/src/wave8.test.ts`:
- GILT and GOLD ID 1 staking rows are separate (`stake_asset` not collapsed)
- unbond row exists
- validator elected/commission/jailed fields exact
- governance vote/queued/executed rows exist
- checkpoint chain_status `committed` and `halted` stored as separate rows
- ERC20 transfer in Wave 2 fixture produces a `token_balances` row after normal index (no manual refresh)

## Verification (MUST run before reporting done)
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Write `gold scanner v2/WAVE8-DONE.md` with commands, pass counts, leftover risks.

## Definition of done
Queue is the fan-out path. ERC20/721 balances update on ingest. Gold-view columns exist and decode. Old tests green. Wave 8 tests green. No commit.
