"use client";

import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { SolvencyHero } from "@/components/SolvencyHero";
import { fetchSolvency } from "@/lib/api";

export default function SolvencyPage() {
  const { state, data, retry } = useAsyncData(() => fetchSolvency(), []);

  return (
    <main className="page">
      <ApiStateView
        state={
          state.kind === "ready"
            ? { kind: "ready", children: <SolvencyHero data={data!} /> }
            : state
        }
        onRetry={retry}
        testId="solvency-page"
      />
    </main>
  );
}
