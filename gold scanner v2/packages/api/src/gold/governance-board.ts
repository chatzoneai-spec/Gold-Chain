import type pg from "pg";

type Client = pg.PoolClient | pg.Pool;

export type GovernanceVote = {
  voterAddress: string;
  support: string;
};

export type GovernanceProposal = {
  proposalId: string;
  proposerAddress: string | null;
  votes: GovernanceVote[];
};

export type TimelockQueueItem = {
  proposalId: string;
  timelockEta: string;
};

export type GovernanceBoard = {
  proposals: GovernanceProposal[];
  timelockQueue: TimelockQueueItem[];
};

export async function computeGovernanceBoard(client: Client): Promise<GovernanceBoard> {
  const { rows: createdRows } = await client.query<{
    proposal_id: string;
    proposer_address: string | null;
  }>(
    `SELECT proposal_id, proposer_address
     FROM governance_events
     WHERE finality_status = 'finalized'
       AND event_type = 'proposal_created'
     ORDER BY block_number ASC, id ASC`,
  );

  const proposals: GovernanceProposal[] = [];

  for (const created of createdRows) {
    const { rows: voteRows } = await client.query<{
      voter_address: string;
      support: string;
    }>(
      `SELECT voter_address, support
       FROM governance_events
       WHERE finality_status = 'finalized'
         AND event_type = 'vote'
         AND proposal_id = $1
       ORDER BY block_number ASC, id ASC`,
      [created.proposal_id],
    );

    proposals.push({
      proposalId: created.proposal_id,
      proposerAddress: created.proposer_address,
      votes: voteRows.map((vote) => ({
        voterAddress: vote.voter_address,
        support: vote.support,
      })),
    });
  }

  const { rows: queuedRows } = await client.query<{
    proposal_id: string;
    timelock_eta: Date;
  }>(
    `SELECT q.proposal_id, q.timelock_eta
     FROM governance_events q
     WHERE q.finality_status = 'finalized'
       AND q.event_type = 'queued'
       AND NOT EXISTS (
         SELECT 1
         FROM governance_events e
         WHERE e.finality_status = 'finalized'
           AND e.event_type = 'executed'
           AND e.proposal_id = q.proposal_id
       )
     ORDER BY q.block_number ASC, q.id ASC`,
  );

  const timelockQueue: TimelockQueueItem[] = queuedRows.map((row) => ({
    proposalId: row.proposal_id,
    timelockEta: String(Math.floor(row.timelock_eta.getTime() / 1000)),
  }));

  return { proposals, timelockQueue };
}
