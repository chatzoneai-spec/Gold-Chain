import type { IncomingMessage, ServerResponse } from "node:http";
import type pg from "pg";
import {
  createGoldRouteRegistry,
  sendJsonResponse,
  type GoldApp,
  type GoldRouteHandler,
  type GoldRouteRegistry,
} from "./app.js";
import {
  fetchBridgeActivity,
  fetchCheckpoints,
  fetchDelegationEvents,
  fetchGovernanceEvents,
  fetchMigrationStatus,
  fetchRedemptionReceiptById,
  fetchRedemptionReceipts,
  fetchStakingEvents,
  fetchValidatorEvents,
} from "./queries.js";
import { computeSolvency } from "./solvency.js";

export { createGoldRouteRegistry, dispatchGoldGet, sendJsonResponse } from "./app.js";
export { computeSolvency } from "./solvency.js";
export type { GoldApp, GoldRouteHandler } from "./app.js";

export type GoldRouteOptions = {
  pool: pg.Pool;
  pathPrefix?: string;
};

function withPool(
  pool: pg.Pool,
  fn: (client: pg.PoolClient, url: URL) => Promise<unknown>,
): GoldRouteHandler {
  return async (_req, url, routePool) => {
    const client = await routePool.connect();
    try {
      const body = await fn(client, url);
      return { status: 200, body };
    } finally {
      client.release();
    }
  };
}

function registerGoldRoutesOnRegistry(
  app: GoldApp,
  pool: pg.Pool,
): void {
  app.get(
    "/gold/solvency",
    withPool(pool, async (client) => computeSolvency(client)),
  );

  app.get("/gold/redemption-receipts", async (_req, url, routePool) => {
    const client = await routePool.connect();
    try {
      const correlationId = url.searchParams.get("receiptCorrelationId");
      if (correlationId) {
        const receipt = await fetchRedemptionReceiptById(client, correlationId);
        if (!receipt) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: receipt };
      }
      const body = await fetchRedemptionReceipts(client, url.searchParams);
      return { status: 200, body };
    } finally {
      client.release();
    }
  });

  app.get(
    "/gold/bridge-activity",
    withPool(pool, async (client) => fetchBridgeActivity(client)),
  );

  app.get(
    "/gold/staking",
    withPool(pool, async (client, url) => fetchStakingEvents(client, url.searchParams)),
  );

  app.get(
    "/gold/validators",
    withPool(pool, async (client, url) => fetchValidatorEvents(client, url.searchParams)),
  );

  app.get(
    "/gold/delegation",
    withPool(pool, async (client, url) => fetchDelegationEvents(client, url.searchParams)),
  );

  app.get(
    "/gold/checkpoints",
    withPool(pool, async (client, url) => fetchCheckpoints(client, url.searchParams)),
  );

  app.get(
    "/gold/governance",
    withPool(pool, async (client, url) => fetchGovernanceEvents(client, url.searchParams)),
  );

  app.get(
    "/gold/migration-status",
    withPool(pool, async (client) => fetchMigrationStatus(client)),
  );
}

export function registerGoldRoutes(
  app: GoldApp | import("node:http").Server,
  poolOrOptions?: pg.Pool | GoldRouteOptions,
): void {
  if ("get" in app) {
    const pool = poolOrOptions as pg.Pool;
    registerGoldRoutesOnRegistry(app, pool);
    return;
  }

  const options =
    poolOrOptions && "pool" in poolOrOptions
      ? poolOrOptions
      : { pool: poolOrOptions as pg.Pool };
  const handler = createGoldHandler(options);
  app.on("request", (req, res) => {
    handler(req, res);
  });
}

export function createGoldHandler(options: GoldRouteOptions) {
  const registry = createGoldRouteRegistry();
  registerGoldRoutesOnRegistry(registry, options.pool);
  const pathPrefix = options.pathPrefix ?? "/gold";

  return function handleGoldRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    if (!req.url || req.method !== "GET") {
      return false;
    }

    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url, `http://${host}`);

    if (!url.pathname.startsWith(pathPrefix)) {
      return false;
    }

    const routeHandler = registry.routes.get(url.pathname);
    if (!routeHandler) {
      sendJsonResponse(res, { status: 404, body: { error: "not_found" } });
      return true;
    }

    void (async () => {
      const response = await routeHandler(req, url, options.pool);
      sendJsonResponse(res, response);
    })();

    return true;
  };
}

export function createGoldApp(pool: pg.Pool): GoldRouteRegistry & {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
} {
  const registry = createGoldRouteRegistry();
  registerGoldRoutesOnRegistry(registry, pool);

  return {
    ...registry,
    async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (req.method !== "GET") {
        sendJsonResponse(res, { status: 405, body: { error: "method_not_allowed" } });
        return;
      }

      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url ?? "/", `http://${host}`);
      const handler = registry.routes.get(url.pathname);

      if (!handler) {
        sendJsonResponse(res, { status: 404, body: { error: "not_found" } });
        return;
      }

      const response = await handler(req, url, pool);
      sendJsonResponse(res, response);
    },
  };
}
