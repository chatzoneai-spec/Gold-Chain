import { Interface } from "ethers";
import type { Pool } from "pg";

export type DecodedInput = {
  selector: string;
  signature: string | null;
  args: unknown[] | null;
};

function isEmptyInput(input: string | null | undefined): boolean {
  if (!input || input === "0x" || input === "0X") {
    return true;
  }
  return input.slice(2).replace(/0/g, "").length === 0;
}

export function stripMetadata(bytecode: string): string {
  const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  const markers = ["a264697066735822", "a265627a7a723058"];
  for (const marker of markers) {
    const idx = hex.lastIndexOf(marker);
    if (idx > 0 && idx > hex.length - 200) {
      return `0x${hex.slice(0, idx)}`;
    }
  }
  return bytecode.startsWith("0x") ? bytecode : `0x${hex}`;
}

export function decodeInputData(
  input: string | null | undefined,
  abiJson: string | null,
): DecodedInput {
  if (isEmptyInput(input)) {
    return { selector: "0x", signature: "nativeTransfer", args: [] };
  }

  const normalized = input!.startsWith("0x") ? input! : `0x${input}`;
  const selector = normalized.slice(0, 10).toLowerCase();

  if (!abiJson) {
    return { selector, signature: null, args: null };
  }

  try {
    const iface = new Interface(abiJson);
    const parsed = iface.parseTransaction({ data: normalized });
    if (!parsed) {
      return { selector, signature: null, args: null };
    }
    return {
      selector,
      signature: parsed.signature,
      args: [...parsed.args],
    };
  } catch {
    return { selector, signature: null, args: null };
  }
}

export async function fetchDecodedInput(
  pool: Pool,
  toAddress: string | null | undefined,
  input: string | null | undefined,
): Promise<DecodedInput> {
  if (isEmptyInput(input)) {
    return { selector: "0x", signature: "nativeTransfer", args: [] };
  }

  const normalized = input!.startsWith("0x") ? input! : `0x${input}`;
  const selector = normalized.slice(0, 10).toLowerCase();

  if (!toAddress) {
    return { selector, signature: null, args: null };
  }

  const { rows } = await pool.query<{ abi: string | null; is_verified: boolean }>(
    `SELECT abi, is_verified FROM contracts WHERE address = $1`,
    [toAddress.toLowerCase()],
  );

  if (rows.length === 0 || !rows[0]!.is_verified || !rows[0]!.abi) {
    return { selector, signature: null, args: null };
  }

  return decodeInputData(input, rows[0]!.abi);
}
