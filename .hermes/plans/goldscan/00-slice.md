# Wave 0 — Repo prep, cleanup, scaffolding

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not skip deletion. Do not copy GPL Blockscout / old Elixir / old frontend source into the new tree. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59` — stay on it.

## Outcome
1. Entire old Elixir fork `scan/goldscan` is deleted from the repo (gone on disk, staged as deletion).
2. Entire stock frontend `scan/goldscan-frontend` is deleted from the repo (gone on disk, staged as deletion). Default is delete all. Do not extract MIT components. Build clean.
3. Any dangling docker-compose/service files that reference deleted images `ghcr.io/goldscan/*` are gone (they live inside `scan/goldscan` and die with it; also remove any copies outside that tree if they exist).
4. New project lives in a new folder named exactly: `gold scanner v2` at repo root (`/workspace/gold scanner v2`).
5. Skeleton: Node.js + TypeScript packages `indexer`, `api`, `frontend`; Postgres schema migration tooling; CI that runs lint + tests; MIT license; one empty test that passes.
6. License scan clean: no GPL Blockscout source copied into `gold scanner v2`.

## Repo map (current)
- DELETE: `/workspace/scan/goldscan` (Elixir umbrella, GPLv3)
- DELETE: `/workspace/scan/goldscan-frontend` (stock frontend)
- CREATE: `/workspace/gold scanner v2/`
- CREATE: `/workspace/gold scanner v2/packages/indexer`
- CREATE: `/workspace/gold scanner v2/packages/api`
- CREATE: `/workspace/gold scanner v2/packages/frontend`
- CREATE: `/workspace/gold scanner v2/migrations` (tooling ready; no gold tables yet — Wave 1)
- CREATE: `/workspace/gold scanner v2/LICENSE` (MIT)
- CREATE: CI workflow that lints and tests this project

## Constraints (locked)
- MIT-owned code only. Do not copy files from `scan/goldscan` or `scan/goldscan-frontend` into the new folder.
- Reading the old tree for reference before deleting it is allowed. Copying it is forbidden.
- Every file preferably under 500 lines.
- Indexer + API: Node.js + TypeScript.
- Frontend: clean Next.js + React. Do not reuse the old frontend.
- DB: PostgreSQL. Install migration tooling now (node-pg-migrate). Wave 1 writes the schema.
- Job queue placeholder allowed (package.json dep or empty `packages/indexer/src/jobs/` with a README). One job type per file later.
- No GPL headers. No Blockscout attribution in new source.
- Do not run the chain. Do not hit live mainnet.
- Do not implement indexer/API/screens in this wave. Skeleton + delete + CI + empty test only.
- Files you may touch outside `gold scanner v2/`: deletions of `scan/goldscan`, `scan/goldscan-frontend`, and any remaining repo-root CI/env/build scripts that still point at those deleted paths or `ghcr.io/goldscan/*`. If a root script only mentioned them, remove those references. Do not rewrite unrelated repos (gilt-chain, dex, bridge).

## Ordered steps
1. Confirm branch `cursor/goldscan-v2-5d59`.
2. Delete the entire directory `/workspace/scan/goldscan` using `git rm -rf scan/goldscan`.
3. Delete the entire directory `/workspace/scan/goldscan-frontend` using `git rm -rf scan/goldscan-frontend`.
4. If `/workspace/scan` is empty after that, leave the empty dir or remove it; do not recreate the old projects.
5. Grep the whole workspace (except `.git`) for `scan/goldscan`, `goldscan-frontend`, and `ghcr.io/goldscan`. Remove remaining references in build scripts, CI, and env files. Record leftover hits that are this spec / `.hermes` / git history (git history is not a file you edit).
6. Create `/workspace/gold scanner v2` as a TypeScript npm workspaces monorepo:
   - Root `package.json` with workspaces `packages/indexer`, `packages/api`, `packages/frontend`.
   - Root scripts: `lint`, `test` (run all packages).
   - `tsconfig.base.json` shared compiler options (strict).
   - `LICENSE` MIT, copyright Gold Chain / GoldScan v2.
   - `.gitignore` for node_modules, dist, .env, coverage.
7. `packages/indexer`: TypeScript package. `src/index.ts` exports a package name string only. `src/index.test.ts` empty/smoke test that asserts the export exists. `package.json` scripts `lint` and `test` (node:test or vitest). Add `node-pg-migrate` dependency at this package or repo root. Add `migrations/` directory with a `.gitkeep` (no schema SQL yet).
8. `packages/api`: TypeScript package. `src/index.ts` exports a package name string only. Smoke test. Scripts `lint` and `test`.
9. `packages/frontend`: Next.js App Router + React + TypeScript. Minimal page that renders the text `GoldScan`. No API calls. No solvency math. `package.json` scripts `lint` and `test` (a smoke test that the app module loads, or a minimal vitest/playwright-free unit test).
10. Postgres migration tooling wired: `npm` script `migrate:up` / `migrate:down` using node-pg-migrate, pointing at `gold scanner v2/migrations`. Do not require a live Postgres for Wave 0 tests; the empty test must pass without Postgres.
11. CI: create `/workspace/.github/workflows/goldscan-v2.yml` that on push/PR runs in `gold scanner v2`: npm install, lint, test. Quote the path because it contains spaces.
12. Add a short `gold scanner v2/README.md` stating: GoldScan v2, MIT, indexer/api/frontend packages, fixtures-only tests, no live chain in CI.
13. Run verification commands below yourself. Fix until they pass.
14. Write `gold scanner v2/WAVE0-DONE.md` listing every deleted top-level path (`scan/goldscan`, `scan/goldscan-frontend`, and any extra files you deleted). This is the slice done-report.

## Exact verification commands (you MUST run these before reporting done)
```bash
test ! -e /workspace/scan/goldscan
test ! -e /workspace/scan/goldscan-frontend
test -d "/workspace/gold scanner v2"
test -f "/workspace/gold scanner v2/LICENSE"
test -d "/workspace/gold scanner v2/packages/indexer"
test -d "/workspace/gold scanner v2/packages/api"
test -d "/workspace/gold scanner v2/packages/frontend"
cd "/workspace/gold scanner v2" && npm install && npm test && npm run lint
```
Then:
```bash
# license / GPL copy scan of NEW tree only
rg -n -i "gpl|blockscout" "/workspace/gold scanner v2" --glob '!node_modules/**' --glob '!WAVE0-DONE.md'
# leftover old-path refs in build/CI/env (report hits)
rg -n "scan/goldscan|goldscan-frontend|ghcr.io/goldscan" /workspace --glob '!.git/**' --glob '!**/node_modules/**' --glob '!**/.hermes/**'
```
LICENSE file may contain the word MIT; GPL hits inside `gold scanner v2` source are a fail unless they are a sentence saying GPL code was not copied.

## Definition of done
- `scan/goldscan` does not exist.
- `scan/goldscan-frontend` does not exist.
- `gold scanner v2` exists with indexer, api, frontend packages, MIT LICENSE, migration tooling, CI workflow, passing smoke tests, lint green.
- WAVE0-DONE.md lists deleted paths.
- No GPL Blockscout source in the new tree.
- You did not commit.

## Done-report must include
- Every deleted path
- Commands run + exit codes
- License scan result
- Grep leftover list
