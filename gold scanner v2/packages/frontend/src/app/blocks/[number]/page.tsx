"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection, TxTable } from "@/components/DataViews";
import { FinalityBadge } from "@/components/ui";
import { fetchBlockByNumber, fetchBlockTxList } from "@/lib/api";

export default function BlockDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const block = useAsyncData(() => fetchBlockByNumber(number), [number]);
  const txList = useAsyncData(() => fetchBlockTxList(number), [number]);

  return (
    <main className="page">
      <h1>Block {number}</h1>
      <ApiStateView
        state={
          block.state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <section className="card" data-testid="block-detail">
                      <div className="grid-3">
                        <div>
                          <div className="section-label">Number</div>
                          <strong>{block.data!.number}</strong>
                        </div>
                        <div>
                          <div className="section-label">Hash</div>
                          <strong>{block.data!.hash}</strong>
                        </div>
                        <div>
                          <div className="section-label">Timestamp</div>
                          <strong>{block.data!.timestamp}</strong>
                        </div>
                        <div>
                          <div className="section-label">Validator</div>
                          <strong>{block.data!.validator}</strong>
                        </div>
                        <div>
                          <div className="section-label">Gas used / limit</div>
                          <strong>
                            {block.data!.gasUsed} / {block.data!.gasLimit}
                          </strong>
                        </div>
                        <div>
                          <div className="section-label">Finality</div>
                          <FinalityBadge status={block.data!.finalityStatus} />
                        </div>
                      </div>
                    </section>
                    <JsonSection title="Block JSON" value={block.data} />
                    <section className="card" data-testid="block-tx-list">
                      <h2>Transactions</h2>
                      <ApiStateView
                        state={
                          txList.state.kind === "ready"
                            ? {
                                kind: "ready",
                                children: <TxTable txs={txList.data!} />,
                              }
                            : txList.state
                        }
                        onRetry={txList.retry}
                        testId="block-txs"
                      />
                    </section>
                  </>
                ),
              }
            : block.state
        }
        onRetry={block.retry}
      />
    </main>
  );
}
