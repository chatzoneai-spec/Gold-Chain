# Etherscan-compatible API

GoldScan v2 exposes a read-only REST API at `GET /api` using Etherscan-style query parameters.

## Common parameters

| Parameter | Description |
|-----------|-------------|
| `module` | API module: `account`, `transaction`, `tx`, `block`, `logs`, `token`, `contract` |
| `action` | Action within the module |
| `page` | Page number (default `1`) |
| `offset` | Page size (default `10`, max `100`) |
| `sort` | `asc` or `desc` (default `desc`) |

## Account module (`module=account`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `balance` | `address` | Native `GILT` balance from `addresses.gilt_balance` |
| `txlist` | `address` | Normal transactions for an address |
| `txlistinternal` | `address` | Internal transactions |
| `tokentx` | `address` | ERC-20 token transfers |
| `tokennfttx` | `address` | ERC-721 token transfers |
| `token1155tx` | `address` | ERC-1155 token transfers |

Optional for tx lists: `startblock`, `endblock`, `contractaddress` (token actions), `page`, `offset`, `sort`.

## Transaction module (`module=transaction`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `gettxreceiptstatus` | `txhash` | Receipt status for a transaction |
| `getstatus` | `txhash` | Execution status for a transaction |

## Tx module (`module=tx`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `gettxbyhash` | `txhash` | Full transaction record |

## Block module (`module=block`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `getblockbynumber` | `tag` or `blockno` | Block by number (`latest` supported) |
| `getblockbyhash` | `hash` | Block by hash |

## Logs module (`module=logs`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `getLogs` | — | Event logs (`fromBlock`, `toBlock`, `address`, `topic0`–`topic3` optional) |

## Token module (`module=token`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `tokeninfo` | `contractaddress` | Token contract metadata |

## Contract module (`module=contract`)

| Action | Required params | Description |
|--------|-----------------|-------------|
| `getabi` | `address` | Contract ABI (verified contracts only) |
| `getsourcecode` | `address` | Contract source metadata |

## Response shape

```json
{
  "status": "1",
  "message": "OK",
  "result": {}
}
```

Errors use `status: "0"` and `message: "NOTOK"`. Empty lists return `status: "1"` with `result: []`.

## WebSocket live feed

Connect to `ws://<host>/ws`. Server pushes:

- `{ "type": "block", "number", "hash", "timestamp", "finalityStatus" }`
- `{ "type": "tx", "hash", "blockNumber", "from", "to", "value", "finalityStatus" }`

## Read-only policy

Only `GET` is allowed on `/api`. `POST`, `PUT`, `PATCH`, and `DELETE` return HTTP `405`.
