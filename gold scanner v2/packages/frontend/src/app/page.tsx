"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { BlockTable, TxTable } from "@/components/DataViews";
import { SolvencyHero } from "@/components/SolvencyHero";
import { JsonBlock } from "@/components/ui";
import {
  fetchLatestBlock,
  fetchRecentBlocks,
  fetchRecentTransactions,
  fetchSolvency,
} from "@/lib/api";

export default function HomePage() {
  const solvency = useAsyncData(() => fetchSolvency(), []);
  const blocks = useAsyncData(() => fetchRecentBlocks(5), []);
  const txs = useAsyncData(() => fetchRecentTransactions(5), []);
  const stats = useAsyncData(() => fetchLatestBlock(), []);

  return (
    <main className="page">
      <ApiStateView
        state={
          solvency.state.kind === "ready"
            ? { kind: "ready", children: <SolvencyHero data={solvency.data!} /> }
            : solvency.state
        }
        onRetry={solvency.retry}
        testId="home-solvency"
      />

      <section className="card">
        <h2>Chain stats</h2>
        <ApiStateView
          state={
            stats.state.kind === "ready"
              ? {
                  kind: "ready",
                  children: (
                    <div className="grid-3">
                      <div>
                        <div className="section-label">Latest block</div>
                        <strong>{stats.data!.number}</strong>
                      </div>
                      <div>
                        <div className="section-label">Gas used / limit</div>
                        <strong>
                          {stats.data!.gasUsed} / {stats.data!.gasLimit}
                        </strong>
                      </div>
                      <div>
                        <div className="section-label">Block time</div>
                        <strong>{stats.data!.timestamp}</strong>
                      </div>
                    </div>
                  ),
                }
              : stats.state
          }
          onRetry={stats.retry}
          testId="home-stats"
        />
        {stats.data ? <JsonBlock value={stats.data} /> : null}
      </section>

      <section className="card">
        <h2>Latest blocks</h2>
        <ApiStateView
          state={
            blocks.state.kind === "ready"
              ? { kind: "ready", children: <BlockTable blocks={blocks.data!} /> }
              : blocks.state
          }
          onRetry={blocks.retry}
          testId="home-blocks"
        />
      </section>

      <section className="card">
        <h2>Latest transactions</h2>
        <ApiStateView
          state={
            txs.state.kind === "ready"
              ? { kind: "ready", children: <TxTable txs={txs.data!} /> }
              : txs.state
          }
          onRetry={txs.retry}
          testId="home-txs"
        />
      </section>
    </main>
  );
}
