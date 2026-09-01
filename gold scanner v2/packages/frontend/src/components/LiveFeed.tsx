"use client";

import { useEffect, useState } from "react";
import type { LiveFeedEvent } from "@/lib/types";
import { JsonBlock } from "./ui";

type Props = {
  wsUrl?: string;
  testSocket?: {
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    close: () => void;
    send: (data: string) => void;
  };
};

export function LiveFeed({ wsUrl = "/ws", testSocket }: Props) {
  const [events, setEvents] = useState<LiveFeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (testSocket) {
      testSocket.onopen = () => setConnected(true);
      testSocket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as LiveFeedEvent;
          setEvents((current) => [payload, ...current].slice(0, 10));
        } catch {
          setError("Invalid WebSocket payload");
        }
      };
      return () => {
        testSocket.close();
      };
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = wsUrl.startsWith("/")
      ? `${protocol}//${host}${wsUrl}`
      : wsUrl;

    const socket = new WebSocket(url);

    socket.onopen = () => {
      setConnected(true);
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as LiveFeedEvent;
        setEvents((current) => [payload, ...current].slice(0, 10));
      } catch {
        setError("Invalid WebSocket payload");
      }
    };

    socket.onerror = () => {
      setError("WebSocket connection error");
    };

    socket.onclose = () => {
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [wsUrl, testSocket]);

  return (
    <section className="card" data-testid="live-feed">
      <h2>Live feed</h2>
      <p className="muted" data-testid="live-feed-status">
        {connected ? "Connected" : "Disconnected"}
        {error ? ` — ${error}` : ""}
      </p>
      {events.length === 0 ? (
        <p className="muted" data-testid="live-feed-empty">
          Waiting for block or transaction events…
        </p>
      ) : (
        <ul className="live-feed-list">
          {events.map((event, index) => (
            <li key={`${event.type}-${index}`} data-testid={`live-feed-event-${event.type}`}>
              <JsonBlock value={event} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
