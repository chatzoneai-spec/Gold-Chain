import type { ApiContext } from "./types.js";
import { notOk, ok } from "./response.js";

export async function handleContractModule(
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) {
  switch (action.toLowerCase()) {
    case "getabi":
      return getAbi(params, ctx);
    case "getsourcecode":
      return getSourceCode(params, ctx);
    default:
      return notOk(`Unknown action: ${action}`);
  }
}

async function getAbi(params: URLSearchParams, ctx: ApiContext) {
  const address = params.get("address")?.trim().toLowerCase();
  if (!address) {
    return notOk("Missing address parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT is_verified FROM contracts WHERE address = $1`,
    [address],
  );

  if (rows.length === 0) {
    return notOk("Contract source code not verified");
  }

  if (!rows[0]!.is_verified) {
    return notOk("Contract source code not verified");
  }

  return ok("[]");
}

async function getSourceCode(params: URLSearchParams, ctx: ApiContext) {
  const address = params.get("address")?.trim().toLowerCase();
  if (!address) {
    return notOk("Missing address parameter");
  }

  const { rows } = await ctx.pool.query(
    `SELECT address, bytecode, is_verified, compiler_version,
            optimization_enabled, optimization_runs, evm_version, constructor_arguments
     FROM contracts
     WHERE address = $1`,
    [address],
  );

  if (rows.length === 0) {
    return notOk("Contract source code not verified");
  }

  const row = rows[0]!;
  return ok([
    {
      SourceCode: "",
      ABI: "Contract source code not verified",
      ContractName: "",
      CompilerVersion: row.compiler_version ?? "",
      OptimizationUsed: row.optimization_enabled ? "1" : "0",
      Runs: row.optimization_runs === null ? "" : String(row.optimization_runs),
      ConstructorArguments: row.constructor_arguments ?? "",
      EVMVersion: row.evm_version ?? "",
      Library: "",
      LicenseType: "Unknown",
      Proxy: "0",
      Implementation: "",
      SwarmSource: "",
      IsVerified: row.is_verified ? "1" : "0",
      Bytecode: row.bytecode ?? "",
    },
  ]);
}
