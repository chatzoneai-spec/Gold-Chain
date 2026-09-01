# Indexer jobs

One job type per file. Each job calls `writer.ts` for all SQL writes.

- `receipts.ts` — transaction receipt persistence
- `logs.ts` — event log persistence
- `internal-txs.ts` — trace/internal transaction persistence
- `contract-detection.ts` — contract address registration
- `token-transfers-erc20-721.ts` — ERC20/ERC721 Transfer topic decoding (no ERC1155 in Wave 2)
- `fan-out.ts` — per-block job orchestration
