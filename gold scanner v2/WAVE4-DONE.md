# WAVE4-DONE

## Scope
Wave 4 — read-only EVM REST API (Etherscan-compatible) + WebSocket live feed per `04-slice.md`.

## Verification commands
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```
Exit code: 0 (33 indexer + 29 api + 1 frontend tests; lint clean).

## Delivered
- `packages/api/src/http.ts` — `createApp`, `listen`; wires EVM `/api` and Wave 5 gold routes without overwriting them
- `packages/api/src/evm/**` — account, transaction, tx, block, logs, token, contract modules (SELECT only)
- `packages/api/src/ws.ts` — WebSocket feed pushing `{type:"block",...}` and `{type:"tx",...}`
- `packages/api/src/evm.test.ts` — contract tests against seeded Postgres (happy path, empty, not-found, pagination, 405 on writes, WS mock client)
- `packages/api/src/test/seed.ts` — API test fixture seeder (no indexer required)
- `packages/api/ETHERSCAN.md` — query param documentation
- `packages/api/package.json` — added `pg`, `ws` dependencies

## Wave 5 coexistence
- Did **not** overwrite `packages/api/src/gold/register.ts` (Wave 5 real routes preserved)
- `http.ts` imports and dispatches existing `registerGoldRoutes` registry

## Locked rules honored
- API is SELECT-only; no INSERT/UPDATE/DELETE on indexed tables
- No solvency computation (Wave 5 owns that)
- Non-GET on `/api` returns HTTP 405
- Etherscan response shape: `{status, message, result}`

## Proof tests (evm.test.ts)
| Requirement | Test name |
|---|---|
| Account balance | `account balance returns gilt balance for known address` |
| Account txlist happy/empty/pagination | `account txlist returns seeded transactions`, `account txlist empty...`, `account txlist paginates results` |
| Internal txs | `account txlistinternal returns internal transaction` |
| Token transfers ERC20/721 | `account tokentx returns erc20 transfer`, `account tokennfttx returns erc721 transfer` |
| Transaction status / not-found | `transaction gettxreceiptstatus returns status for known tx`, `...not-found for unknown tx` |
| Tx by hash | `tx gettxbyhash returns transaction details` |
| Block lookup / not-found | `block getblockbynumber returns block`, `block getblockbyhash not-found for unknown hash` |
| Logs happy/empty | `logs getLogs returns seeded logs`, `logs getLogs empty when no matches` |
| Token info / not-found | `token tokeninfo returns token metadata`, `token tokeninfo not-found for unknown contract` |
| Contract metadata | `contract getsourcecode returns contract row`, `contract getabi not-found for unverified contract` |
| Write rejected | `rejects write attempts with 405` |
| WebSocket feed | `broadcasts block and tx events to connected clients` |

## Not done (out of scope)
- No commit, no push (per slice instructions)
- Gold endpoint implementations (Wave 5)
- Frontend screens
