"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { JsonSection, TxTable } from "@/components/DataViews";
import {
  fetchAddressBalance,
  fetchAddressInternalTxList,
  fetchAddressTokenTx,
  fetchAddressTxList,
  fetchContractAbi,
  fetchContractSource,
} from "@/lib/api";
import { GOLD_CONTRACT } from "@/lib/types";

export default function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const balance = useAsyncData(() => fetchAddressBalance(address), [address]);
  const txs = useAsyncData(() => fetchAddressTxList(address), [address]);
  const internals = useAsyncData(
    () => fetchAddressInternalTxList(address),
    [address],
  );
  const erc20 = useAsyncData(
    () => fetchAddressTokenTx(address, "tokentx"),
    [address],
  );
  const erc1155 = useAsyncData(
    () => fetchAddressTokenTx(address, "token1155tx", GOLD_CONTRACT),
    [address],
  );
  const contract = useAsyncData(async () => {
    try {
      const [abi, source] = await Promise.all([
        fetchContractAbi(address),
        fetchContractSource(address),
      ]);
      return { abi, source };
    } catch {
      return null;
    }
  }, [address]);

  return (
    <main className="page">
      <h1>Address</h1>
      <p className="muted">{address}</p>

      <section className="card">
        <h2>GILT balance</h2>
        <ApiStateView
          state={
            balance.state.kind === "ready"
              ? { kind: "ready", children: <strong>{balance.data}</strong> }
              : balance.state
          }
          onRetry={balance.retry}
        />
      </section>

      <section className="card">
        <h2>Token holdings — GOLD per ID</h2>
        <div className="gold-id-section" data-testid="address-gold-id-1">
          <h3>GOLD ID 1</h3>
          <ApiStateView
            state={
              erc1155.state.kind === "ready"
                ? {
                    kind: "ready",
                    children: (
                      <pre className="json-block">
                        {JSON.stringify(
                          (erc1155.data ?? []).filter((row) => row.tokenID === "1"),
                          null,
                          2,
                        )}
                      </pre>
                    ),
                  }
                : erc1155.state
            }
            onRetry={erc1155.retry}
          />
        </div>
        <div className="gold-id-section" data-testid="address-gold-id-2">
          <h3>GOLD ID 2</h3>
          <ApiStateView
            state={
              erc1155.state.kind === "ready"
                ? {
                    kind: "ready",
                    children: (
                      <pre className="json-block">
                        {JSON.stringify(
                          (erc1155.data ?? []).filter((row) => row.tokenID === "2"),
                          null,
                          2,
                        )}
                      </pre>
                    ),
                  }
                : erc1155.state
            }
            onRetry={erc1155.retry}
          />
        </div>
        <JsonSection title="ERC-20 transfers" value={erc20.data} />
      </section>

      <section className="card">
        <h2>Transaction history</h2>
        <ApiStateView
          state={
            txs.state.kind === "ready"
              ? { kind: "ready", children: <TxTable txs={txs.data!} /> }
              : txs.state
          }
          onRetry={txs.retry}
        />
      </section>

      <JsonSection title="Internal transactions" value={internals.data} />

      {contract.data ? (
        <section className="card">
          <h2>Verified contract</h2>
          <JsonSection title="ABI" value={contract.data.abi} />
          <JsonSection title="Source" value={contract.data.source} />
          <ContractReadWrite address={address} />
        </section>
      ) : null}
    </main>
  );
}

function ContractReadWrite({ address }: { address: string }) {
  return (
    <div>
      <h3>Read / Write (mocked)</h3>
      <form
        className="form-field"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="read-fn">Read function</label>
        <input id="read-fn" name="readFn" placeholder="balanceOf(address)" />
        <div className="form-actions">
          <button type="submit">Simulate read</button>
        </div>
      </form>
      <form
        className="form-field"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="write-fn">Write function</label>
        <input id="write-fn" name="writeFn" placeholder="transfer(address,uint256)" />
        <div className="form-actions">
          <button type="submit">Simulate write</button>
        </div>
      </form>
      <p className="muted">API is read-only; forms are presentation-only.</p>
      <input type="hidden" value={address} readOnly />
    </div>
  );
}
