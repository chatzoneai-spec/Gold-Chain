import { requireHexAddress } from "./validate.js";
import { ethCall } from "./evm/rpc.js";
import type { JsonResponse } from "./gold/types.js";

export async function handleContractCall(body: unknown): Promise<JsonResponse> {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const record = body as Record<string, unknown>;
  let address: string;
  try {
    address = requireHexAddress(
      typeof record.address === "string" ? record.address : null,
      "address",
    );
  } catch {
    return { status: 400, body: { error: "invalid_address" } };
  }

  const data = typeof record.data === "string" ? record.data.trim() : "";
  if (!data.startsWith("0x")) {
    return { status: 400, body: { error: "invalid_data" } };
  }

  if (!process.env.GOLDSCAN_RPC_URL) {
    return { status: 503, body: { error: "rpc_unavailable" } };
  }

  try {
    const result = await ethCall(address, data);
    return { status: 200, body: { result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "rpc_error";
    if (message === "rpc_unavailable") {
      return { status: 503, body: { error: "rpc_unavailable" } };
    }
    return { status: 502, body: { error: message } };
  }
}

export async function handleContractCallWithRpc(
  body: unknown,
  caller: (method: string, params: unknown[]) => Promise<string>,
): Promise<JsonResponse> {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const record = body as Record<string, unknown>;
  let address: string;
  try {
    address = requireHexAddress(
      typeof record.address === "string" ? record.address : null,
      "address",
    );
  } catch {
    return { status: 400, body: { error: "invalid_address" } };
  }

  const data = typeof record.data === "string" ? record.data.trim() : "";
  if (!data.startsWith("0x")) {
    return { status: 400, body: { error: "invalid_data" } };
  }

  const result = await ethCall(address, data, caller);
  return { status: 200, body: { result } };
}
