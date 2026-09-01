"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonBlock } from "@/components/ui";
import { fetchGovernanceBoard } from "@/lib/api";

export default function GovernancePage() {
  const { state, data, retry } = useAsyncData(() => fetchGovernanceBoard(), []);

  return (
    <main className="page">
      <h1>Governance</h1>
      <p className="muted">Proposals, votes, timelock queue.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <section className="card" data-testid="governance-proposals">
                      <h2>Proposals</h2>
                      <JsonBlock value={data!.proposals} />
                    </section>
                    <section className="card" data-testid="governance-timelock">
                      <h2>Timelock queue</h2>
                      <JsonBlock value={data!.timelockQueue} />
                    </section>
                  </>
                ),
              }
            : state
        }
        onRetry={retry}
        testId="governance-page"
      />
    </main>
  );
}
