import type pg from "pg";

type Client = pg.PoolClient | pg.Pool;

export type DelegationRow = {
  delegator: string;
  validator: string;
  stakeAsset: string;
  amount: string;
};

export type UnbondingRow = {
  delegator: string;
  validator: string | null;
  stakeAsset: string;
  amount: string;
};

export type DelegationsResult = {
  delegations: DelegationRow[];
  unbonding: UnbondingRow[];
};

export async function computeDelegations(client: Client): Promise<DelegationsResult> {
  const { rows: delegationRows } = await client.query<{
    staker_address: string;
    validator_address: string | null;
    stake_asset: string;
    net_amount: string;
  }>(
    `SELECT staker_address,
            validator_address,
            stake_asset,
            COALESCE(SUM(
              CASE
                WHEN event_type = 'stake' THEN amount::numeric
                WHEN event_type = 'unstake' THEN -amount::numeric
                ELSE 0
              END
            ), 0)::text AS net_amount
     FROM staking_events
     WHERE finality_status = 'finalized'
       AND event_type IN ('stake', 'unstake')
     GROUP BY staker_address, validator_address, stake_asset
     HAVING COALESCE(SUM(
       CASE
         WHEN event_type = 'stake' THEN amount::numeric
         WHEN event_type = 'unstake' THEN -amount::numeric
         ELSE 0
       END
     ), 0) <> 0`,
  );

  const delegations: DelegationRow[] = delegationRows
    .filter((row) => row.validator_address !== null)
    .map((row) => ({
      delegator: row.staker_address,
      validator: row.validator_address!,
      stakeAsset: row.stake_asset,
      amount: row.net_amount,
    }));

  const { rows: unbondRows } = await client.query<{
    staker_address: string;
    validator_address: string | null;
    stake_asset: string;
    amount: string;
  }>(
    `SELECT staker_address, validator_address, stake_asset, amount::text AS amount
     FROM staking_events
     WHERE finality_status = 'finalized'
       AND event_type = 'unbond'`,
  );

  const unbonding: UnbondingRow[] = unbondRows.map((row) => ({
    delegator: row.staker_address,
    validator: row.validator_address,
    stakeAsset: row.stake_asset,
    amount: row.amount,
  }));

  return { delegations, unbonding };
}
