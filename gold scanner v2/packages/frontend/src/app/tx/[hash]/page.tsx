"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection } from "@/components/DataViews";
import {
  fetchAddressInternalTxList,
  fetchTransaction,
  fetchTxLogs,
  fetchTxReceiptStatus,
  fetchTxTokenTransfers,
} from "@/lib/api";

export default function TxDetailPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = use(params);
  const tx = useAsyncData(() => fetchTransaction(hash), [hash]);
  const receipt = useAsyncData(() => fetchTxReceiptStatus(hash), [hash]);
  const logs = useAsyncData(() => fetchTxLogs(hash), [hash]);
  const transfers = useAsyncData(() => fetchTxTokenTransfers(hash), [hash]);
  const internals = useAsyncData(async () => {
    const record = await fetchTransaction(hash);
    const fromInternals = await fetchAddressInternalTxList(record.from, 50);
    return fromInternals.filter((row) => row.hash === hash);
  }, [hash]);

  return (
    <main className="page">
      <h1>Transaction</h1>
      <ApiStateView
        state={
          tx.state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <section className="card" data-testid="tx-detail">
                      <div className="grid-3">
                        <div>
                          <div className="section-label">Hash</div>
                          <strong>{tx.data!.hash}</strong>
                        </div>
                        <div>
                          <div className="section-label">Block</div>
                          <strong>{tx.data!.blockNumber}</strong>
                        </div>
                        <div>
                          <div className="section-label">Fee</div>
                          <strong data-testid="tx-fee">
                            {tx.data!.fee ?? "—"}
                          </strong>
                        </div>
                      </div>
                    </section>
                    <JsonSection title="Transaction" value={tx.data} />
                    <JsonSection
                      title="Decoded input"
                      value={tx.data!.decodedInput}
                    />
                    <JsonSection title="Receipt status" value={receipt.data} />
                    <JsonSection title="Event logs" value={logs.data} />
                    <JsonSection
                      title="Internal transactions"
                      value={internals.data}
                    />
                    <JsonSection
                      title="Token transfers"
                      value={transfers.data}
                    />
                  </>
                ),
              }
            : tx.state
        }
        onRetry={tx.retry}
      />
    </main>
  );
}
