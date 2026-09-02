/**
 * Computes keccak256 event topic hashes for gold-topics.ts constants.
 * Run: npx tsx scripts/compute-gold-topics.ts
 */
import { id } from "ethers";

const SIGNATURES = {
  GOLD_REDEMPTION_REQUESTED:
    "GoldRedemptionRequested(address,address,uint256,uint256,uint256)",
  LOCKED_SCALED_ERC1155:
    "LockedScaledERC1155(address,address,address,uint256,uint256,uint256)",
  EXITED_SCALED_ERC1155:
    "ExitedScaledERC1155(address,address,uint256,uint256,uint256)",
  MIGRATION_MINT: "MigrationMint(address,uint256,uint256,bytes32)",
  TOKEN_B1155_DELEGATED: "TokenB1155Delegated(address,address,uint256,uint256)",
  TOKEN_B1155_UNDELEGATED:
    "TokenB1155Undelegated(address,address,uint256,uint256)",
  DELEGATED: "Delegated(address,address,uint256,uint256)",
  UNDELEGATED: "Undelegated(address,address,uint256,uint256)",
  TOKEN_B1155_SLASHED: "TokenB1155Slashed(address,uint256,uint256,uint8)",
  VALIDATOR_CREATED: "ValidatorCreated(address,address,address,bytes)",
  VALIDATOR_JAILED: "ValidatorJailed(address)",
  VALIDATOR_UNJAILED: "ValidatorUnjailed(address)",
  VALIDATOR_SLASHED: "ValidatorSlashed(address,uint256,uint256,uint8)",
  STAKE_CREDIT_INITIALIZED: "StakeCreditInitialized(address,address)",
  COMMISSION_RATE_EDITED: "CommissionRateEdited(address,uint64)",
  WALLET_MIGRATED: "WalletMigrated(address,uint256,uint256,bytes32)",
  STAKE_MIGRATED: "StakeMigrated(address,address,uint256,uint256,bytes32)",
  PROPOSAL_CREATED:
    "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)",
  VOTE_CAST: "VoteCast(address,uint256,uint8,uint256,string)",
  PROPOSAL_QUEUED: "ProposalQueued(uint256,uint256)",
  PROPOSAL_EXECUTED: "ProposalExecuted(uint256)",
  NEW_HEADER_BLOCK:
    "NewHeaderBlock(address,uint256,uint256,uint256,uint256,bytes32)",
  COMMITMENT_UPDATED: "CommitmentUpdated(uint256,uint256,uint256)",
  COMMITMENT_PLANTED: "CommitmentPlanted(uint256,uint256,uint256)",
} as const;

for (const [name, signature] of Object.entries(SIGNATURES)) {
  console.log(`${name}: ${id(signature)} // ${signature}`);
}
