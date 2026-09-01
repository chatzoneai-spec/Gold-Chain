import type pg from "pg";
import type {
  BridgeState,
  BridgeTransferRow,
  FinalityStatus,
  MigrationStatus,
  Paginated,
  RedemptionReceipt,
  RedemptionReceiptStage,
  RouteAsset,
} from "./types.js";

type Client = pg.PoolClient | pg.Pool;

const RECEIPT_STAGE_ORDER: BridgeState[] = [
  "locked",
  "synced",
  "minted_or_credited",
  "burned_or_debited",
  "released",
];

const MIGRATION_EVENT_TYPES: Record<string, MigrationStatus> = {
  migration_inactive: "INACTIVE",
  migration_prepare: "PREPARE",
  migration_active: "ACTIVE",
  migration_exit_only: "EXIT_ONLY",
  migration_finalized: "FINALIZED",
};

export function parsePagination(
  searchParams: URLSearchParams,
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10)),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function mapBridgeRow(row: Record<string, unknown>): BridgeTransferRow {
  const finalityStatus = row.finality_status as FinalityStatus;
  return {
    id: Number(row.id),
    routeAsset: row.route_asset as RouteAsset,
    rootAmount: String(row.root_amount),
    childAmount: String(row.child_amount),
    bridgeState: row.bridge_state as BridgeState,
    finalityStatus,
    rootTxHash: (row.root_tx_hash as string | null) ?? null,
    childTxHash: (row.child_tx_hash as string | null) ?? null,
    direction: row.direction as "deposit" | "exit",
    sourceLayer: row.source_layer as "ethereum" | "gold_chain",
    receiptCorrelationId:
      (row.receipt_correlation_id as string | null) ?? null,
    amountExact: Boolean(row.amount_exact),
    complete: finalityStatus === "finalized",
  };
}

function mapReceiptStage(row: Record<string, unknown>): RedemptionReceiptStage {
  const finalityStatus = row.finality_status as FinalityStatus;
  return {
    bridgeState: row.bridge_state as BridgeState,
    routeAsset: row.route_asset as RouteAsset,
    rootAmount: String(row.root_amount),
    childAmount: String(row.child_amount),
    finalityStatus,
    rootTxHash: (row.root_tx_hash as string | null) ?? null,
    childTxHash: (row.child_tx_hash as string | null) ?? null,
    sourceLayer: row.source_layer as "ethereum" | "gold_chain",
    amountExact: Boolean(row.amount_exact),
    complete: finalityStatus === "finalized",
  };
}

function stageRank(state: BridgeState): number {
  const index = RECEIPT_STAGE_ORDER.indexOf(state);
  return index === -1 ? RECEIPT_STAGE_ORDER.length : index;
}

export async function fetchBridgeActivity(
  client: Client,
): Promise<{ finalized: BridgeTransferRow[]; pending: BridgeTransferRow[] }> {
  const { rows } = await client.query(
    `SELECT *
     FROM bridge_transfers
     ORDER BY id ASC`,
  );

  const finalized: BridgeTransferRow[] = [];
  const pending: BridgeTransferRow[] = [];

  for (const row of rows) {
    const mapped = mapBridgeRow(row);
    if (mapped.finalityStatus === "finalized") {
      finalized.push(mapped);
    } else if (mapped.finalityStatus === "pending") {
      pending.push(mapped);
    }
  }

  return { finalized, pending };
}

