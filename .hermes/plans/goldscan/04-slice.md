# Wave 4 — API: core EVM endpoints

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2`

## Outcome
Read-only REST (Etherscan-compatible account/tx/token/logs/contract modules) + WebSocket live feed of new blocks/txs. No writes of chain facts. Contract tests against a seeded Postgres.

## File ownership (Wave 5 is parallel — do not fight)
YOU MAY WRITE:
- `packages/api/src/http.ts` — createApp, listen. Import `registerEvmRoutes` and `registerGoldRoutes`.
- `packages/api/src/evm/**`
- `packages/api/src/ws.ts`
- `packages/api/src/evm.test.ts`
- `packages/api/src/gold/register.ts` ONLY as a stub: `export function registerGoldRoutes(_app: unknown): void {}` so http.ts compiles. Wave 5 will replace this file. If `gold/register.ts` already has real routes, do not overwrite it.
- `packages/api/package.json` deps (http framework: Node `http` + URL routing is enough; express is allowed)

YOU MUST NOT WRITE:
- `packages/api/src/gold/solvency.ts`
- gold endpoint implementations
- indexer jobs
- frontend screens

## Rules
- API never writes chain facts (no INSERT/UPDATE/DELETE on indexed tables). SELECT only.
- Do not compute solvency.
- Pagination + not-found + empty + unauthorized (if a write is attempted, 405).
- Etherscan-shape: `?module=account&action=...` etc. Document the query params in a short `packages/api/ETHERSCAN.md`.
- WebSocket: push `{type:"block",...}` and `{type:"tx",...}` (tests can inject a fake emitter).

## Seed
Tests seed Postgres (same DATABASE_URL) with a few blocks/txs/tokens. Do not require the indexer to run.

## Tests
Per endpoint against seeded DB: happy path, empty, not-found, pagination. Unauthorized/write attempt rejected. WS test with a mock client.

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Write `WAVE4-DONE.md`. No commit.

## Definition of done
Endpoints return correct shapes from seeded data. Edge cases handled. Read-only. No commit.
