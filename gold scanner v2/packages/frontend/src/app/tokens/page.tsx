"use client";

import { useState } from "react";
import Link from "next/link";
import { JsonBlock } from "@/components/ui";
import { fetchTokenInfo } from "@/lib/api";
import { GOLD_CONTRACT } from "@/lib/types";

const KNOWN_TOKENS = [
  { address: GOLD_CONTRACT, label: "GOLD (ERC1155)" },
];

export default function TokensPage() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function lookup(nextAddress: string) {
    setState("loading");
    setError("");
    try {
      const result = await fetchTokenInfo(nextAddress);
      setData(result);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      setState("error");
    }
  }

  return (
    <main className="page">
      <h1>Tokens</h1>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup(address);
        }}
      >
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Contract address"
        />
        <button type="submit">Lookup</button>
      </form>

      <section className="card">
        <h2>Known tokens</h2>
        <ul>
          {KNOWN_TOKENS.map((token) => (
            <li key={token.address}>
              <Link href={`/tokens/${token.address}`}>{token.label}</Link> —{" "}
              {token.address}
            </li>
          ))}
        </ul>
      </section>

      {state === "loading" ? <p>Loading…</p> : null}
      {state === "error" ? <p>{error}</p> : null}
      {state === "ready" ? <JsonBlock value={data} /> : null}
    </main>
  );
}
