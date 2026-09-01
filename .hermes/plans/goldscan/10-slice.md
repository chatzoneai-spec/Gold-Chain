# Wave 10 — Frontend leftovers (floor screens, live WS, no mocks)

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59` — stay on it.
ROOT: `/workspace/gold scanner v2`

Depends on Wave 9 API. If a named endpoint from Wave 9 is missing, stop. Do not re-derive canonical values in the browser. Display API JSON / typed fields only.

## Outcome
Every remaining §3 floor screen is real (not mocked). Per-ID GOLD never collapsed. Solvency still the homepage hero via `computeSolvency` payload only.

## Locked
- Presentation only. No solvency math, no balance summing of GOLD 1+2, no finality re-implementation.
- Wallet out of scope. Write UI uses `/contract/encode` and shows `{ to, data }`. View UI uses `/contract/call`.
- Files <500 lines.
- Keep loading / empty / error / retry.

## Next rewrites (same-origin)
`packages/frontend/next.config.ts` rewrites (env `GOLDSCAN_API_ORIGIN` default `http://127.0.0.1:4000`):
- `/api` → API `/api`
- `/gold/:path*` → API `/gold/:path*`
- `/verify` POST stays on API; Next page is `/verify` GET UI. Use rewrite only for `/api`, `/gold/:path*`, `/ws`, `/contract/:path*`. Do not swallow the Next `/gold` page: rewrite `/gold/solvency`, `/gold/bridge-activity`, `/gold/redemption-receipts`, `/gold/staking`, `/gold/validators`, `/gold/delegation`, `/gold/checkpoints`, `/gold/governance`, `/gold/migration-status`, `/gold/validator-set`, `/gold/delegations`, `/gold/checkpoint-status`, `/gold/governance-board` explicitly (or rewrite `/gold/` with a trailing path only, never exact `/gold`).

## Screens to finish
1. Home: add tx count from `stats/txcount`. Keep solvency hero. Optional GILT price: omit (no price source).
2. Block detail: render that block’s tx list from `getblocktxlist`. Show number, hash, timestamp, validator, gas used/limit, finality.
3. Tx detail: decodedInput; event logs; internal txs; token transfers from API (not `[]`). Fee = gasUsed * gasPrice displayed from API fields (multiply in UI is presentation of two API numbers; do not fetch chain). If you refuse client multiply, have API add `fee` on gettxbyhash — prefer API `fee` field in Wave 9 if missing; if Wave 9 already shipped without `fee`, add it here in API `gettxbyhash` (tiny, allowed).
4. Address: token holdings from `token_balances` via new API `module=account&action=tokenbalance` **or** holders endpoint filtered by address. Spec: add GET `/api?module=account&action=addresstokenbalance&address=` returning rows `{ contractAddress, tokenID, balance, tokenStandard }`. GOLD id 1 and 2 separate. If Wave 9 did not add this, add it in this wave in the API (allowed; it is required for the address page). Do not dump raw transfer JSON as “holdings”.
5. Token list: query `token_contracts` — add GET `/api?module=token&action=tokenlist` if missing (this wave may add it). Table of indexed tokens with type/name/symbol. Link to detail. Include GOLD.
6. Token detail: supply, holders (`tokenholderlist`), transfers (`tokentx` for that contract). GOLD: two ID sections, two holder lists, never collapsed.
7. GOLD page: use tokeninfo + holders per id 1 and 2 + solvency panels. Show balances/holders/supply per ID.
8. Verify page: real POST `/verify` (no “mocked” labels). Show match / mismatch errors. Lookup of stored source/abi stays.
9. Address contract read/write: real view via `/contract/call`; write shows encoded `{ to, data }` from `/contract/encode`. Remove “mocked”.
10. Staking/validators page: `GET /gold/validator-set` table (voting power, GILT vs GOLD id 1/2 split, commission, jailed, elected). Do not dump raw events as the primary view; events can be a secondary JSON section.
11. Delegation page: `GET /gold/delegations` — per-address GILT and GOLD, unbonding list.
12. Checkpoints page: `GET /gold/checkpoint-status` — last committed, diverged, halted.
13. Governance page: `GET /gold/governance-board` — proposals, votes, timelock queue.
14. Home (or layout): WebSocket client to `/ws` showing latest block/tx as they broadcast. Component test with a mock WS is enough (no live chain). Do not compute canonical data from WS; display the event payload.

## Tests
Component tests with mocked fetch for:
- token page two GOLD IDs + two holder lists
- address holdings id 1 vs 2
- validator-set split fields visible
- unbonding section
- checkpoint halted vs committed
- verify success/mismatch messages
- decodedInput on tx page
- block tx list
- WS component renders a block event
- solvency hero still per-asset

`next build` must succeed (keep test files excluded from tsconfig).

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
cd "/workspace/gold scanner v2/packages/frontend" && npx next build
```

Write `gold scanner v2/WAVE10-DONE.md`.

## Definition of done
No mocked verify/read/write. Floor screens consume API. Per-ID GOLD visible. `next build` green. No commit.
