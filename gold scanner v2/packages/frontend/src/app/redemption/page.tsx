"use client";

import Link from "next/link";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { FinalityBadge, JsonBlock } from "@/components/ui";
import { fetchRedemptionReceipts } from "@/lib/api";
import type { RedemptionReceipt } from "@/lib/types";

export default function RedemptionPage() {
  const { state, data, retry } = useAsyncData(() => fetchRedemptionReceipts(), []);

  return (
    <main className="page">
      <h1>Redemption receipts</h1>
      <p className="muted">
        GOLD burn linked to root asset released — locked → synced → minted_or_credited →
        burned_or_debited → released.
      </p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <div>
                    {(data?.items ?? []).map((receipt) => (
                      <ReceiptCard key={receipt.receiptCorrelationId} receipt={receipt} />
                    ))}
                  </div>
                ),
              }
            : state
        }
        onRetry={retry}
      />
    </main>
  );
}

function ReceiptCard({ receipt }: { receipt: RedemptionReceipt }) {
  const stageOrder = [
    "locked",
    "synced",
    "minted_or_credited",
    "burned_or_debited",
    "released",
  ];

  return (
    <section className="card">
      <h2>
        <Link href={`/redemption/${receipt.receiptCorrelationId}`}>
          {receipt.receiptCorrelationId.slice(0, 18)}…
        </Link>
      </h2>
      <p>
        Route: <strong>{receipt.routeAsset}</strong> — complete:{" "}
        <strong>{String(receipt.complete)}</strong>
      </p>
      <div className="trail-steps">
        {stageOrder.map((stageName) => {
          const stage = receipt.stages.find((item) => item.bridgeState === stageName);
          return (
            <div
              key={stageName}
              className={`trail-step ${stage?.complete ? "complete" : "incomplete"}`}
            >
              {stageName}
              {stage ? (
                <>
                  {" "}
                  <FinalityBadge status={stage.finalityStatus} />
                </>
              ) : (
                " (missing)"
              )}
            </div>
          );
        })}
      </div>
      <JsonBlock value={receipt} />
    </section>
  );
}
