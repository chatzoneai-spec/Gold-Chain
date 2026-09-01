"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { TxTable } from "@/components/DataViews";
import { fetchRecentTransactions } from "@/lib/api";

export default function TxsPage() {
  const { state, data, retry } = useAsyncData(() => fetchRecentTransactions(20), []);

  return (
    <main className="page">
      <h1>Transactions</h1>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <TxTable txs={data!} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
