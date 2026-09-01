import type { IncomingMessage, ServerResponse } from "node:http";
import type pg from "pg";
import type { JsonResponse } from "./types.js";

export type GoldRouteHandler = (
  req: IncomingMessage,
  url: URL,
  pool: pg.Pool,
) => Promise<JsonResponse>;

export type GoldApp = {
  get(path: string, handler: GoldRouteHandler): void;
};

export type GoldRouteRegistry = GoldApp & {
  routes: Map<string, GoldRouteHandler>;
};

export function createGoldRouteRegistry(): GoldRouteRegistry {
  const routes = new Map<string, GoldRouteHandler>();

  return {
    routes,
    get(path: string, handler: GoldRouteHandler): void {
      routes.set(path, handler);
    },
  };
}

export async function dispatchGoldGet(
  registry: GoldRouteRegistry,
  pool: pg.Pool,
  path: string,
  search = "",
): Promise<JsonResponse> {
  const handler = registry.routes.get(path);
  if (!handler) {
    return { status: 404, body: { error: "not_found" } };
  }

  const url = new URL(`http://localhost${path}${search}`);
  const req = { method: "GET" } as IncomingMessage;
  return handler(req, url, pool);
}

export function sendJsonResponse(
  res: ServerResponse,
  response: JsonResponse,
): void {
  res.statusCode = response.status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(response.body));
}
