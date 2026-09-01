"use client";

import { useState } from "react";
import { postContractCall, postContractEncode } from "@/lib/api";
import { JsonBlock } from "./ui";

export function ContractReadWrite({ address }: { address: string }) {
  const [readSignature, setReadSignature] = useState("balanceOf(address)");
  const [readArgs, setReadArgs] = useState("");
  const [readResult, setReadResult] = useState<unknown>(null);
  const [readError, setReadError] = useState("");

  const [writeSignature, setWriteSignature] = useState("transfer(address,uint256)");
  const [writeArgs, setWriteArgs] = useState("");
  const [writeResult, setWriteResult] = useState<unknown>(null);
  const [writeError, setWriteError] = useState("");

  function parseArgs(raw: string): unknown[] {
    if (!raw.trim()) {
      return [];
    }
    return JSON.parse(raw) as unknown[];
  }

  async function handleRead(event: React.FormEvent) {
    event.preventDefault();
    setReadError("");
    setReadResult(null);
    try {
      const args = parseArgs(readArgs);
      const encoded = await postContractEncode({
        address,
        signature: readSignature,
        args,
      });
      const call = await postContractCall({
        address,
        data: encoded.data,
      });
      setReadResult({ encoded, call });
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Read failed");
    }
  }

  async function handleWrite(event: React.FormEvent) {
    event.preventDefault();
    setWriteError("");
    setWriteResult(null);
    try {
      const args = parseArgs(writeArgs);
      const encoded = await postContractEncode({
        address,
        signature: writeSignature,
        args,
      });
      setWriteResult({ to: encoded.to, data: encoded.data });
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : "Encode failed");
    }
  }

  return (
    <div data-testid="contract-read-write">
      <h3>Read contract</h3>
      <form className="form-field" onSubmit={(event) => void handleRead(event)}>
        <label htmlFor="read-fn">Function signature</label>
        <input
          id="read-fn"
          name="readFn"
          value={readSignature}
          onChange={(event) => setReadSignature(event.target.value)}
          placeholder="balanceOf(address)"
        />
        <label htmlFor="read-args">Args (JSON array)</label>
        <input
          id="read-args"
          name="readArgs"
          value={readArgs}
          onChange={(event) => setReadArgs(event.target.value)}
          placeholder='["0xabc..."]'
        />
        <div className="form-actions">
          <button type="submit">Call via API</button>
        </div>
      </form>
      {readError ? <p className="error-text">{readError}</p> : null}
      {readResult ? <JsonBlock value={readResult} /> : null}

      <h3>Write (encode only)</h3>
      <form className="form-field" onSubmit={(event) => void handleWrite(event)}>
        <label htmlFor="write-fn">Function signature</label>
        <input
          id="write-fn"
          name="writeFn"
          value={writeSignature}
          onChange={(event) => setWriteSignature(event.target.value)}
          placeholder="transfer(address,uint256)"
        />
        <label htmlFor="write-args">Args (JSON array)</label>
        <input
          id="write-args"
          name="writeArgs"
          value={writeArgs}
          onChange={(event) => setWriteArgs(event.target.value)}
          placeholder='["0xabc...", "1000"]'
        />
        <div className="form-actions">
          <button type="submit">Encode transaction</button>
        </div>
      </form>
      {writeError ? <p className="error-text">{writeError}</p> : null}
      {writeResult ? <JsonBlock value={writeResult} /> : null}
    </div>
  );
}
