"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection, ValidatorSetTable } from "@/components/DataViews";
import { fetchStaking, fetchValidatorSet, fetchValidators } from "@/lib/api";

export default function StakingPage() {
  const validatorSet = useAsyncData(() => fetchValidatorSet(), []);
  const staking = useAsyncData(() => fetchStaking(), []);
  const validators = useAsyncData(() => fetchValidators(), []);

  return (
    <main className="page">
      <h1>Staking &amp; validators</h1>
      <p className="muted">
        Voting power, GILT vs GOLD stake split, commission, jailed, elected set — from API JSON.
      </p>

      <section className="card" data-testid="validator-set-section">
        <h2>Validator set</h2>
        <ApiStateView
          state={
            validatorSet.state.kind === "ready"
              ? {
                  kind: "ready",
                  children: <ValidatorSetTable validators={validatorSet.data!} />,
                }
              : validatorSet.state
          }
          onRetry={validatorSet.retry}
          testId="validator-set"
        />
      </section>

      <details className="card">
        <summary>Staking events (secondary)</summary>
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
      </details>

      <details className="card">
        <summary>Validator events (secondary)</summary>
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
      </details>
    </main>
  );
}
