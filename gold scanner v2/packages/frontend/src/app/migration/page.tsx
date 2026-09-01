"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { FinalityBadge, JsonBlock } from "@/components/ui";
import { fetchMigrationStatus } from "@/lib/api";

const STATUSES = ["INACTIVE", "PREPARE", "ACTIVE", "EXIT_ONLY", "FINALIZED"] as const;

export default function MigrationPage() {
  const { state, data, retry } = useAsyncData(() => fetchMigrationStatus(), []);

  return (
    <main className="page">
      <h1>Migration status</h1>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <section className="card">
                    <h2>Current status: {data!.status}</h2>
                    <div className="trail-steps">
                      {STATUSES.map((status) => (
                        <div
                          key={status}
                          className={`trail-step ${status === data!.status ? "complete" : "incomplete"}`}
                        >
                          {status}
                        </div>
                      ))}
                    </div>
                    <FinalityBadge status="finalized" />
                    <JsonBlock value={data} />
                  </section>
                ),
              }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
