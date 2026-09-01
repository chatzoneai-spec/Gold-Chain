export type RpcBlock = {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactions: RpcTransaction[];
};

export type RpcTransaction = {
  hash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  input: string;
  nonce: string;
  transactionIndex: string;
};

export type RpcReceipt = {
  transactionHash: string;
  blockNumber: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress: string | null;
  status: string;
  logsBloom: string;
  logs: RpcLog[];
};

export type RpcLog = {
  transactionHash: string;
  blockNumber: string;
  address: string;
  topics: string[];
  data: string;
  logIndex: string;
};

export type RpcTrace = {
  type: string;
  from: string;
  to?: string;
  value?: string;
  error?: string;
  traceAddress?: number[];
  calls?: RpcTrace[];
};

export type RpcClient = {
  getBlockNumber(): Promise<number>;
  getBlockByNumber(blockNumber: number): Promise<RpcBlock | null>;
  getTransactionReceipt(txHash: string): Promise<RpcReceipt | null>;
  getTransactionTraces(txHash: string): Promise<RpcTrace[]>;
};
