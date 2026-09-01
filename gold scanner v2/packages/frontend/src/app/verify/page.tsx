"use client";

import { useState } from "react";
import { JsonBlock } from "@/components/ui";
import {
  fetchContractAbi,
  fetchContractSource,
  postVerify,
} from "@/lib/api";

export default function VerifyPage() {
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("");
  const [compilerVersion, setCompilerVersion] = useState("v0.8.20");
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "error" | "ready"
  >("idle");
  const [verifyStatus, setVerifyStatus] = useState<
    "idle" | "loading" | "error" | "success" | "mismatch"
  >("idle");
  const [lookupResult, setLookupResult] = useState<unknown>(null);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [error, setError] = useState("");

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setLookupStatus("loading");
    setError("");
    try {
      const [abi, sourceCode] = await Promise.all([
        fetchContractAbi(address),
        fetchContractSource(address),
      ]);
      setLookupResult({ abi, source: sourceCode });
      setLookupStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification lookup failed");
      setLookupStatus("error");
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setVerifyStatus("loading");
    setVerifyMessage("");
    try {
      const result = await postVerify({
        address,
        source,
        compilerVersion,
      });
      if ("verified" in result && result.verified) {
        setVerifyStatus("success");
        setVerifyMessage(`Verified: ${result.address}`);
      } else {
        setVerifyStatus("mismatch");
        setVerifyMessage("Verification failed");
      }
    } catch (err) {
      setVerifyStatus("mismatch");
      setVerifyMessage(err instanceof Error ? err.message : "Verification failed");
    }
  }

  return (
    <main className="page">
      <h1>Contract verification</h1>
      <form className="search-form" onSubmit={(event) => void lookup(event)}>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Contract address"
        />
        <button type="submit">Lookup verified contract</button>
      </form>

      <section className="card">
        <h2>Submit verification</h2>
        <form className="form-field" onSubmit={(event) => void verify(event)}>
          <label htmlFor="source">Source code</label>
          <textarea
            id="source"
            rows={6}
            placeholder="// SPDX-License-Identifier: MIT"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <label htmlFor="compiler">Compiler version</label>
          <input
            id="compiler"
            placeholder="v0.8.20"
            value={compilerVersion}
            onChange={(event) => setCompilerVersion(event.target.value)}
          />
          <div className="form-actions">
            <button type="submit">Submit verification</button>
          </div>
        </form>
        {verifyStatus === "loading" ? <p>Verifying…</p> : null}
        {verifyStatus === "success" ? (
          <p className="success-text" data-testid="verify-success">
            {verifyMessage}
          </p>
        ) : null}
        {verifyStatus === "mismatch" ? (
          <p className="error-text" data-testid="verify-mismatch">
            {verifyMessage}
          </p>
        ) : null}
      </section>

      {lookupStatus === "loading" ? <p>Loading…</p> : null}
      {lookupStatus === "error" ? <p>{error}</p> : null}
      {lookupStatus === "ready" ? <JsonBlock value={lookupResult} /> : null}
    </main>
  );
}
