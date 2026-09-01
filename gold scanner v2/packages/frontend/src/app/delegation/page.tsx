"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonBlock } from "@/components/ui";
import { fetchDelegations } from "@/lib/api";

export default function DelegationPage() {
  const { state, data, retry } = useAsyncData(() => fetchDelegations(), []);

  return (
    <main className="page">
      <h1>Delegation</h1>
      <p className="muted">Per-address GILT and GOLD delegations, unbonding queue.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <section className="card" data-testid="delegations-section">
                      <h2>Active delegations</h2>
                      <JsonBlock value={data!.delegations} />
                    </section>
                    <section className="card" data-testid="unbonding-section">
                      <h2>Unbonding</h2>
                      <JsonBlock value={data!.unbonding} />
                    </section>
                  </>
                ),
              }
            : state
        }
        onRetry={retry}
        testId="delegation-page"
      />
    </main>
  );
}
