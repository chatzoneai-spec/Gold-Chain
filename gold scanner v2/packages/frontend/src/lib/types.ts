export type EtherscanResponse<T = unknown> = {
  status: string;
  message: string;
  result: T;
};

export type SolvencyAsset = {
  routeAsset: "paxg" | "xaut";
  goldTokenId: string;
  lockedOnEthereum: string;
  goldSupply: string;
};

export type SolvencyResult = {
  paxg: SolvencyAsset;
  xaut: SolvencyAsset;
};

export type FinalityStatus = "pending" | "finalized" | "reverted";

export type BridgeTransferRow = {
  id: number;
  routeAsset: string;
  rootAmount: string;
  childAmount: string;
  bridgeState: string;
  finalityStatus: FinalityStatus;
  rootTxHash: string | null;
  childTxHash: string | null;
  direction: string;
  sourceLayer: string;
  receiptCorrelationId: string | null;
  amountExact: boolean;
  complete: boolean;
};

export type BridgeActivity = {
  finalized: BridgeTransferRow[];
  pending: BridgeTransferRow[];
};

export type RedemptionReceiptStage = {
  bridgeState: string;
  routeAsset: string;
  rootAmount: string;
  childAmount: string;
  finalityStatus: FinalityStatus;
  rootTxHash: string | null;
  childTxHash: string | null;
  sourceLayer: string;
  amountExact: boolean;
  complete: boolean;
};

export type RedemptionReceipt = {
  receiptCorrelationId: string;
  routeAsset: string;
  stages: RedemptionReceiptStage[];
  complete: boolean;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export type MigrationStatus =
  | "INACTIVE"
  | "PREPARE"
  | "ACTIVE"
  | "EXIT_ONLY"
  | "FINALIZED";

export type BlockRecord = {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  validator: string;
  gasUsed: string;
  gasLimit: string;
  finalityStatus: FinalityStatus;
};

export type TransactionRecord = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  finalityStatus: FinalityStatus;
  decodedInput?: DecodedInput;
  fee?: string;
};

export type DecodedInput = {
  selector: string;
  signature: string | null;
  args: unknown[] | null;
};

export type AddressTokenBalance = {
  contractAddress: string;
  tokenID: string;
  balance: string;
  tokenStandard: string;
};

export type TokenListEntry = {
  contractAddress: string;
  tokenType: string;
  tokenName: string;
  symbol: string;
  divisor: string;
};

export type TokenHolder = {
  address: string;
  balance: string;
  tokenId?: string;
};

export type GoldHolders = {
  id1: TokenHolder[];
  id2: TokenHolder[];
};

export type ValidatorSetRow = {
  validatorAddress: string;
  votingPower: string;
  giltStake: string;
  goldId1Stake: string;
  goldId2Stake: string;
  commissionBps: number;
  jailed: boolean;
  elected: boolean;
};

export type DelegationRow = {
  delegator: string;
  validator: string;
  stakeAsset: string;
  amount: string;
};

export type UnbondingRow = {
  delegator: string;
  validator: string | null;
  stakeAsset: string;
  amount: string;
};

export type DelegationsResult = {
  delegations: DelegationRow[];
  unbonding: UnbondingRow[];
};

export type CheckpointStatus = {
  lastCommitted: {
    blockNumber: number;
    checkpointHash: string;
    validatorSetHash: string;
  } | null;
  halted: boolean;
  diverged: boolean;
};

export type GovernanceVote = {
  voterAddress: string;
  support: string;
};

export type GovernanceProposal = {
  proposalId: string;
  proposerAddress: string | null;
  votes: GovernanceVote[];
};

export type TimelockQueueItem = {
  proposalId: string;
  timelockEta: string;
};

export type GovernanceBoard = {
  proposals: GovernanceProposal[];
  timelockQueue: TimelockQueueItem[];
};

export type LiveFeedEvent =
  | {
      type: "block";
      number: string;
      hash: string;
      timestamp: string;
      finalityStatus: string;
    }
  | {
      type: "tx";
      hash: string;
      blockNumber: string;
      from: string;
      to: string;
      value: string;
      finalityStatus: string;
    };

export type VerifyResult =
  | { verified: true; address: string }
  | { error: string };

export type TokenInfo = {
  contractAddress: string;
  tokenType: string;
  tokenName: string;
  symbol: string;
  divisor: string;
  totalSupply: string;
};

export const GOLD_CONTRACT =
  process.env.NEXT_PUBLIC_GOLD_CONTRACT ??
  "0x000000000000000000000000000000000000f001";
