import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { dispatchEvmApi } from "./dispatch.js";
import type { ApiContext } from "./types.js";

export interface EvmRouteOptions {
  pool: Pool;
  path?: string;
}

export function createEvmHandler(options: EvmRouteOptions) {
  const apiPath = options.path ?? "/api";
  const ctx: ApiContext = { pool: options.pool };

  return function handleEvmRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    if (!req.url) {
      return false;
    }

    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url, `http://${host}`);

    if (url.pathname !== apiPath) {
      return false;
    }

    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "0",
          message: "Method Not Allowed",
          result: "Read-only API: writes are not permitted",
        }),
      );
      return true;
    }

    void (async () => {
      try {
        const response = await dispatchEvmApi(url.searchParams, ctx);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "0",
            message: "NOTOK",
            result: message,
          }),
        );
      }
    })();

    return true;
  };
}

export function registerEvmRoutes(
  server: import("node:http").Server,
  options: EvmRouteOptions,
): void {
  const handler = createEvmHandler(options);
  server.on("request", (req, res) => {
    handler(req, res);
  });
}
