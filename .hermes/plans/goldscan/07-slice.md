# Wave 7 — Integration, invariants, security, verification

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2`

## Outcome
End-to-end fixture pipeline: recorded RPC → indexer → Postgres → API → frontend render. Invariant tests green. Security checks pass. Old Elixir/frontend trees still gone.

## Invariant tests (must exist and pass)
1. Solvency never shows a value derived from a non-finalized or reorged state.
   - Seed/index a pending deposit and a reverted/reorged lock. `computeSolvency` must ignore them.
2. GOLD ID 1 supply ↔ locked PAXG on the fixture; ID 2 ↔ XAUT (use Wave 3 fixture numbers).
3. Completeness: every token transfer in the Wave 2 + Wave 3 fixtures appears in `token_transfers` (non-reverted canonical set).
4. Reorg fixture leaves no stale **balance** (token_balances must not still reflect the orphaned block's transfers).

Put these in `packages/api/src/invariants.test.ts` and/or `packages/indexer/src/invariants.test.ts`. Solvency assertions must call `computeSolvency` from `packages/api/src/gold/solvency.ts` — do not duplicate the formula.

## E2E
One test that: reset DB, migrate, index Wave 3 fixture (and Wave 2 if needed), GET solvency via HTTP `createApp`, and render `SolvencyHero` with that JSON. Assert per-asset fields match `computeSolvency`.

## Security
- API is read-only: non-GET to `/api` and gold paths → 405. No INSERT from request handlers.
- Input validation at the boundary (bad hex, oversized query, unknown module → 400/404, not 500 with stack).
- No secrets in logs: grep handlers for `DATABASE_URL` / password logging — must not log connection strings.
- Contract-verification upload: if a verify POST exists, sanitize filename/source (no path traversal). If it does not exist, add a test that POST `/verify` is 405 or a sanitized stub that does not write chain tables.

## Old tree
```
test ! -e /workspace/scan/goldscan
test ! -e /workspace/scan/goldscan-frontend
```
Record in WAVE7-DONE.md.

## License
```
rg -n -i "blockscout" "/workspace/gold scanner v2" --glob '!node_modules/**'
```
Zero Blockscout source.

## Verification
```bash
test ! -e /workspace/scan/goldscan
test ! -e /workspace/scan/goldscan-frontend
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Write `WAVE7-DONE.md` listing invariant results, security checks, leftover risks (including any file >500 lines).

## Definition of done
Full pipeline passes on fixtures. All invariant tests green. Security checks pass. Old repo tree confirmed deleted. No commit.
