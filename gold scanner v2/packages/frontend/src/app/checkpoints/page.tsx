"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonBlock } from "@/components/ui";
import { fetchCheckpointStatus } from "@/lib/api";

export default function CheckpointsPage() {
  const { state, data, retry } = useAsyncData(() => fetchCheckpointStatus(), []);

  return (
    <main className="page">
      <h1>Checkpoints</h1>
      <p className="muted">
        Last committed checkpoint, checkpoint-chain status, divergence/halt state.
      </p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <section className="card" data-testid="checkpoint-status">
                    <div className="grid-3">
                      <div>
                        <div className="section-label">Last committed block</div>
                        <strong>
                          {data!.lastCommitted?.blockNumber ?? "—"}
                        </strong>
                      </div>
                      <div>
                        <div className="section-label">Halted</div>
                        <strong data-testid="checkpoint-halted">
                          {data!.halted ? "yes" : "no"}
                        </strong>
                      </div>
                      <div>
                        <div className="section-label">Diverged</div>
                        <strong data-testid="checkpoint-diverged">
                          {data!.diverged ? "yes" : "no"}
                        </strong>
                      </div>
                    </div>
                    <JsonBlock value={data} />
                  </section>
                ),
              }
            : state
        }
        onRetry={retry}
        testId="checkpoints-page"
      />
    </main>
  );
}
