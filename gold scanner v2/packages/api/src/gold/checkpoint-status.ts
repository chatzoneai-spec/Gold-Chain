import type pg from "pg";

type Client = pg.PoolClient | pg.Pool;

export type CheckpointStatus = {
  lastCommitted: {
    blockNumber: number;
    checkpointHash: string;
    validatorSetHash: string;
  } | null;
  halted: boolean;
  diverged: boolean;
};

export async function computeCheckpointStatus(client: Client): Promise<CheckpointStatus> {
  const { rows: committed } = await client.query<{
    block_number: string;
    checkpoint_hash: string;
    validator_set_hash: string;
  }>(
    `SELECT block_number, checkpoint_hash, validator_set_hash
     FROM checkpoints
     WHERE finality_status = 'finalized'
       AND chain_status = 'committed'
     ORDER BY block_number DESC, id DESC
     LIMIT 1`,
  );

  const { rows: haltedRows } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM checkpoints
     WHERE finality_status = 'finalized'
       AND chain_status = 'halted'`,
  );

  const { rows: divergedRows } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM checkpoints
     WHERE finality_status = 'finalized'
       AND chain_status = 'diverged'`,
  );

  return {
    lastCommitted:
      committed.length === 0
        ? null
        : {
            blockNumber: Number(committed[0]!.block_number),
            checkpointHash: committed[0]!.checkpoint_hash,
            validatorSetHash: committed[0]!.validator_set_hash,
          },
    halted: Number(haltedRows[0]?.count ?? "0") > 0,
    diverged: Number(divergedRows[0]?.count ?? "0") > 0,
  };
}
