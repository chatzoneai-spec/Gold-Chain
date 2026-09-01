# Wave 0 — Done Report

## Deleted top-level paths

- `scan/goldscan` (entire Elixir umbrella, GPLv3 — 7814 files staged for deletion via `git rm -rf`)
- `scan/goldscan-frontend` (entire stock frontend — included in the same deletion batch)

No additional top-level paths were deleted outside those two trees.

## Edited (not deleted)

- `.gitignore` — removed stale `scan/goldscan` / `scan/goldscan-frontend` entries

## Created

- `gold scanner v2/` — MIT monorepo (indexer, api, frontend, migrations tooling, CI)
- `.github/workflows/goldscan-v2.yml`

## Verification (exit codes)

| Command | Exit |
|---------|------|
| `test ! -e /workspace/scan/goldscan` | 0 |
| `test ! -e /workspace/scan/goldscan-frontend` | 0 |
| `test -d "/workspace/gold scanner v2"` | 0 |
| `test -f "/workspace/gold scanner v2/LICENSE"` | 0 |
| `test -d .../packages/indexer` | 0 |
| `test -d .../packages/api` | 0 |
| `test -d .../packages/frontend` | 0 |
| `cd "gold scanner v2" && npm install && npm test && npm run lint` | 0 |

## License scan

`rg -n -i "gpl|blockscout" "gold scanner v2" --glob '!node_modules/**' --glob '!WAVE0-DONE.md'`

- **blockscout**: 0 hits
- **gpl**: hits only in `package-lock.json` (transitive npm dependency license metadata, e.g. LGPL-3.0-or-later on `@img/*` packages) — no Blockscout/GPL source copied

## Leftover old-path grep

`rg -n "scan/goldscan|goldscan-frontend|ghcr.io/goldscan" /workspace --glob '!.git/**' --glob '!**/node_modules/**' --glob '!**/.hermes/**'`

- **0 hits** (exit 1 = no matches)

## Not done (per spec)

- No commit
- No push
