"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { TokenListTable } from "@/components/DataViews";
import { fetchTokenList } from "@/lib/api";

export default function TokensPage() {
  const { state, data, retry } = useAsyncData(() => fetchTokenList(), []);

  return (
    <main className="page">
      <h1>Tokens</h1>
      <p className="muted">Indexed token contracts from the API.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: <TokenListTable tokens={data!} />,
              }
            : state
        }
        onRetry={retry}
        testId="token-list"
      />
    </main>
  );
}
