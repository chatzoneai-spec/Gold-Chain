"use client";

import Link from "next/link";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { GoldIdSections } from "@/components/GoldIdSections";
import { JsonSection } from "@/components/DataViews";
import { fetchSolvency, fetchTokenHolders, fetchTokenInfo } from "@/lib/api";
import { GOLD_CONTRACT, type GoldHolders } from "@/lib/types";

function isGoldHolders(value: unknown): value is GoldHolders {
  return (
    typeof value === "object" &&
    value !== null &&
    "id1" in value &&
    "id2" in value
  );
}

export default function GoldPage() {
  const solvency = useAsyncData(() => fetchSolvency(), []);
  const tokenInfo = useAsyncData(() => fetchTokenInfo(GOLD_CONTRACT), []);
  const holders = useAsyncData(() => fetchTokenHolders(GOLD_CONTRACT), []);
  const goldHolders = isGoldHolders(holders.data) ? holders.data : null;

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
          tokenInfo.state.kind === "ready"
            ? {
                kind: "ready",
                children: <JsonSection title="Token info" value={tokenInfo.data} />,
              }
            : tokenInfo.state
        }
        onRetry={tokenInfo.retry}
        testId="gold-token-info"
      />

      <ApiStateView
        state={
          solvency.state.kind === "ready"
            ? {
                kind: "ready",
                children: (
                  <>
                    <GoldIdSections
                      solvency={solvency.data!}
                      holdersId1={goldHolders?.id1}
                      holdersId2={goldHolders?.id2}
                    />
                    <JsonSection title="API solvency payload" value={solvency.data} />
                  </>
                ),
              }
            : solvency.state
        }
        onRetry={solvency.retry}
        testId="gold-page"
      />
    </main>
  );
}
