# Wave 10 — Frontend leftovers (DONE)

## Scope delivered

All remaining §3 floor screens consume live API data. No mocked verify/read/write labels. Per-ID GOLD (IDs 1 and 2) never collapsed. Solvency hero remains homepage hero via `computeSolvency` payload only.

## API additions (allowed in this wave)

| Endpoint | Module |
|---|---|
| `GET /api?module=account&action=addresstokenbalance&address=` | `packages/api/src/evm/account.ts` |
| `GET /api?module=token&action=tokenlist` | `packages/api/src/evm/token.ts` |
| `fee` field on `module=tx&action=gettxbyhash` | `packages/api/src/evm/transaction.ts` |
| `tokentx` with `contractaddress` only (no address) | `packages/api/src/evm/account.ts` — enables token-detail transfers |

## Frontend screens finished

1. **Home** — tx count from `stats/txcount`; solvency hero; WebSocket `LiveFeed` on `/ws`
2. **Block detail** — block fields + tx list from `getblocktxlist`
3. **Tx detail** — `decodedInput`, logs, internals, token transfers, `fee` from API
4. **Address** — holdings from `addresstokenbalance` (GOLD ID 1/2 separate); contract read via `/contract/call`, write shows `{ to, data }` from `/contract/encode`
5. **Token list** — `tokenlist` table with links
6. **Token detail** — supply, holders (`tokenholderlist`), transfers (`tokentx` by contract)
7. **GOLD page** — `tokeninfo` + holders per ID 1/2 + solvency panels
8. **Verify** — real `POST /verify`; success/mismatch messages; lookup unchanged
9. **Staking** — primary `GET /gold/validator-set` table; events in secondary `<details>`
10. **Delegation** — `GET /gold/delegations` with delegations + unbonding sections
11. **Checkpoints** — `GET /gold/checkpoint-status` (committed, halted, diverged)
12. **Governance** — `GET /gold/governance-board` (proposals + timelock queue)

## Next rewrites

`packages/frontend/next.config.ts` proxies `/api`, `/ws`, `/contract/:path*`, `/verify`, and explicit `/gold/*` API paths to `GOLDSCAN_API_ORIGIN` (default `http://127.0.0.1:4000`). Next `/gold` page route is not swallowed.

## Verification

```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
cd "/workspace/gold scanner v2/packages/frontend" && npx next build
```

| Package | Tests | Pass |
|---|---:|---:|
| indexer | 44 | 44 |
| api | 60 | 60 |
| frontend | 22 | 22 |
| **Total** | **126** | **126** |

Lint: pass (all workspaces).

`next build`: pass (18 routes, static + dynamic).

## Files changed

**API (modified)**
- `packages/api/src/evm/account.ts` — `addresstokenbalance`, contract-only `tokentx`
- `packages/api/src/evm/token.ts` — `tokenlist`
- `packages/api/src/evm/transaction.ts` — `fee` on `gettxbyhash`

**Frontend (new)**
- `packages/frontend/src/components/LiveFeed.tsx`
- `packages/frontend/src/components/ContractReadWrite.tsx`
- `packages/frontend/src/wave10.test.tsx`

**Frontend (modified)**
- `packages/frontend/next.config.ts`
- `packages/frontend/src/lib/api.ts`, `types.ts`
- `packages/frontend/src/components/DataViews.tsx`, `GoldIdSections.tsx`
- All floor screen pages under `packages/frontend/src/app/`

## Leftover risks

1. **`POST /contract/call`** still requires `GOLDSCAN_RPC_URL` for live `eth_call`; read UI shows RPC errors when unavailable.
2. **WebSocket** displays broadcast payloads only; no canonical recomputation in the browser (by design).
3. **Halted checkpoint** in wave8 fixture is `pending` finality — `checkpoint-status.halted` stays `false` until that row finalizes.
4. **ERC20 totalSupply via SUM(token_balances)** can be `0` when sender rows carry negative balances (unchanged from Wave 9).

## Solvency ownership

Yes — `computeSolvency` in `packages/api/src/gold/solvency.ts` remains the only solvency owner. Frontend displays API JSON only.
