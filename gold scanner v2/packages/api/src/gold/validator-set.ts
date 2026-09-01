import type pg from "pg";

type Client = pg.PoolClient | pg.Pool;

export type ValidatorSetRow = {
  validatorAddress: string;
  votingPower: string;
  giltStake: string;
  goldId1Stake: string;
  goldId2Stake: string;
  commissionBps: number;
  jailed: boolean;
  elected: boolean;
};

export async function computeValidatorSet(client: Client): Promise<ValidatorSetRow[]> {
  const { rows: validators } = await client.query<{ validator_address: string }>(
    `SELECT DISTINCT validator_address
     FROM validator_events
     WHERE finality_status = 'finalized'
     ORDER BY validator_address`,
  );

  const { rows: stakeRows } = await client.query<{
    validator_address: string;
    stake_asset: string;
    net_amount: string;
  }>(
    `SELECT validator_address,
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
       AND validator_address IS NOT NULL
       AND event_type IN ('stake', 'unstake')
     GROUP BY validator_address, stake_asset`,
  );

  const stakeByValidator = new Map<string, Record<string, string>>();
  for (const row of stakeRows) {
    const key = row.validator_address;
    const existing = stakeByValidator.get(key) ?? {};
    existing[row.stake_asset] = row.net_amount;
    stakeByValidator.set(key, existing);
  }

  const result: ValidatorSetRow[] = [];

  for (const validator of validators) {
    const address = validator.validator_address;
    const { rows: latest } = await client.query<{
      commission_bps: number;
      jailed: boolean;
      elected: boolean;
    }>(
      `SELECT commission_bps, jailed, elected
       FROM validator_events
       WHERE validator_address = $1
         AND finality_status = 'finalized'
       ORDER BY block_number DESC, id DESC
       LIMIT 1`,
      [address],
    );

    const stakes = stakeByValidator.get(address) ?? {};
    const giltStake = stakes.gilt ?? "0";
    const goldId1Stake = stakes.gold_id_1 ?? "0";
    const goldId2Stake = stakes.gold_id_2 ?? "0";
    const votingPower = (
      BigInt(giltStake) + BigInt(goldId1Stake) + BigInt(goldId2Stake)
    ).toString();

    result.push({
      validatorAddress: address,
      votingPower,
      giltStake,
      goldId1Stake,
      goldId2Stake,
      commissionBps: latest[0]?.commission_bps ?? 0,
      jailed: latest[0]?.jailed ?? false,
      elected: latest[0]?.elected ?? false,
    });
  }

  return result;
}
