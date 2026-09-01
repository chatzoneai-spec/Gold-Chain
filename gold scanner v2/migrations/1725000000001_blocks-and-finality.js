/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.createType("finality_status", ["pending", "finalized", "reverted"]);

  pgm.createTable("blocks", {
    id: "id",
    number: { type: "bigint", notNull: true, unique: true },
    hash: { type: "text", notNull: true, unique: true },
    parent_hash: { type: "text", notNull: true },
    timestamp: { type: "timestamptz", notNull: true },
    validator_address: { type: "text", notNull: true },
    gas_used: { type: "bigint", notNull: true },
    gas_limit: { type: "bigint", notNull: true },
    finality_status: {
      type: "finality_status",
      notNull: true,
      default: "pending",
    },
  });

  pgm.createIndex("blocks", "number");
  pgm.createIndex("blocks", "hash");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable("blocks");
  pgm.dropType("finality_status");
};
