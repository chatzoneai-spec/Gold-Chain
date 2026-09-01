/** Documented fixture topic strings for gold-chain event decoding in tests. */

export const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

export const TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

export const GOLD_BRIDGE_EVENT_TOPIC =
  "0xa000000000000000000000000000000000000000000000000000000000000001";

export const GOLD_STAKING_EVENT_TOPIC =
  "0xa000000000000000000000000000000000000000000000000000000000000002";

export const GOLD_VALIDATOR_EVENT_TOPIC =
  "0xa000000000000000000000000000000000000000000000000000000000000003";

export const GOLD_GOVERNANCE_EVENT_TOPIC =
  "0xa000000000000000000000000000000000000000000000000000000000000004";

export const GOLD_CHECKPOINT_EVENT_TOPIC =
  "0xa000000000000000000000000000000000000000000000000000000000000005";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export const XAUT_SCALE = 1_000_000_000_000n;

export type RouteAsset = "paxg" | "xaut";
export type BridgeState =
  | "locked"
  | "synced"
  | "minted_or_credited"
  | "burned_or_debited"
  | "released";
export type BridgeDirection = "deposit" | "exit";
export type SourceLayer = "ethereum" | "gold_chain";

const ROUTE_ASSET_CODES: Record<number, RouteAsset> = {
  0: "paxg",
  1: "xaut",
};

const BRIDGE_STATE_CODES: Record<number, BridgeState> = {
  0: "locked",
  1: "synced",
  2: "minted_or_credited",
  3: "burned_or_debited",
  4: "released",
};

const DIRECTION_CODES: Record<number, BridgeDirection> = {
  0: "deposit",
  1: "exit",
};

const SOURCE_LAYER_CODES: Record<number, SourceLayer> = {
  0: "ethereum",
  1: "gold_chain",
};

export function routeAssetFromCode(code: number): RouteAsset {
  const asset = ROUTE_ASSET_CODES[code];
  if (!asset) {
    throw new Error(`Unknown route asset code: ${code}`);
  }
  return asset;
}

export function bridgeStateFromCode(code: number): BridgeState {
  const state = BRIDGE_STATE_CODES[code];
  if (!state) {
    throw new Error(`Unknown bridge state code: ${code}`);
  }
  return state;
}

export function directionFromCode(code: number): BridgeDirection {
  const direction = DIRECTION_CODES[code];
  if (!direction) {
    throw new Error(`Unknown bridge direction code: ${code}`);
  }
  return direction;
}

export function sourceLayerFromCode(code: number): SourceLayer {
  const layer = SOURCE_LAYER_CODES[code];
  if (!layer) {
    throw new Error(`Unknown source layer code: ${code}`);
  }
  return layer;
}

export function goldTokenIdForRoute(routeAsset: RouteAsset): string {
  return routeAsset === "paxg" ? "1" : "2";
}

export type StakeAsset = "gilt" | "gold_id_1" | "gold_id_2";
export type ChainStatus = "committed" | "diverged" | "halted";
export type GovernanceSupport = "for" | "against" | "abstain";

const STAKING_EVENT_TYPES = ["stake", "unstake", "unbond"] as const;
const STAKE_ASSET_CODES: Record<number, StakeAsset> = {
  0: "gilt",
  1: "gold_id_1",
  2: "gold_id_2",
};

const VALIDATOR_EVENT_TYPES = [
  "created",
  "slashed",
  "jailed",
  "unjailed",
  "elected",
  "unelected",
] as const;

const GOVERNANCE_EVENT_TYPES = [
  "proposal_created",
  "vote",
  "queued",
  "executed",
] as const;

const GOVERNANCE_SUPPORT_CODES: Record<number, GovernanceSupport> = {
  1: "for",
  2: "against",
  3: "abstain",
};

const CHAIN_STATUS_CODES: Record<number, ChainStatus> = {
  0: "committed",
  1: "diverged",
  2: "halted",
};

export function stakingEventTypeFromCode(code: number): string {
  const eventType = STAKING_EVENT_TYPES[code];
  if (!eventType) {
    throw new Error(`Unknown staking event type code: ${code}`);
  }
  return eventType;
}

export function stakeAssetFromCode(code: number): StakeAsset {
  const asset = STAKE_ASSET_CODES[code];
  if (!asset) {
    throw new Error(`Unknown stake asset code: ${code}`);
  }
  return asset;
}

export function validatorEventTypeFromCode(code: number): string {
  const eventType = VALIDATOR_EVENT_TYPES[code];
  if (!eventType) {
    throw new Error(`Unknown validator event type code: ${code}`);
  }
  return eventType;
}

export function governanceEventTypeFromCode(code: number): string {
  const eventType = GOVERNANCE_EVENT_TYPES[code];
  if (!eventType) {
    throw new Error(`Unknown governance event type code: ${code}`);
  }
  return eventType;
}

export function governanceSupportFromCode(
  code: bigint | number,
): GovernanceSupport | null {
  if (code === 0n || code === 0) {
    return null;
  }
  const support = GOVERNANCE_SUPPORT_CODES[Number(code)];
  if (!support) {
    throw new Error(`Unknown governance support code: ${code}`);
  }
  return support;
}

export function chainStatusFromCode(code: number): ChainStatus {
  const status = CHAIN_STATUS_CODES[code];
  if (!status) {
    throw new Error(`Unknown checkpoint chain status code: ${code}`);
  }
  return status;
}

export function isAmountExactForRoute(
  routeAsset: RouteAsset,
  rootAmount: bigint,
  childAmount: bigint,
): boolean {
  if (routeAsset === "paxg") {
    return rootAmount === childAmount;
  }
  return rootAmount === childAmount * XAUT_SCALE;
}
