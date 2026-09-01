"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchStaking, fetchValidators } from "@/lib/api";

export default function StakingPage() {
  const staking = useAsyncData(() => fetchStaking(), []);
  const validators = useAsyncData(() => fetchValidators(), []);

  return (
    <main className="page">
      <h1>Staking &amp; validators</h1>
      <p className="muted">
        Voting power, GILT vs GOLD stake split, commission, jailed, elected set — from API JSON.
      </p>

      <ApiStateView
        state={
          staking.state.kind === "ready"
            ? {
                kind: "ready",
                children: <JsonSection title="Staking events" value={staking.data} />,
              }
            : staking.state
        }
        onRetry={staking.retry}
      />

      <ApiStateView
        state={
          validators.state.kind === "ready"
            ? {
                kind: "ready",
                children: <JsonSection title="Validator events" value={validators.data} />,
              }
            : validators.state
        }
        onRetry={validators.retry}
      />
    </main>
  );
}
