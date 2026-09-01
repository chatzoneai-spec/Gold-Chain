# GoldScan v2

MIT-licensed Gold Chain block explorer monorepo.

## Packages

- `packages/indexer` — chain indexer (skeleton)
- `packages/api` — HTTP API (skeleton)
- `packages/frontend` — Next.js UI (skeleton)

## Development

```bash
npm install
npm run lint
npm test
```

Tests are fixtures-only smoke checks. CI does not run a live chain or hit mainnet.

## Migrations

PostgreSQL migrations live in `migrations/`. Wave 1 adds schema.

```bash
npm run migrate:up
npm run migrate:down
```

Set `DATABASE_URL` to a local PostgreSQL database before running migrations or schema tests. The default test database is `goldscan_v2_test`:

```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
# or: export DATABASE_URL="postgres://postgres@localhost:5432/goldscan_v2_test"
```

Create the database once (as the `postgres` OS user):

```bash
sudo -u postgres createdb goldscan_v2_test
```
