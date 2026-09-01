"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchGovernance } from "@/lib/api";

export default function GovernancePage() {
  const { state, data, retry } = useAsyncData(() => fetchGovernance(), []);

  return (
    <main className="page">
      <h1>Governance</h1>
      <p className="muted">Proposals, votes, timelock queue.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <JsonSection title="Governance" value={data} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
