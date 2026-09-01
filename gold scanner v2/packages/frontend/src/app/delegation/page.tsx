"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchDelegation } from "@/lib/api";

export default function DelegationPage() {
  const { state, data, retry } = useAsyncData(() => fetchDelegation(), []);

  return (
    <main className="page">
      <h1>Delegation</h1>
      <p className="muted">Per-address GILT and GOLD delegations, unbonding queue.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <JsonSection title="Delegation" value={data} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
