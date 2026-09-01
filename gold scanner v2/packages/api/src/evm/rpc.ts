const DEFAULT_RPC_URL = process.env.GOLDSCAN_RPC_URL;

export type RpcCaller = (method: string, params: unknown[]) => Promise<string>;

export function getRpcUrl(): string | undefined {
  return process.env.GOLDSCAN_RPC_URL ?? DEFAULT_RPC_URL;
}

export function createHttpRpcCaller(rpcUrl: string): RpcCaller {
  return async (method, params) => {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    const body = (await response.json()) as {
      result?: string;
      error?: { message: string };
    };

    if (body.error) {
      throw new Error(body.error.message);
    }

    if (typeof body.result !== "string") {
      throw new Error("Invalid RPC response");
    }

    return body.result;
  };
}

export async function ethCall(
  address: string,
  data: string,
  caller?: RpcCaller,
): Promise<string> {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl && !caller) {
    throw new Error("rpc_unavailable");
  }

  const call = caller ?? createHttpRpcCaller(rpcUrl!);
  return call("eth_call", [{ to: address, data }, "latest"]);
}