export async function fetchRedemptionReceipts(
  client: Client,
  searchParams: URLSearchParams,
): Promise<Paginated<RedemptionReceipt>> {
  const { page, limit, offset } = parsePagination(searchParams);
  const correlationId = searchParams.get("receiptCorrelationId");

  const where: string[] = [
    "receipt_correlation_id IS NOT NULL",
    "bridge_state IN ('burned_or_debited', 'released')",
  ];
  const params: unknown[] = [];

  if (correlationId) {
    params.push(correlationId);
    where.push(`receipt_correlation_id = $${params.length}`);
  }

  const whereSql = where.join(" AND ");

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(DISTINCT receipt_correlation_id)::text AS count
     FROM bridge_transfers
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const idsResult = await client.query<{ receipt_correlation_id: string }>(
    `SELECT DISTINCT receipt_correlation_id
     FROM bridge_transfers
     WHERE ${whereSql}
     ORDER BY receipt_correlation_id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const items: RedemptionReceipt[] = [];

  for (const idRow of idsResult.rows) {
    const corrId = idRow.receipt_correlation_id;
    const { rows } = await client.query(
      `SELECT *
       FROM bridge_transfers
       WHERE receipt_correlation_id = $1
       ORDER BY id ASC`,
      [corrId],
    );

    const stages = rows
      .map(mapReceiptStage)
      .sort((a, b) => stageRank(a.bridgeState) - stageRank(b.bridgeState));

    const routeAsset =
      (stages.find((stage) => stage.routeAsset)?.routeAsset as
        | RouteAsset
        | undefined) ?? "paxg";

    const hasBurn = stages.some(
      (stage) => stage.bridgeState === "burned_or_debited",
    );
    const hasRelease = stages.some((stage) => stage.bridgeState === "released");
    const allFinalized = stages.every((stage) => stage.complete);

    items.push({
      receiptCorrelationId: corrId,
      routeAsset,
      stages,
      complete: hasBurn && hasRelease && allFinalized,
    });
  }

  return { items, page, limit, total };
}

export async function fetchRedemptionReceiptById(
  client: Client,
  correlationId: string,
): Promise<RedemptionReceipt | null> {
  const page = await fetchRedemptionReceipts(
    client,
    new URLSearchParams({
      receiptCorrelationId: correlationId,
      page: "1",
      limit: "1",
    }),
  );
  return page.items[0] ?? null;
}

export async function fetchStakingEvents(
  client: Client,
  searchParams: URLSearchParams,
): Promise<
  Paginated<{
    id: number;
    blockNumber: number;
    transactionHash: string;
    eventType: string;
    stakerAddress: string;
    amount: string;
    finalityStatus: FinalityStatus;
    complete: boolean;
  }>
> {
  const { page, limit, offset } = parsePagination(searchParams);
  const finalizedOnly = searchParams.get("finalizedOnly") !== "false";
  const where = finalizedOnly ? "WHERE finality_status = 'finalized'" : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM staking_events ${where}`,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const { rows } = await client.query(
    `SELECT * FROM staking_events ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    items: rows.map((row) => {
      const finalityStatus = row.finality_status as FinalityStatus;
      return {
        id: Number(row.id),
        blockNumber: Number(row.block_number),
        transactionHash: String(row.transaction_hash),
        eventType: String(row.event_type),
        stakerAddress: String(row.staker_address),
        amount: String(row.amount),
        finalityStatus,
        complete: finalityStatus === "finalized",
      };
    }),
    page,
    limit,
    total,
  };
}

export async function fetchValidatorEvents(
  client: Client,
  searchParams: URLSearchParams,
): Promise<
  Paginated<{
    id: number;
    blockNumber: number;
    transactionHash: string;
    eventType: string;
    validatorAddress: string;
    amount: string | null;
    finalityStatus: FinalityStatus;
    complete: boolean;
  }>
> {
  const { page, limit, offset } = parsePagination(searchParams);
  const finalizedOnly = searchParams.get("finalizedOnly") !== "false";
  const where = finalizedOnly ? "WHERE finality_status = 'finalized'" : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM validator_events ${where}`,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const { rows } = await client.query(
    `SELECT * FROM validator_events ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    items: rows.map((row) => {
      const finalityStatus = row.finality_status as FinalityStatus;
      return {
        id: Number(row.id),
        blockNumber: Number(row.block_number),
        transactionHash: String(row.transaction_hash),
        eventType: String(row.event_type),
        validatorAddress: String(row.validator_address),
        amount: row.amount === null ? null : String(row.amount),
        finalityStatus,
        complete: finalityStatus === "finalized",
      };
    }),
    page,
    limit,
    total,
  };
}

export async function fetchDelegationEvents(
  client: Client,
  searchParams: URLSearchParams,
): Promise<
  Paginated<{
    id: number;
    blockNumber: number;
    transactionHash: string;
    delegatorAddress: string;
    validatorAddress: string | null;
    amount: string;
    finalityStatus: FinalityStatus;
    complete: boolean;
  }>
> {
  const { page, limit, offset } = parsePagination(searchParams);
  const finalizedOnly = searchParams.get("finalizedOnly") !== "false";
  const filters = ["s.event_type = 'stake'"];
  if (finalizedOnly) {
    filters.push("s.finality_status = 'finalized'");
  }
  const where = `WHERE ${filters.join(" AND ")}`;

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM staking_events s
     ${where}`,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const { rows } = await client.query(
    `SELECT s.*, v.validator_address
     FROM staking_events s
     LEFT JOIN LATERAL (
       SELECT validator_address
       FROM validator_events
       WHERE block_number <= s.block_number
         AND finality_status = 'finalized'
       ORDER BY block_number DESC, id DESC
       LIMIT 1
     ) v ON true
     ${where}
     ORDER BY s.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    items: rows.map((row) => {
      const finalityStatus = row.finality_status as FinalityStatus;
      return {
        id: Number(row.id),
        blockNumber: Number(row.block_number),
        transactionHash: String(row.transaction_hash),
        delegatorAddress: String(row.staker_address),
        validatorAddress: row.validator_address
          ? String(row.validator_address)
          : null,
        amount: String(row.amount),
        finalityStatus,
        complete: finalityStatus === "finalized",
      };
    }),
    page,
    limit,
    total,
  };
}

export async function fetchCheckpoints(
  client: Client,
  searchParams: URLSearchParams,
): Promise<
  Paginated<{
    id: number;
    blockNumber: number;
    checkpointHash: string;
    validatorSetHash: string;
    finalityStatus: FinalityStatus;
    complete: boolean;
  }>
> {
  const { page, limit, offset } = parsePagination(searchParams);
  const finalizedOnly = searchParams.get("finalizedOnly") !== "false";
  const where = finalizedOnly ? "WHERE finality_status = 'finalized'" : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM checkpoints ${where}`,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const { rows } = await client.query(
    `SELECT * FROM checkpoints ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    items: rows.map((row) => {
      const finalityStatus = row.finality_status as FinalityStatus;
      return {
        id: Number(row.id),
        blockNumber: Number(row.block_number),
        checkpointHash: String(row.checkpoint_hash),
        validatorSetHash: String(row.validator_set_hash),
        finalityStatus,
        complete: finalityStatus === "finalized",
      };
    }),
    page,
    limit,
    total,
  };
}

export async function fetchGovernanceEvents(
  client: Client,
  searchParams: URLSearchParams,
): Promise<
  Paginated<{
    id: number;
    blockNumber: number;
    transactionHash: string;
    eventType: string;
    proposerAddress: string | null;
    proposalId: string | null;
    finalityStatus: FinalityStatus;
    complete: boolean;
  }>
> {
  const { page, limit, offset } = parsePagination(searchParams);
  const finalizedOnly = searchParams.get("finalizedOnly") !== "false";
  const where = finalizedOnly ? "WHERE finality_status = 'finalized'" : "";

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM governance_events ${where}`,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  const { rows } = await client.query(
    `SELECT * FROM governance_events ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    items: rows.map((row) => {
      const finalityStatus = row.finality_status as FinalityStatus;
      return {
        id: Number(row.id),
        blockNumber: Number(row.block_number),
        transactionHash: String(row.transaction_hash),
        eventType: String(row.event_type),
        proposerAddress: row.proposer_address
          ? String(row.proposer_address)
          : null,
        proposalId: row.proposal_id ? String(row.proposal_id) : null,
        finalityStatus,
        complete: finalityStatus === "finalized",
      };
    }),
    page,
    limit,
    total,
  };
}

export async function fetchMigrationStatus(
  client: Client,
): Promise<{ status: MigrationStatus }> {
  const { rows } = await client.query<{ event_type: string }>(
    `SELECT event_type
     FROM governance_events
     WHERE finality_status = 'finalized'
       AND event_type = ANY($1::text[])
     ORDER BY block_number DESC, id DESC
     LIMIT 1`,
    [Object.keys(MIGRATION_EVENT_TYPES)],
  );

  if (rows.length === 0) {
    return { status: "INACTIVE" };
  }

  const mapped = MIGRATION_EVENT_TYPES[rows[0]!.event_type];
  return { status: mapped ?? "INACTIVE" };
}
