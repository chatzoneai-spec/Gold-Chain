import { EventEmitter } from "node:events";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface BlockEvent {
  type: "block";
  number: string;
  hash: string;
  timestamp: string;
  finalityStatus: string;
}

export interface TxEvent {
  type: "tx";
  hash: string;
  blockNumber: string;
  from: string;
  to: string;
  value: string;
  finalityStatus: string;
}

export type LiveFeedEvent = BlockEvent | TxEvent;

export interface WebSocketFeed {
  emitter: EventEmitter;
  broadcast(event: LiveFeedEvent): void;
  attach(server: HttpServer, path?: string): WebSocketServer;
}

export function createWebSocketFeed(): WebSocketFeed {
  const emitter = new EventEmitter();
  const clients = new Set<WebSocket>();

  const broadcast = (event: LiveFeedEvent): void => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
    emitter.emit("broadcast", event);
  };

  const attach = (server: HttpServer, path = "/ws"): WebSocketServer => {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req: IncomingMessage, socket, head) => {
      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname !== path) {
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        ws.on("close", () => {
          clients.delete(ws);
        });
        wss.emit("connection", ws, req);
      });
    });

    emitter.on("broadcast", (event: LiveFeedEvent) => {
      void event;
    });

    return wss;
  };

  return { emitter, broadcast, attach };
}
