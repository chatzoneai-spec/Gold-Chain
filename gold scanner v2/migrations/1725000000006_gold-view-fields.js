/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.addColumns("staking_events", {
    stake_asset: {
      type: "text",
      notNull: true,
      default: "gilt",
    },
    validator_address: { type: "text" },
  });
  pgm.addConstraint("staking_events", "staking_events_stake_asset_check", {
    check: "stake_asset IN ('gilt', 'gold_id_1', 'gold_id_2')",
  });

  pgm.addColumns("validator_events", {
    commission_bps: { type: "integer", notNull: true, default: 0 },
    jailed: { type: "boolean", notNull: true, default: false },
    elected: { type: "boolean", notNull: true, default: false },
  });

  pgm.addColumns("governance_events", {
    voter_address: { type: "text" },
    support: { type: "text" },
    timelock_eta: { type: "timestamptz" },
  });
  pgm.addConstraint("governance_events", "governance_events_support_check", {
    check: "support IS NULL OR support IN ('for', 'against', 'abstain')",
  });

  pgm.addColumns("checkpoints", {
    chain_status: {
      type: "text",
      notNull: true,
      default: "committed",
    },
  });
  pgm.addConstraint("checkpoints", "checkpoints_chain_status_check", {
    check: "chain_status IN ('committed', 'diverged', 'halted')",
  });

  pgm.addColumns("contracts", {
    source_code: { type: "text" },
    abi: { type: "text" },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropConstraint("checkpoints", "checkpoints_chain_status_check");
  pgm.dropColumns("checkpoints", ["chain_status"]);

  pgm.dropConstraint("governance_events", "governance_events_support_check");
  pgm.dropColumns("governance_events", ["voter_address", "support", "timelock_eta"]);

  pgm.dropColumns("validator_events", ["commission_bps", "jailed", "elected"]);

  pgm.dropConstraint("staking_events", "staking_events_stake_asset_check");
  pgm.dropColumns("staking_events", ["stake_asset", "validator_address"]);

  pgm.dropColumns("contracts", ["source_code", "abi"]);
};
