# Wave 1 — Datastore schema

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL/Elixir. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59` — stay on it.
NEW ROOT: `/workspace/gold scanner v2`

## Outcome
Postgres schema + one finality owner module. ERC1155 per-ID separation enforced at the DB. Enum values match the blueprint exactly. Migration up/down tests pass against local PostgreSQL.

## Repo map
- Migrations: `/workspace/gold scanner v2/migrations/`
- Finality owner (the only module that decides final vs not): `/workspace/gold scanner v2/packages/indexer/src/finality.ts`
- Schema tests: `/workspace/gold scanner v2/packages/indexer/src/schema.test.ts` (and more files if needed; each file preferably <500 lines)
- Do not touch `scan/` (already deleted). Do not add GOLD screens or API routes. Schema + finality module + tests only.

## Locked enums (exact strings)
`bridge_state` / `goldchain_bridge_state`:
- `locked`
- `synced`
- `minted_or_credited`
- `burned_or_debited`
- `released`

`route_asset`:
- `paxg`
- `xaut`

`finality_status`:
- `pending`
- `finalized`
- `reverted`

GOLD token IDs: `1` = PAXG-backed, `2` = XAUT-backed. Separate rows everywhere. Never a DB constraint that merges them.

Bridge amount semantics (do not invert): Ethereum-side PAXG/XAUT are locked/released. Gold Chain GOLD is minted/credited and burned/debited. Do not add a column or enum that treats root PAXG/XAUT as burnable.

## Tables (exact set)
One migration per cohesive group, in this order:

### Migration 1 — blocks + finality column
- `blocks`: number (unique), hash (unique), parent_hash, timestamp, validator/producer address, gas_used, gas_limit, finality_status (enum above). Indexes on (number), (hash).

### Migration 2 — transactions, receipts, logs, internal_txs
- `transactions`: hash unique, block_number FK, from_address, to_address, value, gas, gas_price/fee fields, input, nonce, transaction_index, status, finality_status. Indexes on (hash), (block_number), (from_address), (to_address).
- `receipts`: tx hash FK, cumulative_gas_used, gas_used, contract_address, status, logs_bloom.
- `logs`: tx hash, block_number, address, topics, data, log_index, finality_status.
- `internal_txs`: tx hash, block_number, from_address, to_address, value, type, trace fields needed for display, finality_status.

### Migration 3 — addresses, contracts, token_contracts
- `addresses`: address PK, gilt_balance (canonical from indexer later).
- `contracts`: address PK/FK, bytecode, is_verified, compiler fields as needed for later verification wave (nullable).
- `token_contracts`: address PK, type enum `erc20` | `erc721` | `erc1155`, name, symbol, decimals nullable.

### Migration 4 — token_transfers + token_balances (per-ID)
- `token_transfers`: id, block_number, tx_hash, contract_address, from_address, to_address, token_standard (`erc20`|`erc721`|`erc1155`), **token_id** (numeric; required for erc721/erc1155; for erc20 store NULL), amount, log_index, finality_status.
  - Constraint: erc1155 rows MUST have token_id NOT NULL.
  - Unique (tx_hash, log_index, token_id) so TransferBatch ids do not collide.
- `token_balances`: address, contract_address, **token_id** (numeric; erc20 uses token_id 0 or NULL consistently — pick NULL for erc20 and NOT NULL for erc1155/721), balance.
  - Primary/unique key: `(address, contract_address, token_id)` with token_id defaulting to a sentinel only if NULL uniqueness is painful; preferred: `token_id NUMERIC NOT NULL` and erc20 uses `0`.
  - GOLD ID 1 and ID 2 are two rows. No unique key that drops token_id.

### Migration 5 — gold tables
- `bridge_transfers`: id, route_asset (paxg|xaut), root_amount, child_amount, bridge_state (the five values), finality_status, root_tx_hash, child_tx_hash, direction (`deposit`|`exit`), source_layer (`ethereum`|`gold_chain`), plus fields needed to link a GOLD burn to the root asset released (receipt correlation id). Non-exact scaled amounts: `amount_exact BOOLEAN NOT NULL` (true if exact; false if flagged — never silently rounded).
- `staking_events`
- `validator_events`
- `governance_events`
- `checkpoints`
- `gold_supply`: **token_id** PK or unique, supply. Separate row for 1 and for 2. No single combined supply column.

Confirmation/finality is this enum column plus `packages/indexer/src/finality.ts`. No scattered booleans like `is_final` plus `finality_status`.

## Finality module (one owner)
`packages/indexer/src/finality.ts` exports:
- configured confirmation depth
- `finalityStatusForBlock({ blockNumber, headNumber, reorged })` → `pending` | `finalized` | `reverted`
- A block is canonical/`finalized` only past the configured depth.
- Consumers must import this module. Do not reimplement in tests except by calling it.

Indexer is the only writer of these tables (enforced later). Wave 1 does not build the API write path.

## Tests (must exist and pass)
1. Migration up on empty DB succeeds.
2. Migration down then up succeeds (clean).
3. Inserting gold_supply for token_id 1 and 2 succeeds as two rows; a unique violation if inserting the same token_id twice.
4. token_balances allows (addr, goldContract, 1) and (addr, goldContract, 2) simultaneously; unique on that triple.
5. token_transfers erc1155 without token_id is rejected.
6. bridge_state and route_asset reject values outside the locked enums.
7. finality module: block within depth → pending; past depth → finalized; reorged → reverted.

Edge cases: empty DB, duplicate block hash rejected, duplicate token_id supply rejected.

## Postgres
If PostgreSQL is not installed, install it (apt) and start it. Create a local database `goldscan_v2_test` for tests. Do not use SQLite. Do not skip up/down tests.

DATABASE_URL for tests: local socket/user is fine. Document in README how tests find Postgres.

## Ordered steps
1. Stay on `cursor/goldscan-v2-5d59`.
2. Write the five migrations.
3. Write finality.ts (one owner).
4. Write schema tests that run migrations up/down and assert constraints.
5. Install/start Postgres if needed.
6. Run verification commands. Fix until pass.
7. Append results to `gold scanner v2/WAVE1-DONE.md`.

Do not implement indexer head-follower (Wave 2). Do not implement API (Wave 4/5). Do not implement frontend screens (Wave 6).

## Exact verification commands
```bash
cd "/workspace/gold scanner v2" && npm test && npm run lint
# plus a targeted schema test if you split scripts; npm test must include Wave 1 tests
```
Must demonstrate migrate up and migrate down against Postgres (include the commands you ran and exit codes in WAVE1-DONE.md).

## Definition of done
- Schema migrates clean up and down.
- Tests pass.
- ERC1155 per-ID separation enforced at the DB.
- Enum values match the blueprint exactly.
- One finality module, one finality_status column family, no extra boolean flags.
- No GPL copy. Files preferably <500 lines.
- No commit.
