import { handleAccountModule } from "./account.js";
import { handleContractModule } from "./contract.js";
import { handleLogsModule } from "./logs.js";
import { handleTokenModule } from "./token.js";
import {
  getTransactionByHash,
  handleBlockModule,
  handleTransactionModule,
} from "./transaction.js";
import { notOk } from "./response.js";
import type { ApiContext } from "./types.js";

const MODULE_HANDLERS: Record<
  string,
  (action: string, params: URLSearchParams, ctx: ApiContext) => Promise<import("./response.js").EtherscanResponse>
> = {
  account: handleAccountModule,
  transaction: handleTransactionModule,
  tx: async (action, params, ctx) => {
    if (action.toLowerCase() === "gettxbyhash") {
      return getTransactionByHash(params, ctx);
    }
    return notOk(`Unknown action: ${action}`);
  },
  block: handleBlockModule,
  logs: handleLogsModule,
  token: handleTokenModule,
  contract: handleContractModule,
};

export async function dispatchEvmApi(
  params: URLSearchParams,
  ctx: ApiContext,
): Promise<import("./response.js").EtherscanResponse> {
  const module = params.get("module")?.toLowerCase();
  const action = params.get("action") ?? "";

  if (!module || !action) {
    return notOk("Missing module or action parameter");
  }

  const handler = MODULE_HANDLERS[module];
  if (!handler) {
    return notOk(`Unknown module: ${module}`);
  }

  return handler(action, params, ctx);
}
