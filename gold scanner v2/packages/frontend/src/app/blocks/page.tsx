"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { BlockTable } from "@/components/DataViews";
import { fetchRecentBlocks } from "@/lib/api";

export default function BlocksPage() {
  const { state, data, retry } = useAsyncData(() => fetchRecentBlocks(20), []);

  return (
    <main className="page">
      <h1>Blocks</h1>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <BlockTable blocks={data!} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
