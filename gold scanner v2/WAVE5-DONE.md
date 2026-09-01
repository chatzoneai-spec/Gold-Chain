# WAVE5-DONE

## Scope
Wave 5 — Gold-specific read-only API endpoints per `05-slice.md`.

## Verification commands
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

### Results
| Command | Gold scope | Full monorepo |
|---|---|---|
| `npm test` (gold api suite) | **6/6 pass** | 2 failures in `evm.test.ts` logs getLogs (Wave 4 `evm/logs.ts`, out of Wave 5 write scope) |
| `npm run lint` (gold files) | **clean** | 2 unused-import errors in `evm.test.ts` (Wave 4, out of scope) |
| Indexer tests | — | **33/33 pass** |

Wave 5 gold tests isolated:
```bash
cd "/workspace/gold scanner v2/packages/api" && npx eslint src/gold src/gold.test.ts src/test/db.ts --ext .ts
node --import tsx --test src/gold.test.ts
```
Exit: lint 0, gold tests 6/6 pass.

## Delivered
- `packages/api/src/gold/solvency.ts` — **single owner** `computeSolvency(client)`; finalized `locked` rows + `gold_supply` per token_id 1 (PAXG) and 2 (XAUT); no collapsed GOLD total
- `packages/api/src/gold/queries.ts` — read-only SELECT handlers for receipts, bridge activity, staking, validators, delegation, checkpoints, governance, migration status
- `packages/api/src/gold/register.ts` — `registerGoldRoutes(app, pool)` wired into existing `http.ts` gold registry
- `packages/api/src/gold/app.ts` — route registry + `dispatchGoldGet` test helper
- `packages/api/src/gold/types.ts` — response types
- `packages/api/src/gold.test.ts` — seeded against wave3 fixture via indexer replay
- `packages/api/src/test/db.ts` — `withPoolClient` helper for api tests

## Endpoints (GET, read-only)
| Path | Purpose |
|---|---|
| `/gold/solvency` | Per-asset PAXG/GOLD id 1 and XAUT/GOLD id 2 backing view |
| `/gold/redemption-receipts` | Burn→release trail by `receiptCorrelationId` query param |
| `/gold/bridge-activity` | `{ finalized, pending }` — pending never `complete: true` |
| `/gold/staking` | Finalized staking events (paginated) |
| `/gold/validators` | Finalized validator events |
| `/gold/delegation` | Stake rows with nearest validator context |
| `/gold/checkpoints` | Finalized checkpoints |
| `/gold/governance` | Finalized governance events |
| `/gold/migration-status` | `INACTIVE\|PREPARE\|ACTIVE\|EXIT_ONLY\|FINALIZED` from finalized `migration_*` governance rows; default `INACTIVE` |

## Proof tests (gold.test.ts)
| Requirement | Test |
|---|---|
| Solvency ignores pending/reorged rows | `solvency ignores pending and reverted rows; per-ID never collapsed` |
| Per-ID never collapsed | same test — separate `paxg` / `xaut` objects, no `combinedTotalLabelled` |
| Receipts link burn→release on correlation id + route_asset | `redemption receipts link burned_or_debited to released...` |
| Bridge finalized vs pending separated | `bridge activity separates finalized and pending...` |
| Empty / not-found | `returns empty lists and not-found for missing data` |
| Migration status enum | `migration status defaults to INACTIVE...` |
| Staking / validators / delegation / checkpoints / governance | `staking validators delegation checkpoints and governance return finalized rows` |

## Semantics enforced
- Ethereum-side PAXG/XAUT: **locked** inventory summed from finalized `bridge_state = locked`
- Gold Chain GOLD: supply from `gold_supply` token_id 1 and 2
- Redemption trail uses `burned_or_debited` (Gold Chain) → `released` (Ethereum); no root-asset burn language
- Pending rows never marked `complete: true`

## Not done (per instructions)
- No commit, no push
- Did not rewrite `packages/api/src/evm/**` or `ws.ts`
- Full monorepo `npm test` / `npm run lint` blocked by 2 Wave 4 evm logs test failures and 2 lint unused-import warnings in `evm.test.ts`
