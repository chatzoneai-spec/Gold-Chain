# Wave 6 — Frontend

## Branch
`cursor/goldscan-v2-5d59` (no commit, no push)

## Verification
```bash
export DATABASE_URL="postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql"
export GOLDSCAN_CONFIRMATION_DEPTH=2
cd "/workspace/gold scanner v2" && npm test && npm run lint
```

Exit code: 0 (33 indexer + 29 api + 9 frontend tests; lint clean).

## Routes added
| Route | Screen |
|-------|--------|
| `/` | Home/dashboard — solvency hero, latest blocks, latest txs, chain stats |
| `/blocks` | Block list |
| `/blocks/[number]` | Block detail |
| `/txs` | Transaction list |
| `/tx/[hash]` | Transaction detail |
| `/address/[address]` | Address page (GILT, per-ID GOLD, txs, contract read/write) |
| `/tokens` | Token list / lookup |
| `/tokens/[address]` | Token detail (GOLD shows ID 1 & 2 sections) |
| `/verify` | Contract verification + read/write UI (mocked submit) |
| `/search` | Global search |
| `/solvency` | Solvency dashboard |
| `/redemption` | Redemption receipts list |
| `/redemption/[id]` | Redemption receipt detail |
| `/bridge` | Bridge activity (finalized vs pending) |
| `/gold` | GOLD ERC1155 per-ID page |
| `/staking` | Staking & validators |
| `/delegation` | Delegation |
| `/checkpoints` | Checkpoints |
| `/governance` | Governance |
| `/migration` | Migration status |

## Rules followed
- All fetches via `src/lib/api.ts` only
- API JSON displayed; no client-side solvency math
- GOLD ID 1 and 2 always separate sections
- Solvency hero on homepage
- Loading / empty / error / retry states on data views
- Component tests with mocked data (no GPL, no Blockscout copy)
