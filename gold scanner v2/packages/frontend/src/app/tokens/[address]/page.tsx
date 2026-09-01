"use client";

import { use } from "react";
import Link from "next/link";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { GoldIdSections } from "@/components/GoldIdSections";
import { JsonSection } from "@/components/DataViews";
import { fetchSolvency, fetchTokenInfo } from "@/lib/api";
import { GOLD_CONTRACT } from "@/lib/types";

export default function TokenDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const token = useAsyncData(() => fetchTokenInfo(address), [address]);
  const solvency = useAsyncData(
    () => (address.toLowerCase() === GOLD_CONTRACT.toLowerCase()
      ? fetchSolvency()
      : Promise.resolve(null)),
    [address],
  );

  const isGold = address.toLowerCase() === GOLD_CONTRACT.toLowerCase();

  return (
    <main className="page">
      <h1>Token</h1>
      <p className="muted">{address}</p>

      <ApiStateView
        state={
          token.state.kind === "ready"
            ? { kind: "ready", children: <JsonSection title="Token info" value={token.data} /> }
            : token.state
        }
        onRetry={token.retry}
      />

      {isGold ? (
        <section className="card" data-testid="gold-token-page">
          <h2>GOLD ERC1155 — per token ID</h2>
          <p className="muted">
            ID 1 (PAXG route) and ID 2 (XAUT route) are always shown separately.
          </p>
          <ApiStateView
            state={
              solvency.state.kind === "ready" && solvency.data
                ? {
                    kind: "ready",
                    children: <GoldIdSections solvency={solvency.data} />,
                  }
                : solvency.state
            }
            onRetry={solvency.retry}
            testId="gold-token-solvency"
          />
          <p>
            <Link href="/gold">Full GOLD page</Link>
          </p>
        </section>
      ) : null}
    </main>
  );
}
