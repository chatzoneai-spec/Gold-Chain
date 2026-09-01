/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.createTable("token_transfers", {
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
    contract_address: {
      type: "text",
      notNull: true,
      references: "token_contracts(address)",
      onDelete: "CASCADE",
    },
    from_address: { type: "text", notNull: true },
    to_address: { type: "text", notNull: true },
    token_standard: { type: "token_standard", notNull: true },
    token_id: { type: "numeric" },
    amount: { type: "numeric", notNull: true },
    log_index: { type: "integer", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.addConstraint("token_transfers", "token_transfers_erc1155_token_id_required", {
    check:
      "token_standard <> 'erc1155'::token_standard OR token_id IS NOT NULL",
  });

  pgm.addConstraint("token_transfers", "token_transfers_erc721_token_id_required", {
    check:
      "token_standard <> 'erc721'::token_standard OR token_id IS NOT NULL",
  });

  pgm.addConstraint("token_transfers", "token_transfers_tx_log_token_unique", {
    unique: ["transaction_hash", "log_index", "token_id"],
  });

  pgm.createIndex("token_transfers", "contract_address");
  pgm.createIndex("token_transfers", ["contract_address", "token_id"]);

  pgm.createTable("token_balances", {
    address: {
      type: "text",
      notNull: true,
      references: "addresses(address)",
      onDelete: "CASCADE",
    },
    contract_address: {
      type: "text",
      notNull: true,
      references: "token_contracts(address)",
      onDelete: "CASCADE",
    },
    token_id: { type: "numeric", notNull: true },
    balance: { type: "numeric", notNull: true, default: 0 },
  });

  pgm.addConstraint("token_balances", "token_balances_pkey", {
    primaryKey: ["address", "contract_address", "token_id"],
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable("token_balances");
  pgm.dropTable("token_transfers");
};
