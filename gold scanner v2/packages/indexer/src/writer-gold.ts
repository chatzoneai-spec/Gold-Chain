import type pg from "pg";
import type { FinalityStatus } from "./finality.js";
import { ensureAddress } from "./writer-evm.js";
import type {
  BridgeTransferRow,
  CheckpointRow,
  GovernanceEventRow,
  StakingEventRow,
  ValidatorEventRow,
} from "./writer-types.js";

type Client = pg.PoolClient;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function markGoldDerivedRowsReverted(
  client: Client,
  blockNumber: number,
): Promise<void> {
  await client.query(
    `UPDATE bridge_transfers SET finality_status = 'reverted'
     WHERE root_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $1)
        OR child_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $1)`,
    [blockNumber],
  );
  await client.query(
    `UPDATE staking_events SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE validator_events SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE governance_events SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
  await client.query(
    `UPDATE checkpoints SET finality_status = 'reverted' WHERE block_number = $1`,
    [blockNumber],
  );
}

export async function clearGoldDerivedRowsForBlock(
  client: Client,
  blockNumber: number,
): Promise<void> {
  await client.query(
    `DELETE FROM bridge_transfers
     WHERE root_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $1)
        OR child_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $1)`,
    [blockNumber],
  );
  await client.query(`DELETE FROM staking_events WHERE block_number = $1`, [
    blockNumber,
  ]);
  await client.query(`DELETE FROM validator_events WHERE block_number = $1`, [
    blockNumber,
  ]);
  await client.query(`DELETE FROM governance_events WHERE block_number = $1`, [
    blockNumber,
  ]);
  await client.query(`DELETE FROM checkpoints WHERE block_number = $1`, [
    blockNumber,
  ]);
}

export async function insertBridgeTransfer(
  client: Client,
  row: BridgeTransferRow,
): Promise<void> {
  await client.query(
    `DELETE FROM bridge_transfers
     WHERE receipt_correlation_id = $1 AND bridge_state = $2`,
    [row.receiptCorrelationId, row.bridgeState],
  );
  await client.query(
    `INSERT INTO bridge_transfers (
       route_asset, root_amount, child_amount, bridge_state, finality_status,
       root_tx_hash, child_tx_hash, direction, source_layer,
       receipt_correlation_id, amount_exact
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      row.routeAsset,
      row.rootAmount,
      row.childAmount,
      row.bridgeState,
      row.finalityStatus,
      row.rootTxHash,
      row.childTxHash,
      row.direction,
      row.sourceLayer,
      row.receiptCorrelationId,
      row.amountExact,
    ],
  );
}

export async function insertStakingEvent(
  client: Client,
  row: StakingEventRow,
): Promise<void> {
  await ensureAddress(client, row.stakerAddress);
  if (row.validatorAddress) {
    await ensureAddress(client, row.validatorAddress);
  }
  await client.query(
    `INSERT INTO staking_events (
       block_number, transaction_hash, event_type, staker_address, amount,
       stake_asset, validator_address, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.blockNumber,
      row.transactionHash,
      row.eventType,
      row.stakerAddress,
      row.amount,
      row.stakeAsset,
      row.validatorAddress,
      row.finalityStatus,
    ],
  );
}

export async function insertValidatorEvent(
  client: Client,
  row: ValidatorEventRow,
): Promise<void> {
  await ensureAddress(client, row.validatorAddress);
  await client.query(
    `INSERT INTO validator_events (
       block_number, transaction_hash, event_type, validator_address, amount,
       commission_bps, jailed, elected, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.blockNumber,
      row.transactionHash,
      row.eventType,
      row.validatorAddress,
      row.amount,
      row.commissionBps,
      row.jailed,
      row.elected,
      row.finalityStatus,
    ],
  );
}

export async function insertGovernanceEvent(
  client: Client,
  row: GovernanceEventRow,
): Promise<void> {
  if (row.proposerAddress) {
    await ensureAddress(client, row.proposerAddress);
  }
  if (row.voterAddress) {
    await ensureAddress(client, row.voterAddress);
  }
  await client.query(
    `INSERT INTO governance_events (
       block_number, transaction_hash, event_type, proposer_address, voter_address,
       proposal_id, support, timelock_eta, finality_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.blockNumber,
      row.transactionHash,
      row.eventType,
      row.proposerAddress,
      row.voterAddress,
      row.proposalId,
      row.support,
      row.timelockEta,
      row.finalityStatus,
    ],
  );
}

export async function insertCheckpoint(
  client: Client,
  row: CheckpointRow,
): Promise<void> {
  await client.query(
    `INSERT INTO checkpoints (
       block_number, checkpoint_hash, validator_set_hash, chain_status, finality_status
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      row.blockNumber,
      row.checkpointHash,
      row.validatorSetHash,
      row.chainStatus,
      row.finalityStatus,
    ],
  );
}

export async function refreshTokenBalancesForContract(
  client: Client,
  contractAddress: string,
): Promise<void> {
  await client.query(`DELETE FROM token_balances WHERE contract_address = $1`, [
    contractAddress,
  ]);
  await client.query(
    `WITH deltas AS (
       SELECT to_address AS address, contract_address, COALESCE(token_id, 0) AS token_id,
              amount::numeric AS delta
       FROM token_transfers
       WHERE contract_address = $1
         AND finality_status <> 'reverted'
         AND to_address <> $2
       UNION ALL
       SELECT from_address AS address, contract_address, COALESCE(token_id, 0) AS token_id,
              (-amount::numeric) AS delta
       FROM token_transfers
       WHERE contract_address = $1
         AND finality_status <> 'reverted'
         AND from_address <> $2
     )
     INSERT INTO token_balances (address, contract_address, token_id, balance)
     SELECT address, contract_address, token_id, SUM(delta)
     FROM deltas
     GROUP BY address, contract_address, token_id
     HAVING SUM(delta) <> 0`,
    [contractAddress, ZERO_ADDRESS],
  );
}

export async function refreshGoldSupply(client: Client): Promise<void> {
  await client.query(`DELETE FROM gold_supply`);
  await client.query(
    `INSERT INTO gold_supply (token_id, supply)
     SELECT token_id,
            SUM(
              CASE
                WHEN from_address = $1 THEN amount::numeric
                WHEN to_address = $1 THEN -amount::numeric
                ELSE 0
              END
            ) AS supply
     FROM token_transfers
     WHERE token_standard = 'erc1155'
       AND finality_status = 'finalized'
       AND (from_address = $1 OR to_address = $1)
     GROUP BY token_id
     HAVING SUM(
       CASE
         WHEN from_address = $1 THEN amount::numeric
         WHEN to_address = $1 THEN -amount::numeric
         ELSE 0
       END
     ) <> 0`,
    [ZERO_ADDRESS],
  );
}

export async function updateGoldFinalityForBlock(
  client: Client,
  blockNumber: number,
  status: FinalityStatus,
): Promise<void> {
  await client.query(
    `UPDATE bridge_transfers SET finality_status = $1
     WHERE (root_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $2)
        OR child_tx_hash IN (SELECT hash FROM transactions WHERE block_number = $2))
       AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE staking_events SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE validator_events SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE governance_events SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
  await client.query(
    `UPDATE checkpoints SET finality_status = $1
     WHERE block_number = $2 AND finality_status <> 'reverted'`,
    [status, blockNumber],
  );
}
