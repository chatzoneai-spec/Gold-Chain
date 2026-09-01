import http from "node:http";
import type { Pool } from "pg";
import { handleContractCall } from "./contract-call.js";
import { handleContractEncode } from "./contract-encode.js";
import { createEvmHandler } from "./evm/register.js";
import { createGoldRouteRegistry, registerGoldRoutes, sendJsonResponse } from "./gold/register.js";
import { ValidationError, isOversizedQuery } from "./validate.js";
import { handleVerify } from "./verify.js";
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

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

function handlePostRoute(
  pathname: string,
  pool: Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  if (pathname === "/verify") {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const response = await handleVerify(pool, body);
        sendJsonResponse(res, response);
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJsonResponse(res, { status: 400, body: { error: "invalid_json" } });
          return;
        }
        const message = error instanceof Error ? error.message : "Internal error";
        sendJsonResponse(res, { status: 500, body: { error: message } });
      }
    })();
    return true;
  }

  if (pathname === "/contract/call") {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const response = await handleContractCall(body);
        sendJsonResponse(res, response);
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJsonResponse(res, { status: 400, body: { error: "invalid_json" } });
          return;
        }
        const message = error instanceof Error ? error.message : "Internal error";
        sendJsonResponse(res, { status: 500, body: { error: message } });
      }
    })();
    return true;
  }

  if (pathname === "/contract/encode") {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        sendJsonResponse(res, handleContractEncode(body));
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJsonResponse(res, { status: 400, body: { error: "invalid_json" } });
          return;
        }
        const message = error instanceof Error ? error.message : "Internal error";
        sendJsonResponse(res, { status: 500, body: { error: message } });
      }
    })();
    return true;
  }

  return false;
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

    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (req.method === "POST") {
      if (handlePostRoute(url.pathname, options.pool, req, res)) {
        return;
      }
      sendJsonResponse(res, { status: 405, body: { error: "method_not_allowed" } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/contract/encode") {
      if (isOversizedQuery(url)) {
        sendJsonResponse(res, { status: 400, body: { error: "query_too_large" } });
        return;
      }
      const address = url.searchParams.get("address");
      const signature = url.searchParams.get("signature");
      let args: unknown[] = [];
      const argsParam = url.searchParams.get("args");
      if (argsParam) {
        try {
          args = JSON.parse(argsParam) as unknown[];
        } catch {
          sendJsonResponse(res, { status: 400, body: { error: "invalid_args" } });
          return;
        }
      }
      sendJsonResponse(
        res,
        handleContractEncode({ address, signature, args }),
      );
      return;
    }

    if (req.method !== "GET") {
      sendJsonResponse(res, { status: 405, body: { error: "method_not_allowed" } });
      return;
    }

    if (isOversizedQuery(url)) {
      sendJsonResponse(res, { status: 400, body: { error: "query_too_large" } });
      return;
    }

    const goldHandler = goldRegistry.routes.get(url.pathname);

    if (goldHandler) {
      void (async () => {
        try {
          const response = await goldHandler(req, url, options.pool);
          sendJsonResponse(res, response);
        } catch (error) {
          if (error instanceof ValidationError) {
            sendJsonResponse(res, { status: 400, body: { error: error.message } });
            return;
          }

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
