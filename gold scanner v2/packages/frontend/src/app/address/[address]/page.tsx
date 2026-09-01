"use client";

import { use } from "react";
import { ApiStateView, useAsyncData } from "@/components/ApiStateView";
import { ContractReadWrite } from "@/components/ContractReadWrite";
import { JsonSection, TokenHoldingsTable, TxTable } from "@/components/DataViews";
import {
  fetchAddressBalance,
  fetchAddressInternalTxList,
  fetchAddressTokenBalances,
  fetchAddressTxList,
  fetchContractAbi,
  fetchContractSource,
} from "@/lib/api";

export default function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const balance = useAsyncData(() => fetchAddressBalance(address), [address]);
  const holdings = useAsyncData(() => fetchAddressTokenBalances(address), [address]);
  const txs = useAsyncData(() => fetchAddressTxList(address), [address]);
  const internals = useAsyncData(
    () => fetchAddressInternalTxList(address),
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
        <h2>Token holdings</h2>
        <ApiStateView
          state={
            holdings.state.kind === "ready"
              ? {
                  kind: "ready",
                  children: (
                    <TokenHoldingsTable holdings={holdings.data!} />
                  ),
                }
              : holdings.state
          }
          onRetry={holdings.retry}
          testId="address-holdings"
        />
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
