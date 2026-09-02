export const packageName = "@goldscan/api";

export { createApp, listen, type AppOptions, type GoldScanApp } from "./http.js";
export {
  feedIndexerOptions,
  indexBlockNumbersWithFeed,
  indexWithFeed,
  processBlockWithFeed,
} from "./index-with-feed.js";
export { createWebSocketFeed, type LiveFeedEvent, type WebSocketFeed } from "./ws.js";
export { dispatchEvmApi } from "./evm/dispatch.js";
export { registerGoldRoutes, createGoldApp, computeSolvency } from "./gold/register.js";
export type { GoldApp } from "./gold/register.js";
