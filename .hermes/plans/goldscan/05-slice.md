# Wave 5 — API: gold endpoints

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2`

## Outcome
Gold-specific read-only endpoints: solvency, redemption receipts, bridge activity, staking, validators, delegation, checkpoints, governance, migration status.

## Solvency — single owner
ONE function: `packages/api/src/gold/solvency.ts` → `computeSolvency(client)` (name may be this exactly).

It:
- Reads canonical rows only (Postgres SELECT).
- Honors finality: only `finality_status = 'finalized'` inventory. Never pending/reverted.
- Returns per-asset objects: PAXG vs GOLD token_id 1; XAUT vs GOLD token_id 2. Never a collapsed single GOLD number unless an extra field explicitly named `combinedTotalLabelled` with a label string `"combined (not a backing figure)"` — prefer omitting combined entirely.
- Locked PAXG on Ethereum = sum of finalized bridge_transfers where route_asset=paxg and bridge_state=locked (or equivalent locked inventory from canonical rows). GOLD ID 1 supply from gold_supply token_id=1 (already finalized-only from indexer). Same for XAUT / id 2.
- No other file re-derives solvency.

## File ownership (Wave 4 is parallel)
YOU MAY WRITE:
- `packages/api/src/gold/**` including replacing `gold/register.ts` with real `registerGoldRoutes(app)` 
- `packages/api/src/gold.test.ts`
- Do not rewrite `evm/**`, `ws.ts`. If `http.ts` exists, only add an import of registerGoldRoutes if missing.

## Endpoints (read-only)
- GET solvency
- GET redemption receipts (burn→release trail: locked→synced→minted_or_credited→burned_or_debited→released)
- GET bridge activity: finalized vs pending clearly separated. Non-finalized never marked complete.
- GET staking, validators, delegation, checkpoints, governance, migration status (`INACTIVE|PREPARE|ACTIVE|EXIT_ONLY|FINALIZED`)

## Tests
- Solvency ignores pending/reorged rows.
- Per-ID never collapsed.
- Receipts link burn→release on correlation id and correct route_asset (paxg vs xaut).
- Bridge endpoint separates finalized vs pending.
- Empty/not-found cases.

PAXG/XAUT are locked/released on Ethereum. GOLD is minted/credited and burned/debited on Gold Chain. Do not describe root assets as burned.

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Write `WAVE5-DONE.md`. No commit.

## Definition of done
Gold endpoints correct against seeded data. Solvency honors finality and per-ID separation. One solvency function. No commit.
