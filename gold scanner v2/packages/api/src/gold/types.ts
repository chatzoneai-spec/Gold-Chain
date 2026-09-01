export type MigrationStatus =
  | "INACTIVE"
  | "PREPARE"
  | "ACTIVE"
  | "EXIT_ONLY"
  | "FINALIZED";

export type RouteAsset = "paxg" | "xaut";

export type BridgeState =
  | "locked"
  | "synced"
  | "minted_or_credited"
  | "burned_or_debited"
  | "released";

export type FinalityStatus = "pending" | "finalized" | "reverted";

export type SolvencyAsset = {
  routeAsset: RouteAsset;
  goldTokenId: string;
  lockedOnEthereum: string;
  goldSupply: string;
};

export type SolvencyResult = {
  paxg: SolvencyAsset;
  xaut: SolvencyAsset;
};

export type BridgeTransferRow = {
  id: number;
  routeAsset: RouteAsset;
  rootAmount: string;
  childAmount: string;
  bridgeState: BridgeState;
  finalityStatus: FinalityStatus;
  rootTxHash: string | null;
  childTxHash: string | null;
  direction: "deposit" | "exit";
  sourceLayer: "ethereum" | "gold_chain";
  receiptCorrelationId: string | null;
  amountExact: boolean;
  complete: boolean;
};

export type RedemptionReceiptStage = {
  bridgeState: BridgeState;
  routeAsset: RouteAsset;
  rootAmount: string;
  childAmount: string;
  finalityStatus: FinalityStatus;
  rootTxHash: string | null;
  childTxHash: string | null;
  sourceLayer: "ethereum" | "gold_chain";
  amountExact: boolean;
  complete: boolean;
};

export type RedemptionReceipt = {
  receiptCorrelationId: string;
  routeAsset: RouteAsset;
  stages: RedemptionReceiptStage[];
  complete: boolean;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export type JsonResponse = {
  status: number;
  body: unknown;
};
