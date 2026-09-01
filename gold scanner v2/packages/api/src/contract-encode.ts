import { Interface } from "ethers";
import { requireHexAddress } from "./validate.js";
import type { JsonResponse } from "./gold/types.js";

export function handleContractEncode(body: unknown): JsonResponse {
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

  const signature =
    typeof record.signature === "string" ? record.signature.trim() : "";
  if (!signature) {
    return { status: 400, body: { error: "invalid_signature" } };
  }

  const args = Array.isArray(record.args) ? record.args : [];

  try {
    const iface = new Interface([`function ${signature}`]);
    const fragment = iface.getFunction(signature);
    if (!fragment) {
      return { status: 400, body: { error: "invalid_signature" } };
    }
    const data = iface.encodeFunctionData(fragment, args);
    return { status: 200, body: { to: address, data } };
  } catch {
    return { status: 400, body: { error: "encode_failed" } };
  }
}
