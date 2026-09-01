"use client";

import Link from "next/link";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { GoldIdSections } from "@/components/GoldIdSections";
import { JsonSection } from "@/components/DataViews";
import { fetchSolvency } from "@/lib/api";
import { GOLD_CONTRACT } from "@/lib/types";

export default function GoldPage() {
  const { state, data, retry } = useAsyncData(() => fetchSolvency(), []);

  return (
    <main className="page">
      <h1>GOLD ERC1155</h1>
      <p className="muted">
        Contract: <Link href={`/tokens/${GOLD_CONTRACT}`}>{GOLD_CONTRACT}</Link>
      </p>
      <p className="muted">
        Balances, holders, and supply per token ID 1 and 2 — never collapsed.
      </p>
      <ApiStateView
        state={
          state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <GoldIdSections solvency={data!} />
                    <JsonSection title="API solvency payload" value={data} />
                  </>
                ),
              }
            : state
        }
        onRetry={retry}
        testId="gold-page"
      />
    </main>
  );
}
