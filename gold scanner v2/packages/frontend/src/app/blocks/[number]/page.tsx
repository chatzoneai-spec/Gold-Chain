"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchBlockByNumber } from "@/lib/api";

export default function BlockDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const { state, data, retry } = useAsyncData(
    () => fetchBlockByNumber(number),
    [number],
  );

  return (
    <main className="page">
      <h1>Block {number}</h1>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <JsonSection title="Block" value={data} />
                    <section className="card">
                      <h2>Transactions</h2>
                      <p className="muted">
                        Transaction list for this block is available via address
                        or global search.
                      </p>
                    </section>
                  </>
                ),
              }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
