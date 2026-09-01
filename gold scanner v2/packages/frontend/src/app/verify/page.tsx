"use client";

import { useState } from "react";
import { JsonBlock } from "@/components/ui";
import { fetchContractAbi, fetchContractSource } from "@/lib/api";

export default function VerifyPage() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const [abi, source] = await Promise.all([
        fetchContractAbi(address),
        fetchContractSource(address),
      ]);
      setResult({ abi, source });
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification lookup failed");
      setStatus("error");
    }
  }

  return (
    <main className="page">
      <h1>Contract verification</h1>
      <form className="search-form" onSubmit={(event) => void verify(event)}>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Contract address"
        />
        <button type="submit">Lookup verified contract</button>
      </form>

      <section className="card">
        <h2>Submit verification (mocked)</h2>
        <div className="form-field">
          <label htmlFor="source">Source code</label>
          <textarea id="source" rows={6} placeholder="// SPDX-License-Identifier: MIT" />
        </div>
        <div className="form-field">
          <label htmlFor="compiler">Compiler version</label>
          <input id="compiler" placeholder="v0.8.20" />
        </div>
        <button type="button">Submit (mocked API)</button>
      </section>

      {status === "loading" ? <p>Loading…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "ready" ? <JsonBlock value={result} /> : null}
    </main>
  );
}
