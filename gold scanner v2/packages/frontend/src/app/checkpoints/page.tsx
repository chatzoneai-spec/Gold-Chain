"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchCheckpoints } from "@/lib/api";

export default function CheckpointsPage() {
  const { state, data, retry } = useAsyncData(() => fetchCheckpoints(), []);

  return (
    <main className="page">
      <h1>Checkpoints</h1>
      <p className="muted">
        Last committed checkpoint, checkpoint-chain status, divergence/halt state.
      </p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <JsonSection title="Checkpoints" value={data} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
