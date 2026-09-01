# Wave 6 — Frontend

You are a Composer workhorse. Execute this spec exactly. Do not invent architecture. Do not copy GPL or the deleted Blockscout frontend. Do not commit. Do not push.

WORKSPACE: `/workspace`
BRANCH: `cursor/goldscan-v2-5d59`
ROOT: `/workspace/gold scanner v2/packages/frontend`

## Outcome
All screens in the plan §3. Presentation only. Consumes the API. Loading / empty / error / retry states before polish. Per-ID GOLD never collapsed. Solvency dashboard is the homepage hero. No canonical value computed client-side (no summing PAXG+XAUT, no local solvency math).

## Screens (all required)
### Core EVM
- Home/dashboard: latest blocks, latest txs, chain stats (block time, gas, tx count, GILT price if API provides). **Solvency hero on this page.**
- Block list + block detail: number, hash, timestamp, validator/producer, gas used/limit, tx list, finality state.
- Transaction list + tx detail: hash, status, from/to, value, gas, fee, decoded input, event logs, internal txs, token transfers.
- Address page: GILT balance, token holdings including per-ID GOLD, tx history, internal txs; if contract: verified code + read/write UI.
- Token list + token detail: supply, holders, transfers. ERC20, ERC721, ERC1155. GOLD token page shows ID 1 and ID 2 as distinct sections.
- Contract verification + read/write UI (forms; mocked API in tests).
- Global search: address / tx hash / block number / token from one box.

### Gold-chain
- Solvency: locked PAXG vs GOLD ID 1; locked XAUT vs GOLD ID 2; per-asset; show finality state. Homepage hero.
- Redemption receipts: GOLD burn linked to root asset released; trail locked→synced→minted_or_credited→burned_or_debited→released.
- Bridge activity: deposits/exits; finalized vs pending separated; pending never shown as complete.
- GOLD ERC1155 page: separate balances/holders/supply per token ID 1 and 2.
- Staking / validators: list, voting power, GILT vs GOLD stake split, commission, jailed, elected set.
- Delegation: per-address GILT and GOLD delegations, unbonding queue.
- Checkpoints: last committed, checkpoint-chain status, divergence/halt state.
- Governance: proposals, votes, timelock queue.
- Migration status: INACTIVE/PREPARE/ACTIVE/EXIT_ONLY/FINALIZED — shown when relevant.

## Rules
- Fetch from API client module `src/lib/api.ts` only. Display JSON fields. Do not compute solvency or combined GOLD backing.
- Clean Next.js App Router. No old frontend copy.
- Files preferably <500 lines. One route file per screen is fine.
- Tests: component/unit tests with mocked API. Must include:
  - solvency hero renders per-asset + finality
  - GOLD token page shows two IDs distinctly
  - loading, empty, error, retry for at least home and one gold page
- Do not add NFT galleries, ads, multi-chain.

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```
Frontend tests must run as part of `npm test`.

Write `WAVE6-DONE.md` at `gold scanner v2/WAVE6-DONE.md`. No commit.

## Definition of done
Screens render from mocked API; states handled; per-ID visible; no client-side canonical math. No commit.
