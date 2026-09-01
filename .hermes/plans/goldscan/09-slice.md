# Wave 9 — API leftovers (holders, decode, gold derived views, verify, eth_call)

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59` — stay on it.
ROOT: `/workspace/gold scanner v2`

Depends on Wave 8 already merged in the working tree (schema migration 6, gold-view columns, token_balances for ERC20/721, queue). If Wave 8 is missing, stop and say so. Do not re-implement indexer.

## Outcome
Read-only query surface covers the remaining floor. Indexer remains the only writer of chain-derived tables. API may UPDATE `contracts` verification columns only via POST `/verify`.

## Locked
- Solvency stays `computeSolvency` in `packages/api/src/gold/solvency.ts`. Do not duplicate.
- Finality: pending is never `complete: true`. Derived gold views use finalized rows unless the field is explicitly a pending/halt list.
- ERC1155 GOLD IDs 1 and 2 never collapsed except a payload field explicitly named `combinedTotal` that is labeled combined. Default responses stay per-ID.
- Files <500 lines. `queries.ts` is already 480 — put new queries in new files.
- No live mainnet. Fixtures + local Postgres.
- Wallet integration is out of scope. Write-from-UI is encode-only (no `eth_send`).

## Etherscan-compatible additions
Keep `?module=&action=` GET `/api`.

1. `module=stats&action=txcount` → count of non-reverted transactions. Used by home.
2. `module=block&action=getblocktxlist` (params `blockno` or `tag`) → txs in that block, same tx shape as `gettxbyhash` list (array). Empty block → empty result not 500.
3. `module=account&action=tokentx` already exists. Add `module=account&action=tokentx` filtered by `txhash` when `txhash` present OR add `module=account&action=txntokentx` with required `txhash`. Pick one; document in test. Tx detail needs token transfers for that hash (ERC20/721/1155, include `tokenID`).
4. `module=token&action=tokenholderlist` params `contractaddress`, optional `tokenid`. Returns holders from `token_balances` where balance ≠ 0, non-reverted implied because balances are rebuilt from non-reverted transfers. For GOLD, `tokenid=1` and `tokenid=2` are separate lists. Missing tokenid for erc1155 GOLD must not merge 1+2 — require tokenid or return `{ id1: [...], id2: [...] }` as two arrays, never a summed balance.
5. `module=token&action=tokeninfo` must fill `totalSupply`:
   - GOLD / erc1155: supply from `gold_supply` for that `tokenid` if provided; if not provided return per-ID array (id 1 and 2) not a single summed number.
   - erc20: SUM(token_balances) for that contract where token_id = 0
   - erc721: COUNT of token_balances rows with balance > 0
6. Decoded input on `module=tx&action=gettxbyhash`: add `decodedInput` object `{ selector, signature, args }` or `{ selector, signature: null, args: null }` if unknown. If contract is verified and ABI stored, decode with that ABI. If not verified, selector = first 4 bytes of input, rest raw. Native simple transfer (`0x` or empty) → `{ selector: "0x", signature: "nativeTransfer", args: [] }`.

## Gold derived endpoints (single owners)
Keep existing event-list endpoints. Add derived GET endpoints (new files):

- `GET /gold/validator-set` → owner `packages/api/src/gold/validator-set.ts` `computeValidatorSet`
  One row per validator address from finalized `validator_events`. Fields: `validatorAddress`, `votingPower`, `giltStake`, `goldId1Stake`, `goldId2Stake`, `commissionBps`, `jailed`, `elected`. Voting power = giltStake + goldId1Stake + goldId2Stake (three fields still present; do not hide the split). Latest commission/jailed/elected from latest finalized validator_event for that address.
- `GET /gold/delegations` → `packages/api/src/gold/delegations.ts` `computeDelegations`
  Per `(delegator, validator, stakeAsset)` net stake-unstake from finalized staking_events. Separate `unbonding` array from finalized `unbond` events (do not mark unbond as complete stake).
- `GET /gold/checkpoint-status` → `packages/api/src/gold/checkpoint-status.ts` `computeCheckpointStatus`
  `lastCommitted` = latest finalized checkpoint with `chain_status=committed` or null. `halted` true if any finalized `halted` exists. `diverged` true if any finalized `diverged` exists. Include the last committed hashes.
- `GET /gold/governance-board` → `packages/api/src/gold/governance-board.ts` `computeGovernanceBoard`
  Proposals from `proposal_created`. Votes grouped by proposalId. `timelockQueue` = `queued` rows not yet `executed`. Do not invent proposal text.

Pending events: excluded from these derived boards (finalized only). Event-list endpoints may still return pending with `complete: false`.

## POST /verify (not chain-derived writes)
`http.ts` currently 405s all non-GET. Change to:
- GET: as now
- POST `/verify` only: verification handler
- POST `/contract/call` only: eth_call simulate (view)
- any other POST: 405
- still no INSERT into blocks/transactions/token_transfers/bridge_transfers/gold_supply/staking_events/validator_events/governance_events/checkpoints/token_balances

POST `/verify` JSON body: `{ address, source, compilerVersion, optimizationEnabled?, optimizationRuns?, evmVersion?, constructorArguments? }`
Sanitize: hex address; source length cap (e.g. 1_000_000 chars); `compilerVersion` must match `/^v?\d+\.\d+\.\d+.*$/` and must not contain `/`, `..`, NUL. Reject path traversal.

Compile with npm `solc` (solc-js). Match on-chain `contracts.bytecode` (ignore Solidity metadata CBOR suffix for comparison). On match: UPDATE `contracts` set `is_verified=true`, `source_code`, `abi`, `compiler_version`, optimization fields. On mismatch: 400 `{ error: "bytecode_mismatch" }`. Unknown address: 404. Do not insert a contract row that the indexer did not create.

Replace the Wave 7 test that expects POST `/verify` → 405 with: path-traversal compilerVersion → 400; valid compile+match against a seeded bytecode → is_verified true; valid compile mismatch → 400; still no INSERT into chain tables.

## POST /contract/call (view)
Body `{ address, data }` hex. If `GOLDSCAN_RPC_URL` unset, 503 `{ error: "rpc_unavailable" }`. If set, `eth_call` via a small RPC helper (do not use frontend). Tests: unset → 503; with a mock http RPC returning `0x000…01` → that result. This is a view call, not a chain-data write.

Write encode helper GET or POST `/contract/encode` `{ address, signature, args }` → `{ to, data }` for the write UI. No send.

## Tests
- Holders per GOLD id 1 vs 2 never equal-merged
- tokeninfo GOLD without tokenid does not return one summed supply
- block tx list for a Wave 2/3 block
- tx token transfers non-empty when fixture has transfers
- decodedInput present
- validator-set GILT vs GOLD split from Wave 8 fixture
- delegations + unbonding
- checkpoint-status halt vs committed
- governance-board votes + timelock
- verify match/mismatch/sanitize
- contract/call 503 without RPC
- stats txcount
- existing 87+ tests still pass

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Write `gold scanner v2/WAVE9-DONE.md`.

## Definition of done
All endpoints above exist and have tests. No second solvency formula. No GOLD id collapse. No commit.
