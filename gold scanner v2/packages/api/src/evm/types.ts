import type { Pool } from "pg";

export interface ApiContext {
  pool: Pool;
}

export type ModuleHandler = (
  action: string,
  params: URLSearchParams,
  ctx: ApiContext,
) => Promise<import("./response.js").EtherscanResponse>;
