"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import { fetchRedemptionReceipt } from "@/lib/api";

export default function RedemptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, data, retry } = useAsyncData(
    () => fetchRedemptionReceipt(id),
    [id],
  );

  return (
    <main className="page">
      <h1>Redemption receipt</h1>
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <JsonSection title="Receipt" value={data} /> }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}
