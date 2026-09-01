# Wave 9 — API leftovers (DONE)

## Scope delivered

Read-only query surface for remaining Etherscan-compatible and Gold derived endpoints. Indexer remains the only writer of chain-derived tables. API may `UPDATE contracts` verification columns only via `POST /verify`.

## Endpoints added

| Endpoint | Owner module |
|---|---|
| `GET /api?module=stats&action=txcount` | `packages/api/src/evm/stats.ts` |
| `GET /api?module=block&action=getblocktxlist` | `packages/api/src/evm/block-txlist.ts` |
| `GET /api?module=account&action=tokentx&txhash=…` | `packages/api/src/evm/account.ts` (txhash filter documented in `wave9.test.ts`) |
| `GET /api?module=token&action=tokenholderlist` | `packages/api/src/evm/token-holders.ts` |
| `GET /api?module=token&action=tokeninfo` (totalSupply) | `packages/api/src/evm/token-supply.ts` |
| `module=tx&action=gettxbyhash` + `decodedInput` | `packages/api/src/evm/decode-input.ts` |
| `GET /gold/validator-set` | `packages/api/src/gold/validator-set.ts` → `computeValidatorSet` |
| `GET /gold/delegations` | `packages/api/src/gold/delegations.ts` → `computeDelegations` |
| `GET /gold/checkpoint-status` | `packages/api/src/gold/checkpoint-status.ts` → `computeCheckpointStatus` |
| `GET /gold/governance-board` | `packages/api/src/gold/governance-board.ts` → `computeGovernanceBoard` |
| `POST /verify` | `packages/api/src/verify.ts` |
| `POST /contract/call` | `packages/api/src/contract-call.ts` + `packages/api/src/evm/rpc.ts` |
| `POST` / `GET /contract/encode` | `packages/api/src/contract-encode.ts` |

## Locked rules verified

- **Solvency:** `computeSolvency` in `packages/api/src/gold/solvency.ts` remains the only solvency formula owner.
- **GOLD IDs 1 and 2:** never collapsed in holders, tokeninfo, or derived validator stakes (`giltStake`, `goldId1Stake`, `goldId2Stake` stay separate).
- **Finality:** derived gold boards use finalized rows only; pending never `complete: true` on event lists (unchanged).
- **Chain writes:** no `INSERT` into chain-derived tables from API handlers; verify only `UPDATE`s `contracts`.

## Verification

```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

| Package | Tests | Pass |
|---|---:|---:|
| indexer | 44 | 44 |
| api | 60 | 60 |
| frontend | 10 | 10 |
| **Total** | **114** | **114** |

Lint: pass (all workspaces).

## Files changed (api package)

**New**
- `packages/api/src/evm/stats.ts`
- `packages/api/src/evm/block-txlist.ts`
- `packages/api/src/evm/tx-format.ts`
- `packages/api/src/evm/decode-input.ts`
- `packages/api/src/evm/token-holders.ts`
- `packages/api/src/evm/token-supply.ts`
- `packages/api/src/evm/rpc.ts`
- `packages/api/src/gold/validator-set.ts`
- `packages/api/src/gold/delegations.ts`
- `packages/api/src/gold/checkpoint-status.ts`
- `packages/api/src/gold/governance-board.ts`
- `packages/api/src/verify.ts`
- `packages/api/src/contract-call.ts`
- `packages/api/src/contract-encode.ts`
- `packages/api/src/wave9.test.ts`

**Modified**
- `packages/api/src/http.ts` — POST routing for `/verify`, `/contract/call`, `/contract/encode`
- `packages/api/src/evm/dispatch.ts`, `transaction.ts`, `token.ts`, `account.ts`
- `packages/api/src/gold/register.ts`
- `packages/api/src/security.test.ts` — verify sanitize + expanded INSERT guard
- `packages/api/package.json` — `solc`, `ethers` deps

## Leftover risks

1. **ERC20 totalSupply via SUM(token_balances)** can be `0` when sender rows carry negative balances (indexer accounting model); holder-list and per-address balances remain correct.
2. **`POST /contract/call`** requires `GOLDSCAN_RPC_URL` for live `eth_call`; tests use injected mock caller.
3. **Verify compile** uses bundled `solc@0.8.20`; other compiler versions are normalized to semver but compiled with the bundled compiler.
4. **Halted checkpoint** in wave8 fixture is `pending` finality — `checkpoint-status.halted` stays `false` until that row finalizes (by design).

## Solvency ownership

Yes — `computeSolvency` in `packages/api/src/gold/solvency.ts` is still the only solvency owner. No duplicate formulas were added.
