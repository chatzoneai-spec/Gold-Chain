# WAVE3-DONE

## Scope
Wave 3 — ERC1155 + gold event indexing per `03-slice.md`.

## Verification commands
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```
Exit code: 0 (33 indexer tests + api/frontend smoke tests; lint clean).

## Delivered
- Fixture `packages/indexer/fixtures/wave3.json` (generated via `scripts/build-wave3-fixture.ts`)
- Writer extensions in `packages/indexer/src/writer.ts` (token_balances, gold_supply, bridge/staking/validator/governance/checkpoint rows)
- Jobs: `token-transfers-erc1155.ts`, `bridge-events.ts`, `staking-events.ts`, `validator-events.ts`, `governance-events.ts`, `checkpoint-events.ts`
- Fan-out wired in `packages/indexer/src/jobs/fan-out.ts`
- Tests: `packages/indexer/src/wave3.test.ts`
- One writer (`writer.ts`). One finality owner (`finality.ts`).

## Locked semantics
- GOLD id 1 = PAXG 1:1; id 2 = XAUT 1e12:1
- Non-exact amounts stored with `amount_exact=false`; integers never rounded
- `gold_supply` from finalized ERC1155 mint/burn only; pending mint excluded
- Bridge: PAXG/XAUT locked/released on Ethereum; GOLD minted/credited and burned/debited on Gold Chain

## Proof tests (wave3.test.ts)
| Requirement | Test name |
|---|---|
| Per-ID balances (id 1 and 2 never summed) | `ERC1155 per-ID balances exact for GOLD id 1 and id 2 (never summed)` |
| XAUT 1e12 scaling when exact | `XAUT scaling exact to the 1e12 unit when amount_exact=true` |
| Pending deposit excluded from minted inventory | `non-finalized deposit is NOT counted as minted inventory in gold_supply` |
| Burn→release receipt link | `redeemed burn produces receipt-linked pair on same correlation id with correct route_asset` |
| Non-exact XAUT flagged | `non-exact XAUT amount is flagged amount_exact=false and never rounded` |
| Duplicate replay idempotent | `duplicate wave3 replay is idempotent for gold tables` |
| Gold auxiliary events | `indexes staking validator governance and checkpoint event rows` |

## Not done (out of scope)
- No commit, no push (per slice instructions)
- No HTTP API, frontend, or solvency math
