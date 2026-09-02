/** Real keccak256 event topics for Gold Chain indexing. */

export const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

export const TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

// GoldRedemptionRequested(address,address,uint256,uint256,uint256) — PhysicalGold1155.sol
export const GOLD_REDEMPTION_REQUESTED_TOPIC =
  "0x99baaa47b6fcfdddcf77b615c2b76998dbd04941496f1de27c21183b836e9ff7";

// LockedScaledERC1155(address,address,address,uint256,uint256,uint256) — ScaledERC1155Predicate.sol
export const LOCKED_SCALED_ERC1155_TOPIC =
  "0x2213c543677a81854e3c7dfbcfbb091309e2ef30e35a2a60bab69185b2e4ba81";

// ExitedScaledERC1155(address,address,uint256,uint256,uint256) — ScaledERC1155Predicate.sol
export const EXITED_SCALED_ERC1155_TOPIC =
  "0xbfec0e380085911b08df36cec417889b47e14715b246825974ee44c9f9f52863";

// MigrationMint(address,uint256,uint256,bytes32) — PhysicalGold1155.sol
export const MIGRATION_MINT_TOPIC =
  "0xcc7bd384ed3741ba4e0a864e9e1838c8dd0d074b8cacbef50223035c9f2e0fbd";

export const GOLD_BRIDGE_EVENT_TOPICS = [
  GOLD_REDEMPTION_REQUESTED_TOPIC,
  LOCKED_SCALED_ERC1155_TOPIC,
  EXITED_SCALED_ERC1155_TOPIC,
  MIGRATION_MINT_TOPIC,
] as const;

// TokenB1155Delegated(address,address,uint256,uint256) — StakeHubStorage.sol
export const TOKEN_B1155_DELEGATED_TOPIC =
  "0x1c6cdad339d4c06e4d8f1b3156497b8352b116f502a1314cf26b7f31b1c25345";

// TokenB1155Undelegated(address,address,uint256,uint256) — StakeHubStorage.sol
export const TOKEN_B1155_UNDELEGATED_TOPIC =
  "0x55770907598e40266e6f513879f5c303013b03051fad780d40aa21a73fd6d1f8";

// Delegated(address,address,uint256,uint256) — StakeHubStorage.sol (GILT)
export const DELEGATED_TOPIC =
  "0x24d7bda8602b916d64417f0dbfe2e2e88ec9b1157bd9f596dfdb91ba26624e04";

// Undelegated(address,address,uint256,uint256) — StakeHubStorage.sol (GILT)
export const UNDELEGATED_TOPIC =
  "0x3aace7340547de7b9156593a7652dc07ee900cea3fd8f82cb6c9d38b40829802";

export const GOLD_STAKING_EVENT_TOPICS = [
  TOKEN_B1155_DELEGATED_TOPIC,
  TOKEN_B1155_UNDELEGATED_TOPIC,
  DELEGATED_TOPIC,
  UNDELEGATED_TOPIC,
] as const;

// TokenB1155Slashed(address,uint256,uint256,uint8) — StakeHubStorage.sol
export const TOKEN_B1155_SLASHED_TOPIC =
  "0x682d87d5e46fbcb429dd1f57d61102c4a09ab45ea633029412e68585a526539a";

// ValidatorCreated(address,address,address,bytes) — StakeHubStorage.sol
export const VALIDATOR_CREATED_TOPIC =
  "0xaecd9fb95e79c75a3a1de93362c6be5fe6ab65770d8614be583884161cd8228d";

// ValidatorJailed(address) — StakeHubStorage.sol
export const VALIDATOR_JAILED_TOPIC =
  "0x4905ac32602da3fb8b4b7b00c285e5fc4c6c2308cc908b4a1e4e9625a29c90a3";

// ValidatorUnjailed(address) — StakeHubStorage.sol
export const VALIDATOR_UNJAILED_TOPIC =
  "0x9390b453426557da5ebdc31f19a37753ca04addf656d32f35232211bb2af3f19";

// ValidatorSlashed(address,uint256,uint256,uint8) — StakeHubStorage.sol
export const VALIDATOR_SLASHED_TOPIC =
  "0x6e9a2ee7aee95665e3a774a212eb11441b217e3e4656ab9563793094689aabb2";

// StakeCreditInitialized(address,address) — StakeHubStorage.sol
export const STAKE_CREDIT_INITIALIZED_TOPIC =
  "0xd481492e4e93bb36b4c12a5af93f03be3bf04b454dfbc35dd2663fa26f44d5b0";

// CommissionRateEdited(address,uint64) — StakeHubStorage.sol
export const COMMISSION_RATE_EDITED_TOPIC =
  "0x78cdd96edf59e09cfd4d26ef6ef6c92d166effe6a40970c54821206d541932cb";

