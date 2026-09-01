"use client";

import { useState } from "react";
import Link from "next/link";
import { JsonBlock } from "@/components/ui";
import { globalSearch } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready" | "empty">("idle");
  const [result, setResult] = useState<Awaited<ReturnType<typeof globalSearch>>>(null);
  const [error, setError] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const found = await globalSearch(query);
      setResult(found);
      setStatus(found ? "ready" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setStatus("error");
    }
  }

  return (
    <main className="page">
      <h1>Search</h1>
      <p className="muted">Address, transaction hash, block number, or token contract.</p>
      <form className="search-form" onSubmit={(event) => void search(event)}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="0x… or block number"
        />
        <button type="submit">Search</button>
      </form>

      {status === "loading" ? <p>Loading…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "empty" ? <p>No results.</p> : null}
      {status === "ready" && result ? (
        <section className="card">
          <h2>Result: {result.type}</h2>
          {result.type === "block" ? (
            <Link href={`/blocks/${result.data.number}`}>Open block {result.data.number}</Link>
          ) : null}
          {result.type === "transaction" ? (
            <Link href={`/tx/${result.data.hash}`}>Open transaction</Link>
          ) : null}
          {result.type === "address" ? (
            <Link href={`/address/${result.data.address}`}>Open address</Link>
          ) : null}
          {result.type === "token" ? (
            <Link href={`/tokens/${result.data[0]?.contractAddress}`}>Open token</Link>
          ) : null}
          <JsonBlock value={result.data} />
        </section>
      ) : null}
    </main>
  );
}
