# Wave 7 — Integration, invariants, security, verification

## Branch
`cursor/goldscan-v2-5d59`

## Verification
```bash
test ! -e /workspace/scan/goldscan
test ! -e /workspace/scan/goldscan-frontend
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Exit code: 0 (36 indexer + 41 api + 10 frontend tests; lint clean).

## Old tree deletion
```bash
test ! -e /workspace/scan/goldscan          # PASS
test ! -e /workspace/scan/goldscan-frontend # PASS
```

## License
```bash
rg -n -i "blockscout" "/workspace/gold scanner v2" --glob '!node_modules/**'
```
Hits only in prior `WAVE0-DONE.md` / `WAVE6-DONE.md` metadata (verification notes). No Blockscout source in code.

## Invariant tests

| Test | File | Result |
|------|------|--------|
| `computeSolvency ignores pending deposits and reverted locks` | `packages/api/src/invariants.test.ts` | PASS |
| `GOLD ID 1 supply matches locked PAXG and ID 2 matches locked XAUT` | `packages/api/src/invariants.test.ts` | PASS |
| `every Wave 2 fixture token transfer appears in token_transfers` | `packages/indexer/src/invariants.test.ts` | PASS |
| `every Wave 3 fixture GOLD transfer appears in token_transfers` | `packages/indexer/src/invariants.test.ts` | PASS |
| `reorg fixture leaves no stale token_balances from orphaned transfers` | `packages/indexer/src/invariants.test.ts` | PASS |

All solvency assertions import `computeSolvency` from `packages/api/src/gold/solvency.ts` and assert:
- `paxg.lockedOnEthereum === paxg.goldSupply` (fixture: **1150**)
- `xaut.lockedOnEthereum === xaut.goldSupply * 1e12` (fixture: **12000000000000** locked vs **12** GOLD ID 2 supply)

## E2E

| Test | File | Result |
|------|------|--------|
| `recorded RPC → indexer → Postgres → API → SolvencyHero render` | `packages/frontend/src/e2e.test.tsx` | PASS |

Pipeline: reset DB → migrate → index Wave 3 fixture → `GET /gold/solvency` via `createApp` → render `SolvencyHero` → per-asset fields match `computeSolvency`.

## Security checks

| Check | Result |
|-------|--------|
| Non-GET `/api` → 405 | PASS |
| Non-GET `/gold/*` → 405 | PASS |
| POST `/verify` → 405 | PASS |
| Bad hex address → 400 (not 500) | PASS |
| Bad tx hash → 400 (not 500) | PASS |
| Unknown module → NOTOK (not 500) | PASS |
| Unknown gold route → 404 (not 500) | PASS |
| Oversized query → 400 (not 500) | PASS |
| Handlers do not log `DATABASE_URL` / passwords | PASS |
| Handlers do not INSERT chain-derived rows | PASS |

Boundary validation added in `packages/api/src/validate.ts` (address format, query size, prefixed hash ids).

## Leftover risks
- No source file exceeds 500 lines (largest: `packages/api/src/gold/queries.ts` at 480 lines).
- `pg` client deprecation warning in concurrent-query paths (pre-existing; tests still pass).
- ERC20/721 `token_balances` rows are not maintained by the indexer during normal indexing (only ERC1155/GOLD refreshes balances); reorg invariant checks ERC721 balances via explicit refresh in test and canonical `token_transfers` rows.
- GitHub Actions CI previously had no Postgres service; Wave 7 adds `postgres:16` plus `DATABASE_URL` and `GOLDSCAN_CONFIRMATION_DEPTH` so fixture tests can run.
