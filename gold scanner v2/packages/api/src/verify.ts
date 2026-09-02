import solc from "solc";
import type { Pool } from "pg";
import { requireHexAddress, ValidationError } from "./validate.js";
import { stripMetadata } from "./evm/decode-input.js";
import type { JsonResponse } from "./gold/types.js";

const MAX_SOURCE_LENGTH = 1_000_000;
const COMPILER_VERSION_RE = /^v?\d+\.\d+\.\d+.*$/;

export type VerifyRequest = {
  address: string;
  source: string;
  compilerVersion: string;
  optimizationEnabled?: boolean;
  optimizationRuns?: number;
  evmVersion?: string;
  constructorArguments?: string;
};

export type SolcCompiler = {
  compile: typeof solc.compile;
};

export function sanitizeVerifyRequest(body: unknown): VerifyRequest {
  if (!body || typeof body !== "object") {
    throw new VerifyError("invalid_body", 400);
  }

  const record = body as Record<string, unknown>;
  const address = requireHexAddress(
    typeof record.address === "string" ? record.address : null,
    "address",
  );

  const source = typeof record.source === "string" ? record.source : "";
  if (!source || source.length > MAX_SOURCE_LENGTH) {
    throw new VerifyError("invalid_source", 400);
  }

  const compilerVersion =
    typeof record.compilerVersion === "string" ? record.compilerVersion : "";
  if (
    !COMPILER_VERSION_RE.test(compilerVersion) ||
    compilerVersion.includes("/") ||
    compilerVersion.includes("..") ||
    compilerVersion.includes("\0")
  ) {
    throw new VerifyError("invalid_compiler_version", 400);
  }

  return {
    address,
    source,
    compilerVersion,
    optimizationEnabled: Boolean(record.optimizationEnabled),
    optimizationRuns:
      typeof record.optimizationRuns === "number"
        ? record.optimizationRuns
        : undefined,
    evmVersion:
      typeof record.evmVersion === "string" ? record.evmVersion : undefined,
    constructorArguments:
      typeof record.constructorArguments === "string"
        ? record.constructorArguments
        : undefined,
  };
}

export class VerifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VerifyError";
  }
}

export function normalizeSolcVersion(version: string): string {
  const match = version.match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new VerifyError("invalid_compiler_version", 400);
  }
  return match[1]!;
}

export function bundledSolcVersion(): string {
  return normalizeSolcVersion(solc.version());
}

export function loadSolcCompiler(
  version: string,
  loader: typeof solc.loadRemoteVersion = solc.loadRemoteVersion.bind(solc),
): Promise<SolcCompiler> {
  const normalized = normalizeSolcVersion(version);
  if (normalized === bundledSolcVersion()) {
    return Promise.resolve(solc as SolcCompiler);
  }

  const remoteVersion = normalized.startsWith("v")
    ? normalized
    : `v${normalized}`;

  return new Promise((resolve, reject) => {
    loader(remoteVersion, (error, compiler) => {
      if (error || !compiler) {
        reject(new VerifyError("compiler_version_unavailable", 400));
        return;
      }
      resolve(compiler as SolcCompiler);
    });
  });
}

async function compileContract(
  request: VerifyRequest,
  loader?: typeof solc.loadRemoteVersion,
): Promise<{
  bytecode: string;
  abi: string;
  compilerVersion: string;
}> {
  const normalized = normalizeSolcVersion(request.compilerVersion);
  const compiler = await loadSolcCompiler(request.compilerVersion, loader);
  const input = {
    language: "Solidity",
    sources: {
      "contract.sol": { content: request.source },
    },
    settings: {
      optimizer: {
        enabled: request.optimizationEnabled ?? false,
        runs: request.optimizationRuns ?? 200,
      },
      evmVersion: request.evmVersion ?? "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(
    compiler.compile(JSON.stringify(input), {
      import: () => ({ contents: "" }),
    }),
  ) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<
      string,
      Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>
    >;
  };

  const errors = output.errors?.filter((error) => error.severity === "error");
  if (errors && errors.length > 0) {
    throw new VerifyError("compile_failed", 400);
  }

  const contracts = output.contracts?.["contract.sol"];
  const firstContract = contracts ? Object.values(contracts)[0] : undefined;
  if (!firstContract) {
    throw new VerifyError("compile_failed", 400);
  }

  let bytecode = `0x${firstContract.evm.bytecode.object}`;
  if (request.constructorArguments) {
    const args = request.constructorArguments.startsWith("0x")
      ? request.constructorArguments.slice(2)
      : request.constructorArguments;
    bytecode = `${bytecode}${args}`;
  }

  return {
    bytecode,
    abi: JSON.stringify(firstContract.abi),
    compilerVersion: normalized,
  };
}

export function bytecodeMatches(onChain: string, compiled: string): boolean {
  const chain = stripMetadata(onChain.toLowerCase());
  const built = stripMetadata(compiled.toLowerCase());
  return chain === built;
}

export async function handleVerify(
  pool: Pool,
  body: unknown,
  loader?: typeof solc.loadRemoteVersion,
): Promise<JsonResponse> {
  let request: VerifyRequest;
  try {
    request = sanitizeVerifyRequest(body);
  } catch (error) {
    if (error instanceof VerifyError) {
      return { status: error.status, body: { error: error.message } };
    }
    if (error instanceof ValidationError) {
      return { status: 400, body: { error: error.message } };
    }
    return { status: 400, body: { error: "invalid_request" } };
  }

  const { rows } = await pool.query<{
    bytecode: string | null;
  }>(`SELECT bytecode FROM contracts WHERE address = $1`, [request.address]);

  if (rows.length === 0) {
    return { status: 404, body: { error: "not_found" } };
  }

  let compiled: { bytecode: string; abi: string; compilerVersion: string };
  try {
    compiled = await compileContract(request, loader);
  } catch (error) {
    if (error instanceof VerifyError) {
      return { status: error.status, body: { error: error.message } };
    }
    return { status: 400, body: { error: "compile_failed" } };
  }

  const onChain = rows[0]!.bytecode ?? "0x";
  if (!bytecodeMatches(onChain, compiled.bytecode)) {
    return { status: 400, body: { error: "bytecode_mismatch" } };
  }

  await pool.query(
    `UPDATE contracts
     SET is_verified = true,
         source_code = $2,
         abi = $3,
         compiler_version = $4,
         optimization_enabled = $5,
         optimization_runs = $6,
         evm_version = $7,
         constructor_arguments = $8
     WHERE address = $1`,
    [
      request.address,
      request.source,
      compiled.abi,
      compiled.compilerVersion,
      request.optimizationEnabled ?? false,
      request.optimizationRuns ?? null,
      request.evmVersion ?? null,
      request.constructorArguments ?? null,
    ],
  );

  return {
    status: 200,
    body: {
      verified: true,
      address: request.address,
      compilerVersion: compiled.compilerVersion,
    },
  };
}