// WalletMigrated(address,uint256,uint256,bytes32) — GoldMigrationController.sol
export const WALLET_MIGRATED_TOPIC =
  "0x3cb2c9ea96d80d807ea50ecffe8ef07630e116e7cb411589e6d5cff8c7d0ff1b";

// StakeMigrated(address,address,uint256,uint256,bytes32) — GoldMigrationController.sol
export const STAKE_MIGRATED_TOPIC =
  "0x6f3f0b1b3726b8facd05ad7b112f6b2e2dfee290e51f995ff7b2bec103cb26a0";

export const GOLD_VALIDATOR_EVENT_TOPICS = [
  TOKEN_B1155_SLASHED_TOPIC,
  VALIDATOR_CREATED_TOPIC,
  VALIDATOR_JAILED_TOPIC,
  VALIDATOR_UNJAILED_TOPIC,
  VALIDATOR_SLASHED_TOPIC,
  STAKE_CREDIT_INITIALIZED_TOPIC,
  COMMISSION_RATE_EDITED_TOPIC,
  WALLET_MIGRATED_TOPIC,
  STAKE_MIGRATED_TOPIC,
] as const;

// ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string) — GiltGovernor.sol
export const PROPOSAL_CREATED_TOPIC =
  "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";

// VoteCast(address,uint256,uint8,uint256,string) — GiltGovernor.sol
export const VOTE_CAST_TOPIC =
  "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4";

// ProposalQueued(uint256,uint256) — GiltGovernor.sol
export const PROPOSAL_QUEUED_TOPIC =
  "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892";

// ProposalExecuted(uint256) — GiltGovernor.sol
export const PROPOSAL_EXECUTED_TOPIC =
  "0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f";

export const GOLD_GOVERNANCE_EVENT_TOPICS = [
  PROPOSAL_CREATED_TOPIC,
  VOTE_CAST_TOPIC,
  PROPOSAL_QUEUED_TOPIC,
  PROPOSAL_EXECUTED_TOPIC,
] as const;

// NewHeaderBlock(address,uint256,uint256,uint256,uint256,bytes32) — RootChainStorage.sol
export const NEW_HEADER_BLOCK_TOPIC =
  "0xba5de06d22af2685c6c7765f60067f7d2b08c2d29f53cdf14d67f6d1c9bfb527";

// CommitmentUpdated(uint256,uint256,uint256) — ValidatorSetCommitment.sol
export const COMMITMENT_UPDATED_TOPIC =
  "0xc54b7b972a001cce38614c224d129b4b04ee2b540e8fa858dae0eb93d8a13759";

// CommitmentPlanted(uint256,uint256,uint256) — ValidatorSetCommitment.sol
export const COMMITMENT_PLANTED_TOPIC =
  "0x817cdc5b6765e100a228428216d5747a3098dcfcebb3db51aa438dfe9c6c4423";

export const GOLD_CHECKPOINT_EVENT_TOPICS = [
  NEW_HEADER_BLOCK_TOPIC,
  COMMITMENT_UPDATED_TOPIC,
  COMMITMENT_PLANTED_TOPIC,
] as const;

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

export type StakeAsset = "gilt" | "gold_id_1" | "gold_id_2";
export type ChainStatus = "committed" | "diverged" | "halted";
export type GovernanceSupport = "for" | "against" | "abstain";

const GOVERNANCE_SUPPORT_CODES: Record<number, GovernanceSupport> = {
  1: "for",
  2: "against",
  3: "abstain",
};

export function topicMatches(
  topic: string | undefined,
  candidates: readonly string[],
): boolean {
  if (!topic) {
    return false;
  }
  const normalized = topic.toLowerCase();
  return candidates.some((candidate) => candidate.toLowerCase() === normalized);
}

export function routeAssetFromTokenId(tokenId: bigint | number): RouteAsset {
  const id = Number(tokenId);
  if (id === 1) {
    return "paxg";
  }
  if (id === 2) {
    return "xaut";
  }
  throw new Error(`Unknown gold token id for route asset: ${tokenId}`);
}

export function stakeAssetFromTokenId(tokenId: bigint | number): StakeAsset {
  const id = Number(tokenId);
  if (id === 1) {
    return "gold_id_1";
  }
  if (id === 2) {
    return "gold_id_2";
  }
  throw new Error(`Unknown token id for stake asset: ${tokenId}`);
}

export function correlationFromAddress(address: string): string {
  const normalized = address.toLowerCase().replace(/^0x/, "");
  return `0x${normalized.padStart(64, "0")}`;
}

export function goldTokenIdForRoute(routeAsset: RouteAsset): string {
  return routeAsset === "paxg" ? "1" : "2";
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
