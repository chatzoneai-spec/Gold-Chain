# Wave 1 — Done Report

## Scope delivered

- Five PostgreSQL migrations under `migrations/`
- Finality owner module at `packages/indexer/src/finality.ts`
- Schema + finality tests under `packages/indexer/src/`
- PostgreSQL 16 installed locally; database `goldscan_v2_test` created

## Locked enums (exact strings)

- `finality_status`: `pending`, `finalized`, `reverted`
- `goldchain_bridge_state` (`bridge_state` column): `locked`, `synced`, `minted_or_credited`, `burned_or_debited`, `released`
- `route_asset`: `paxg`, `xaut`

## ERC1155 per-ID separation

- `gold_supply.token_id` is the primary key; rows for token_id `1` and `2` are separate
- `token_balances` primary key is `(address, contract_address, token_id)`
- `token_transfers` unique key is `(transaction_hash, log_index, token_id)` with erc1155 `token_id NOT NULL` check

## Postgres setup

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 16 main start
sudo -u postgres createdb goldscan_v2_test
sudo -u postgres psql -c "CREATE ROLE ubuntu LOGIN SUPERUSER;"
```

Tests and migrations use:

```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
```

(`USER` in this environment is an Ethereum address; the connection string must include an explicit Postgres role.)

## Migration commands (exit codes)

| Command | Exit |
|---------|------|
| `cd "/workspace/gold scanner v2" && export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql" && npm run migrate:up` | 0 |
| `cd "/workspace/gold scanner v2" && export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql" && npm run migrate:down -- 5` | 0 |

`migrate:up` applies migrations 1–5. `migrate:down -- 5` rolls all five back cleanly.

## Verification commands (exit codes)

| Command | Exit |
|---------|------|
| `cd "/workspace/gold scanner v2" && export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql" && npm test` | 0 |
| `cd "/workspace/gold scanner v2" && npm run lint` | 0 |

## Indexer test output

```
# tests 17
# suites 3
# pass 17
# fail 0
```

Wave 1 assertions covered:

1. Migration up on empty DB
2. Migration down then up
3. Duplicate block hash rejected
4. `gold_supply` token_id 1 and 2 as separate rows; duplicate token_id rejected
5. `token_balances` allows (addr, contract, 1) and (addr, contract, 2); duplicate triple rejected
6. erc1155 `token_transfers` without `token_id` rejected
7. `bridge_state` and `route_asset` reject invalid enum values
8. Finality module: within depth → `pending`; past depth → `finalized`; reorged → `reverted`

## Files added/changed (Wave 1 only)

- `migrations/1725000000001_blocks-and-finality.js`
- `migrations/1725000000002_transactions-receipts-logs-internal-txs.js`
- `migrations/1725000000003_addresses-contracts-token-contracts.js`
- `migrations/1725000000004_token-transfers-and-balances.js`
- `migrations/1725000000005_gold-tables.js`
- `packages/indexer/src/finality.ts`
- `packages/indexer/src/finality.test.ts`
- `packages/indexer/src/schema.test.ts`
- `packages/indexer/src/test/db.ts`
- `packages/indexer/package.json` (pg devDependency)
- `README.md` (DATABASE_URL notes)

## Not done (per spec)

- No commit
- No push
- No indexer head-follower (Wave 2)
- No API routes (Wave 4/5)
- No frontend GOLD screens (Wave 6)
