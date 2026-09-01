"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { FinalityBadge, JsonBlock } from "@/components/ui";
import { fetchBridgeActivity } from "@/lib/api";
import type { BridgeTransferRow } from "@/lib/types";

export default function BridgePage() {
  const { state, data, retry } = useAsyncData(() => fetchBridgeActivity(), []);

  return (
    <main className="page">
      <h1>Bridge activity</h1>
      <p className="muted">Finalized and pending transfers are shown separately.</p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <TransferSection
                      title="Finalized"
                      rows={data!.finalized}
                      testId="bridge-finalized"
                    />
                    <TransferSection
                      title="Pending (never shown as complete)"
                      rows={data!.pending}
                      testId="bridge-pending"
                    />
                  </>
                ),
              }
            : state
        }
        onRetry={retry}
        testId="bridge-page"
      />
    </main>
  );
}

function TransferSection({
  title,
  rows,
  testId,
}: {
  title: string;
  rows: BridgeTransferRow[];
  testId: string;
}) {
  return (
    <section className="card" data-testid={testId}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No transfers.</p>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="card">
            <p>
              {row.direction} — {row.routeAsset} — {row.bridgeState}{" "}
              <FinalityBadge status={row.finalityStatus} />
            </p>
            <p>Complete: {String(row.complete)}</p>
            <JsonBlock value={row} />
          </div>
        ))
      )}
    </section>
  );
}
