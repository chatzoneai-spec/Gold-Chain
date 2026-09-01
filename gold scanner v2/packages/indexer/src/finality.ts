const CONFIRMATION_DEPTH_ENV = "GOLDSCAN_CONFIRMATION_DEPTH";

export type FinalityStatus = "pending" | "finalized" | "reverted";

export type FinalityStatusForBlockInput = {
  blockNumber: number;
  headNumber: number;
  reorged?: boolean;
};

export function getConfirmationDepth(): number {
  const raw = process.env[CONFIRMATION_DEPTH_ENV];

  if (raw === undefined || raw.trim() === "") {
    throw new Error(`${CONFIRMATION_DEPTH_ENV} is required`);
  }

  const depth = Number.parseInt(raw, 10);
  if (!Number.isInteger(depth) || depth < 0 || `${depth}` !== raw.trim()) {
    throw new Error(
      `${CONFIRMATION_DEPTH_ENV} must be a non-negative integer`,
    );
  }

  return depth;
}

export function finalityStatusForBlock({
  blockNumber,
  headNumber,
  reorged = false,
}: FinalityStatusForBlockInput): FinalityStatus {
  if (reorged) {
    return "reverted";
  }

  const confirmationDepth = getConfirmationDepth();

  if (headNumber - blockNumber < confirmationDepth) {
    return "pending";
  }

  return "finalized";
}
