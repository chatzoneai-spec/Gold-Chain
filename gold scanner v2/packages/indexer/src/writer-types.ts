import type { FinalityStatus } from "./finality.js";

export type BlockRow = {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: Date;
  validatorAddress: string;
  gasUsed: bigint;
  gasLimit: bigint;
  finalityStatus: FinalityStatus;
};

export type TransactionRow = {
  hash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string | null;
  value: string;
  gas: bigint;
  gasPrice: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  input: string;
  nonce: bigint;
  transactionIndex: number;
  status: number;
  finalityStatus: FinalityStatus;
};

export type ReceiptRow = {
  transactionHash: string;
  cumulativeGasUsed: bigint;
  gasUsed: bigint;
  contractAddress: string | null;
  status: number;
  logsBloom: string;
};

export type LogRow = {
  transactionHash: string;
  blockNumber: number;
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  finalityStatus: FinalityStatus;
};

export type InternalTxRow = {
  transactionHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string | null;
  value: string;
  type: string | null;
  traceAddress: string;
  error: string | null;
  finalityStatus: FinalityStatus;
};

export type TokenTransferRow = {
  blockNumber: number;
  transactionHash: string;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  tokenStandard: "erc20" | "erc721" | "erc1155";
  tokenId: string | null;
  amount: string;
  logIndex: number;
  finalityStatus: FinalityStatus;
};

export type BridgeTransferRow = {
  routeAsset: "paxg" | "xaut";
  rootAmount: string;
  childAmount: string;
  bridgeState:
    | "locked"
    | "synced"
    | "minted_or_credited"
    | "burned_or_debited"
    | "released";
  finalityStatus: FinalityStatus;
  rootTxHash: string | null;
  childTxHash: string | null;
  direction: "deposit" | "exit";
  sourceLayer: "ethereum" | "gold_chain";
  receiptCorrelationId: string;
  amountExact: boolean;
};

export type StakingEventRow = {
  blockNumber: number;
  transactionHash: string;
  eventType: string;
  stakerAddress: string;
  amount: string;
  finalityStatus: FinalityStatus;
};

export type ValidatorEventRow = {
  blockNumber: number;
  transactionHash: string;
  eventType: string;
  validatorAddress: string;
  amount: string | null;
  finalityStatus: FinalityStatus;
};

export type GovernanceEventRow = {
  blockNumber: number;
  transactionHash: string;
  eventType: string;
  proposerAddress: string | null;
  proposalId: string | null;
  finalityStatus: FinalityStatus;
};

export type CheckpointRow = {
  blockNumber: number;
  checkpointHash: string;
  validatorSetHash: string;
  finalityStatus: FinalityStatus;
};
