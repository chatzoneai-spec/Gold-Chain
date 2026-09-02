import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { id } from "ethers";
import {
  COMMITMENT_PLANTED_TOPIC,
  COMMITMENT_UPDATED_TOPIC,
  DELEGATED_TOPIC,
  EXITED_SCALED_ERC1155_TOPIC,
  GOLD_BRIDGE_EVENT_TOPICS,
  GOLD_CHECKPOINT_EVENT_TOPICS,
  GOLD_GOVERNANCE_EVENT_TOPICS,
  GOLD_REDEMPTION_REQUESTED_TOPIC,
  GOLD_STAKING_EVENT_TOPICS,
  GOLD_VALIDATOR_EVENT_TOPICS,
  LOCKED_SCALED_ERC1155_TOPIC,
  MIGRATION_MINT_TOPIC,
  NEW_HEADER_BLOCK_TOPIC,
  PROPOSAL_CREATED_TOPIC,
  PROPOSAL_EXECUTED_TOPIC,
  PROPOSAL_QUEUED_TOPIC,
  STAKE_CREDIT_INITIALIZED_TOPIC,
  STAKE_MIGRATED_TOPIC,
  TOKEN_B1155_DELEGATED_TOPIC,
  TOKEN_B1155_SLASHED_TOPIC,
  TOKEN_B1155_UNDELEGATED_TOPIC,
  UNDELEGATED_TOPIC,
  VALIDATOR_CREATED_TOPIC,
  VALIDATOR_JAILED_TOPIC,
  VALIDATOR_SLASHED_TOPIC,
  VOTE_CAST_TOPIC,
  WALLET_MIGRATED_TOPIC,
} from "./gold-topics.js";

const TOPIC_CASES: Array<{ constant: string; signature: string }> = [
  {
    constant: GOLD_REDEMPTION_REQUESTED_TOPIC,
    signature: "GoldRedemptionRequested(address,address,uint256,uint256,uint256)",
  },
  {
    constant: LOCKED_SCALED_ERC1155_TOPIC,
    signature:
      "LockedScaledERC1155(address,address,address,uint256,uint256,uint256)",
  },
  {
    constant: EXITED_SCALED_ERC1155_TOPIC,
    signature: "ExitedScaledERC1155(address,address,uint256,uint256,uint256)",
  },
  {
    constant: MIGRATION_MINT_TOPIC,
    signature: "MigrationMint(address,uint256,uint256,bytes32)",
  },
  {
    constant: TOKEN_B1155_DELEGATED_TOPIC,
    signature: "TokenB1155Delegated(address,address,uint256,uint256)",
  },
  {
    constant: TOKEN_B1155_UNDELEGATED_TOPIC,
    signature: "TokenB1155Undelegated(address,address,uint256,uint256)",
  },
  {
    constant: DELEGATED_TOPIC,
    signature: "Delegated(address,address,uint256,uint256)",
  },
  {
    constant: UNDELEGATED_TOPIC,
    signature: "Undelegated(address,address,uint256,uint256)",
  },
  {
    constant: TOKEN_B1155_SLASHED_TOPIC,
    signature: "TokenB1155Slashed(address,uint256,uint256,uint8)",
  },
  {
    constant: VALIDATOR_CREATED_TOPIC,
    signature: "ValidatorCreated(address,address,address,bytes)",
  },
  {
    constant: VALIDATOR_JAILED_TOPIC,
    signature: "ValidatorJailed(address)",
  },
  {
    constant: VALIDATOR_SLASHED_TOPIC,
    signature: "ValidatorSlashed(address,uint256,uint256,uint8)",
  },
  {
    constant: STAKE_CREDIT_INITIALIZED_TOPIC,
    signature: "StakeCreditInitialized(address,address)",
  },
  {
    constant: WALLET_MIGRATED_TOPIC,
    signature: "WalletMigrated(address,uint256,uint256,bytes32)",
  },
  {
    constant: STAKE_MIGRATED_TOPIC,
    signature: "StakeMigrated(address,address,uint256,uint256,bytes32)",
  },
  {
    constant: PROPOSAL_CREATED_TOPIC,
    signature:
      "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)",
  },
  {
    constant: VOTE_CAST_TOPIC,
    signature: "VoteCast(address,uint256,uint8,uint256,string)",
  },
  {
    constant: PROPOSAL_QUEUED_TOPIC,
    signature: "ProposalQueued(uint256,uint256)",
  },
  {
    constant: PROPOSAL_EXECUTED_TOPIC,
    signature: "ProposalExecuted(uint256)",
  },
  {
    constant: NEW_HEADER_BLOCK_TOPIC,
    signature:
      "NewHeaderBlock(address,uint256,uint256,uint256,uint256,bytes32)",
  },
  {
    constant: COMMITMENT_UPDATED_TOPIC,
    signature: "CommitmentUpdated(uint256,uint256,uint256)",
  },
  {
    constant: COMMITMENT_PLANTED_TOPIC,
    signature: "CommitmentPlanted(uint256,uint256,uint256)",
  },
];

describe("gold-topics", () => {
  for (const { constant, signature } of TOPIC_CASES) {
    it(`topic matches keccak256 of ${signature}`, () => {
      assert.equal(constant.toLowerCase(), id(signature).toLowerCase());
    });
  }

  it("exports grouped topic arrays without placeholder fixtures", () => {
    for (const topic of [
      ...GOLD_BRIDGE_EVENT_TOPICS,
      ...GOLD_STAKING_EVENT_TOPICS,
      ...GOLD_VALIDATOR_EVENT_TOPICS,
      ...GOLD_GOVERNANCE_EVENT_TOPICS,
      ...GOLD_CHECKPOINT_EVENT_TOPICS,
    ]) {
      assert.ok(!topic.startsWith("0xa00000000000000000000000000000000000000000000000000000000000000"));
    }
  });
});
