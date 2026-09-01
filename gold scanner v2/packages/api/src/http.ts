import http from "node:http";
import type { Pool } from "pg";
import { createEvmHandler } from "./evm/register.js";
import { createGoldRouteRegistry, registerGoldRoutes, sendJsonResponse } from "./gold/register.js";
import { createWebSocketFeed, type WebSocketFeed } from "./ws.js";

export interface AppOptions {
  pool: Pool;
  apiPath?: string;
  wsPath?: string;
}

export interface GoldScanApp {
  server: http.Server;
  feed: WebSocketFeed;
}

export function createApp(options: AppOptions): GoldScanApp {
  const evmHandler = createEvmHandler({
    pool: options.pool,
    path: options.apiPath,
  });

  const goldRegistry = createGoldRouteRegistry();
  registerGoldRoutes(goldRegistry, options.pool);

  const server = http.createServer((req, res) => {
    if (evmHandler(req, res)) {
      return;
    }

    if (req.method !== "GET") {
      sendJsonResponse(res, { status: 405, body: { error: "method_not_allowed" } });
      return;
    }

    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const goldHandler = goldRegistry.routes.get(url.pathname);

    if (goldHandler) {
      void (async () => {
        try {
          const response = await goldHandler(req, url, options.pool);
          sendJsonResponse(res, response);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Internal error";
          sendJsonResponse(res, { status: 500, body: { error: message } });
        }
      })();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  const feed = createWebSocketFeed();
  feed.attach(server, options.wsPath);

  return { server, feed };
}

export function listen(
  app: GoldScanApp,
  port: number,
  host = "127.0.0.1",
): Promise<void> {
  return new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, host, () => {
      app.server.off("error", reject);
      resolve();
    });
  });
}
