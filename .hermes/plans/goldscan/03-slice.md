# Wave 3 — ERC1155 + gold event indexing

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL/Elixir. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2`

## Outcome
Decode ERC1155 TransferSingle/TransferBatch. Track per-(address, contract, token_id) balances. Track GOLD per-ID supply from 1155 mint/burn. Decode bridge/staking/validator/governance/checkpoint events into gold tables. PAXG scale 1:1, XAUT scale 1e12:1 exactly; non-exact amounts flagged, never silently rounded. Bridge rows carry finality_status from the one finality owner. Only finalized events count as real inventory.

## Locked scaling
- Token ID 1 = PAXG-backed GOLD. Route scale **1:1**.
- Token ID 2 = XAUT-backed GOLD. Route scale **1e12:1** (exact integer).
- If an amount is not divisible by the scale, set `amount_exact = false` and store the unrounded integers you have. Never round. Never drop the row.
- Ethereum-side PAXG/XAUT: lock / release. Gold Chain GOLD: mint/credit / burn/debit. Do not write a path that burns root PAXG or XAUT.

## Finality
Import `packages/indexer/src/finality.ts` only. Every bridge_transfers row gets `finality_status`. Solvency/inventory readers in later waves will filter `finalized`. This wave's tests must prove: a deposit with `pending` is NOT treated as minted inventory (do not increment gold_supply / do not treat as complete mint from a pending row).

## Writes
All new row writes go through `packages/indexer/src/writer.ts` (extend it). No second SQL write path.

## Jobs (one file per type, under `packages/indexer/src/jobs/`)
- `token-transfers-erc1155.ts` — TransferSingle + TransferBatch; update token_transfers + token_balances per token_id; mint from 0x0 / burn to 0x0 updates `gold_supply` per token_id (1 and 2 never collapsed).
- `bridge-events.ts` — decode fixture logs into `bridge_transfers` with route_asset paxg|xaut, direction deposit|exit, source_layer ethereum|gold_chain, bridge_state in {locked,synced,minted_or_credited,burned_or_debited,released}, root/child tx hashes, amount_exact.
- `staking-events.ts`
- `validator-events.ts`
- `governance-events.ts`
- `checkpoint-events.ts`

Wire them into fan-out after existing Wave 2 jobs.

## Fixtures (committed JSON)
Must include:
1. ERC1155 TransferSingle for GOLD id 1 and id 2 (separate).
2. TransferBatch containing both ids.
3. Mint of id 1 and id 2 (from 0x0) and a burn of id 1 (to 0x0).
4. A **pending** (non-finalized) deposit log that must NOT count as minted inventory.
5. A **finalized** deposit: PAXG locked on ethereum + GOLD id 1 minted (1:1).
6. A **finalized** XAUT lock + GOLD id 2 mint with child_amount * 1e12 = root_amount exactly.
7. A non-exact XAUT amount (not divisible by 1e12) with amount_exact=false.
8. A redemption: GOLD burn + root asset released, same receipt_correlation_id linking burn→release, correct route_asset.
9. At least one staking, validator, governance, checkpoint event row.

Topic hashes: use the canonical ERC1155 TransferSingle/TransferBatch topic0 values. Other gold events may use documented fixture topic strings as long as tests are exact.

## Tests (must pass)
- ERC1155 per-ID balances exact for id 1 and id 2 (never summed).
- XAUT scaling exact to the 1e12 unit when amount_exact=true.
- Non-finalized deposit is NOT counted as minted (gold_supply / inventory assertion).
- Redeemed burn produces a receipt-linked pair (burned_or_debited + released) on the same correlation id and the correct root asset (paxg vs xaut).
- Duplicate, empty, dust/non-exact, pending, finalized cases.

## Ordered steps
1. Add fixtures.
2. Extend writer for balances, gold_supply, gold tables.
3. Add jobs; wire fan-out.
4. Tests.
5. Run verification. Write `WAVE3-DONE.md`.

Do not implement HTTP API (Wave 4/5). Do not implement frontend. Do not compute solvency here (Wave 5 owns that function). You may write gold_supply from 1155 mint/burn only.

## Exact verification commands
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

## Definition of done
Per-ID accounting exact, scaling exact, non-finalized excluded from minted inventory, receipts linked correctly. One writer. One finality owner. No commit.
