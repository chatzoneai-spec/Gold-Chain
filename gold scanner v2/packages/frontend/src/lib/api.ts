import type {
  AddressTokenBalance,
  BlockRecord,
  BridgeActivity,
  CheckpointStatus,
  DelegationsResult,
  EtherscanResponse,
  GovernanceBoard,
  GoldHolders,
  MigrationStatus,
  Paginated,
  RedemptionReceipt,
  SolvencyResult,
  TokenHolder,
  TokenInfo,
  TokenListEntry,
  TransactionRecord,
  ValidatorSetRow,
  VerifyResult,
} from "./types.js";

const EVM_BASE = process.env.NEXT_PUBLIC_EVM_API_BASE ?? "/api";
const GOLD_BASE = process.env.NEXT_PUBLIC_GOLD_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    throw new ApiError(`HTTP ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

async function evmGet<T>(
  params: Record<string, string>,
): Promise<EtherscanResponse<T>> {
  const search = new URLSearchParams(params);
  return fetchJson<EtherscanResponse<T>>(`${EVM_BASE}?${search}`);
}

async function goldGet<T>(path: string, query?: Record<string, string>): Promise<T> {
  const search = query ? `?${new URLSearchParams(query)}` : "";
  const body = await fetchJson<T | { error: string }>(`${GOLD_BASE}${path}${search}`);
  if (body && typeof body === "object" && "error" in body) {
    throw new ApiError(String((body as { error: string }).error));
  }
  return body as T;
}

function unwrap<T>(response: EtherscanResponse<T>): T {
  if (response.status !== "1") {
    throw new ApiError(response.message || "API error");
  }
  return response.result;
}

export async function fetchSolvency(): Promise<SolvencyResult> {
  return goldGet<SolvencyResult>("/gold/solvency");
}

export async function fetchBridgeActivity(): Promise<BridgeActivity> {
  return goldGet<BridgeActivity>("/gold/bridge-activity");
}

export async function fetchRedemptionReceipts(
  page = 1,
  limit = 20,
): Promise<Paginated<RedemptionReceipt>> {
  return goldGet<Paginated<RedemptionReceipt>>("/gold/redemption-receipts", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchRedemptionReceipt(
  receiptCorrelationId: string,
): Promise<RedemptionReceipt> {
  return goldGet<RedemptionReceipt>("/gold/redemption-receipts", {
    receiptCorrelationId,
  });
}

export async function fetchValidatorSet(): Promise<ValidatorSetRow[]> {
  return goldGet<ValidatorSetRow[]>("/gold/validator-set");
}

export async function fetchDelegations(): Promise<DelegationsResult> {
  return goldGet<DelegationsResult>("/gold/delegations");
}

export async function fetchCheckpointStatus(): Promise<CheckpointStatus> {
  return goldGet<CheckpointStatus>("/gold/checkpoint-status");
}

export async function fetchGovernanceBoard(): Promise<GovernanceBoard> {
  return goldGet<GovernanceBoard>("/gold/governance-board");
}

export async function fetchTxCount(): Promise<string> {
  return unwrap(
    await evmGet<string>({
      module: "stats",
      action: "txcount",
    }),
  );
}

export async function fetchBlockTxList(blockno: string): Promise<TransactionRecord[]> {
  return unwrap(
    await evmGet<TransactionRecord[]>({
      module: "block",
      action: "getblocktxlist",
      blockno,
    }),
  );
}

export async function fetchAddressTokenBalances(
  address: string,
): Promise<AddressTokenBalance[]> {
  return unwrap(
    await evmGet<AddressTokenBalance[]>({
      module: "account",
      action: "addresstokenbalance",
      address,
    }),
  );
}

export async function fetchTokenList(): Promise<TokenListEntry[]> {
  return unwrap(
    await evmGet<TokenListEntry[]>({
      module: "token",
      action: "tokenlist",
    }),
  );
}

export async function fetchTokenHolders(
  contractaddress: string,
  tokenid?: string,
): Promise<TokenHolder[] | GoldHolders> {
  const params: Record<string, string> = {
    module: "token",
    action: "tokenholderlist",
    contractaddress,
  };
  if (tokenid) {
    params.tokenid = tokenid;
  }
  return unwrap(await evmGet<TokenHolder[] | GoldHolders>(params));
}

export async function fetchTokenTransfers(contractaddress: string, offset = 20) {
  return unwrap(
    await evmGet<Record<string, string>[]>({
      module: "account",
      action: "tokentx",
      contractaddress,
      offset: String(offset),
    }),
  );
}

export async function fetchTxTokenTransfers(txhash: string) {
  return unwrap(
    await evmGet<Record<string, string>[]>({
      module: "account",
      action: "tokentx",
      txhash,
    }),
  );
}

export async function postVerify(body: {
  address: string;
  source: string;
  compilerVersion: string;
  optimizationEnabled?: boolean;
  optimizationRuns?: number;
}): Promise<VerifyResult> {
  const response = await fetch("/contract/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as VerifyResult;
  if (!response.ok) {
    throw new ApiError(
      "error" in data ? String(data.error) : `HTTP ${response.status}`,
      response.status,
    );
  }
  return data;
}

export async function postContractCall(body: {
  address: string;
  data: string;
}): Promise<{ result: string }> {
  return fetchJson<{ result: string }>("/contract/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postContractEncode(body: {
  address: string;
  signature: string;
  args?: unknown[];
}): Promise<{ to: string; data: string }> {
  return fetchJson<{ to: string; data: string }>("/contract/encode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchStaking(page = 1, limit = 20) {
  return goldGet<Paginated<Record<string, unknown>>>("/gold/staking", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchValidators(page = 1, limit = 20) {
  return goldGet<Paginated<Record<string, unknown>>>("/gold/validators", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchDelegation(page = 1, limit = 20) {
  return goldGet<Paginated<Record<string, unknown>>>("/gold/delegation", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchCheckpoints(page = 1, limit = 20) {
  return goldGet<Paginated<Record<string, unknown>>>("/gold/checkpoints", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchGovernance(page = 1, limit = 20) {
  return goldGet<Paginated<Record<string, unknown>>>("/gold/governance", {
    page: String(page),
    limit: String(limit),
  });
}

export async function fetchMigrationStatus(): Promise<{ status: MigrationStatus }> {
  return goldGet<{ status: MigrationStatus }>("/gold/migration-status");
}

export async function fetchLatestBlock(): Promise<BlockRecord> {
  return unwrap(
    await evmGet<BlockRecord>({
      module: "block",
      action: "getblockbynumber",
      tag: "latest",
    }),
  );
}

export async function fetchBlockByNumber(blockno: string): Promise<BlockRecord> {
  return unwrap(
    await evmGet<BlockRecord>({
      module: "block",
      action: "getblockbynumber",
      blockno,
    }),
  );
}

export async function fetchBlockByHash(hash: string): Promise<BlockRecord> {
  return unwrap(
    await evmGet<BlockRecord>({
      module: "block",
      action: "getblockbyhash",
      hash,
    }),
  );
}

export async function fetchRecentBlocks(count = 10): Promise<BlockRecord[]> {
  const latest = await fetchLatestBlock();
  const latestNum = Number.parseInt(latest.number, 10);
  const blocks: BlockRecord[] = [];
  for (let i = 0; i < count && latestNum - i >= 0; i += 1) {
    if (i === 0) {
      blocks.push(latest);
    } else {
      blocks.push(await fetchBlockByNumber(String(latestNum - i)));
    }
  }
  return blocks;
}

export async function fetchTransaction(hash: string): Promise<TransactionRecord> {
  return unwrap(
    await evmGet<TransactionRecord>({
      module: "tx",
      action: "gettxbyhash",
      txhash: hash,
    }),
  );
}

export async function fetchRecentTransactions(limit = 10): Promise<TransactionRecord[]> {
  const logs = unwrap(
    await evmGet<
      Array<{
        transactionHash: string;
      }>
    >({
      module: "logs",
      action: "getLogs",
      offset: String(limit * 2),
    }),
  );
  const seen = new Set<string>();
  const txs: TransactionRecord[] = [];
  for (const log of logs) {
    const hash = log.transactionHash;
    if (!hash || seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    try {
      txs.push(await fetchTransaction(hash));
    } catch {
      // skip missing tx
    }
    if (txs.length >= limit) {
      break;
    }
  }
  return txs;
}

export async function fetchAddressBalance(address: string): Promise<string> {
  return unwrap(
    await evmGet<string>({
      module: "account",
      action: "balance",
      address,
    }),
  );
}

export async function fetchAddressTxList(address: string, offset = 10) {
  return unwrap(
    await evmGet<TransactionRecord[]>({
      module: "account",
      action: "txlist",
      address,
      offset: String(offset),
    }),
  );
}

export async function fetchAddressInternalTxList(address: string, offset = 10) {
  return unwrap(
    await evmGet<Record<string, string>[]>({
      module: "account",
      action: "txlistinternal",
      address,
      offset: String(offset),
    }),
  );
}

export async function fetchAddressTokenTx(
  address: string,
  standard: "tokentx" | "tokennfttx" | "token1155tx",
  contractaddress?: string,
  offset = 10,
) {
  const params: Record<string, string> = {
    module: "account",
    action: standard,
    address,
    offset: String(offset),
  };
  if (contractaddress) {
    params.contractaddress = contractaddress;
  }
  return unwrap(await evmGet<Record<string, string>[]>(params));
}

export async function fetchTokenInfo(contractaddress: string): Promise<TokenInfo[]> {
  return unwrap(
    await evmGet<TokenInfo[]>({
      module: "token",
      action: "tokeninfo",
      contractaddress,
    }),
  );
}

export async function fetchContractAbi(address: string): Promise<string> {
  return unwrap(
    await evmGet<string>({
      module: "contract",
      action: "getabi",
      address,
    }),
  );
}

export async function fetchContractSource(address: string) {
  return unwrap(
    await evmGet<Record<string, string>[]>({
      module: "contract",
      action: "getsourcecode",
      address,
    }),
  );
}

export async function fetchTxLogs(txhash: string) {
  const logs = unwrap(
    await evmGet<
      Array<{
        transactionHash: string;
        blockNumber: string;
        address: string;
        topics: string[];
        data: string;
        logIndex: string;
        finalityStatus: string;
      }>
    >({
      module: "logs",
      action: "getLogs",
      offset: "100",
    }),
  );
  return logs.filter((log) => log.transactionHash === txhash);
}

export async function fetchTxReceiptStatus(txhash: string) {
  return unwrap(
    await evmGet<Record<string, string>>({
      module: "transaction",
      action: "gettxreceiptstatus",
      txhash,
    }),
  );
}

export type SearchResult =
  | { type: "block"; data: BlockRecord }
  | { type: "transaction"; data: TransactionRecord }
  | { type: "address"; data: { address: string; balance: string } }
  | { type: "token"; data: TokenInfo[] };

export async function globalSearch(query: string): Promise<SearchResult | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    try {
      const block = await fetchBlockByNumber(trimmed);
      return { type: "block", data: block };
    } catch {
      return null;
    }
  }

  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    try {
      const tx = await fetchTransaction(trimmed.toLowerCase());
      return { type: "transaction", data: tx };
    } catch {
      try {
        const block = await fetchBlockByHash(trimmed.toLowerCase());
        return { type: "block", data: block };
      } catch {
        return null;
      }
    }
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    const address = trimmed.toLowerCase();
    try {
      const token = await fetchTokenInfo(address);
      return { type: "token", data: token };
    } catch {
      const balance = await fetchAddressBalance(address);
      return { type: "address", data: { address, balance } };
    }
  }

  return null;
}
