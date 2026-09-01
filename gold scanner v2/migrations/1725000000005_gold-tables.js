/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.createType("route_asset", ["paxg", "xaut"]);
  pgm.createType("goldchain_bridge_state", [
    "locked",
    "synced",
    "minted_or_credited",
    "burned_or_debited",
    "released",
  ]);
  pgm.createType("bridge_direction", ["deposit", "exit"]);
  pgm.createType("source_layer", ["ethereum", "gold_chain"]);

  pgm.createTable("bridge_transfers", {
    id: "id",
    route_asset: { type: "route_asset", notNull: true },
    root_amount: { type: "numeric", notNull: true },
    child_amount: { type: "numeric", notNull: true },
    bridge_state: { type: "goldchain_bridge_state", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
    root_tx_hash: { type: "text" },
    child_tx_hash: { type: "text" },
    direction: { type: "bridge_direction", notNull: true },
    source_layer: { type: "source_layer", notNull: true },
    receipt_correlation_id: { type: "text" },
    amount_exact: { type: "boolean", notNull: true },
  });

  pgm.createIndex("bridge_transfers", "route_asset");
  pgm.createIndex("bridge_transfers", "bridge_state");
  pgm.createIndex("bridge_transfers", "receipt_correlation_id");

  pgm.createTable("staking_events", {
    id: "id",
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    transaction_hash: {
      type: "text",
      notNull: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    event_type: { type: "text", notNull: true },
    staker_address: { type: "text", notNull: true },
    amount: { type: "numeric", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createTable("validator_events", {
    id: "id",
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    transaction_hash: {
      type: "text",
      notNull: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    event_type: { type: "text", notNull: true },
    validator_address: { type: "text", notNull: true },
    amount: { type: "numeric" },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createTable("governance_events", {
    id: "id",
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    transaction_hash: {
      type: "text",
      notNull: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    event_type: { type: "text", notNull: true },
    proposer_address: { type: "text" },
    proposal_id: { type: "text" },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createTable("checkpoints", {
    id: "id",
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    checkpoint_hash: { type: "text", notNull: true },
    validator_set_hash: { type: "text", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createIndex("checkpoints", "block_number");

  pgm.createTable("gold_supply", {
    token_id: { type: "numeric", primaryKey: true },
    supply: { type: "numeric", notNull: true },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable("gold_supply");
  pgm.dropTable("checkpoints");
  pgm.dropTable("governance_events");
  pgm.dropTable("validator_events");
  pgm.dropTable("staking_events");
  pgm.dropTable("bridge_transfers");
  pgm.dropType("source_layer");
  pgm.dropType("bridge_direction");
  pgm.dropType("goldchain_bridge_state");
  pgm.dropType("route_asset");
};
