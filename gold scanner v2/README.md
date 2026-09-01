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
