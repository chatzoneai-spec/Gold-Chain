/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.createType("token_standard", ["erc20", "erc721", "erc1155"]);

  pgm.createTable("addresses", {
    address: { type: "text", primaryKey: true },
    gilt_balance: { type: "numeric", notNull: true, default: 0 },
  });

  pgm.createTable("contracts", {
    address: {
      type: "text",
      primaryKey: true,
      references: "addresses(address)",
      onDelete: "CASCADE",
    },
    bytecode: { type: "text" },
    is_verified: { type: "boolean", notNull: true, default: false },
    compiler_version: { type: "text" },
    optimization_enabled: { type: "boolean" },
    optimization_runs: { type: "integer" },
    evm_version: { type: "text" },
    constructor_arguments: { type: "text" },
  });

  pgm.createTable("token_contracts", {
    address: {
      type: "text",
      primaryKey: true,
      references: "contracts(address)",
      onDelete: "CASCADE",
    },
    type: { type: "token_standard", notNull: true },
    name: { type: "text" },
    symbol: { type: "text" },
    decimals: { type: "smallint" },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable("token_contracts");
  pgm.dropTable("contracts");
  pgm.dropTable("addresses");
  pgm.dropType("token_standard");
};
