/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.createTable("transactions", {
    id: "id",
    hash: { type: "text", notNull: true, unique: true },
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    from_address: { type: "text", notNull: true },
    to_address: { type: "text" },
    value: { type: "numeric", notNull: true, default: 0 },
    gas: { type: "bigint", notNull: true },
    gas_price: { type: "numeric" },
    max_fee_per_gas: { type: "numeric" },
    max_priority_fee_per_gas: { type: "numeric" },
    input: { type: "text", notNull: true, default: "" },
    nonce: { type: "bigint", notNull: true },
    transaction_index: { type: "integer", notNull: true },
    status: { type: "smallint", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createIndex("transactions", "hash");
  pgm.createIndex("transactions", "block_number");
  pgm.createIndex("transactions", "from_address");
  pgm.createIndex("transactions", "to_address");

  pgm.createTable("receipts", {
    transaction_hash: {
      type: "text",
      primaryKey: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    cumulative_gas_used: { type: "bigint", notNull: true },
    gas_used: { type: "bigint", notNull: true },
    contract_address: { type: "text" },
    status: { type: "smallint", notNull: true },
    logs_bloom: { type: "text", notNull: true, default: "" },
  });

  pgm.createTable("logs", {
    id: "id",
    transaction_hash: {
      type: "text",
      notNull: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    address: { type: "text", notNull: true },
    topics: { type: "text[]", notNull: true },
    data: { type: "text", notNull: true, default: "" },
    log_index: { type: "integer", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createIndex("logs", "transaction_hash");
  pgm.createIndex("logs", "block_number");

  pgm.createTable("internal_txs", {
    id: "id",
    transaction_hash: {
      type: "text",
      notNull: true,
      references: "transactions(hash)",
      onDelete: "CASCADE",
    },
    block_number: {
      type: "bigint",
      notNull: true,
      references: "blocks(number)",
      onDelete: "CASCADE",
    },
    from_address: { type: "text", notNull: true },
    to_address: { type: "text" },
    value: { type: "numeric", notNull: true, default: 0 },
    type: { type: "text" },
    trace_address: { type: "text" },
    error: { type: "text" },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createIndex("internal_txs", "transaction_hash");
  pgm.createIndex("internal_txs", "block_number");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable("internal_txs");
  pgm.dropTable("logs");
  pgm.dropTable("receipts");
  pgm.dropTable("transactions");
};
