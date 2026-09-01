import type { IndexerWriter } from "../writer.js";
import type { RpcClient, RpcTrace } from "../rpc/types.js";
import { traceAddressToString, weiHexToDecimalString } from "../util.js";
import type { FinalityStatus } from "../finality.js";

function flattenTraces(
  traces: RpcTrace[],
  parentAddress: number[] = [],
): Array<RpcTrace & { traceAddress: number[] }> {
  const flattened: Array<RpcTrace & { traceAddress: number[] }> = [];

  for (let index = 0; index < traces.length; index += 1) {
    const trace = traces[index]!;
    const traceAddress = trace.traceAddress ?? [...parentAddress, index];
    flattened.push({ ...trace, traceAddress });

    if (trace.calls) {
      flattened.push(...flattenTraces(trace.calls, traceAddress));
    }
  }

  return flattened;
}

export async function processInternalTxs(
  rpc: RpcClient,
  writer: IndexerWriter,
  txHash: string,
  blockNumber: number,
  finalityStatus: FinalityStatus,
): Promise<void> {
  const traces = await rpc.getTransactionTraces(txHash);
  const flattened = flattenTraces(traces);

  for (const trace of flattened) {
    if (!trace.from) {
      continue;
    }

    await writer.upsertInternalTx({
      transactionHash: txHash,
      blockNumber,
      fromAddress: trace.from,
      toAddress: trace.to ?? null,
      value: trace.value ? weiHexToDecimalString(trace.value) : "0",
      type: trace.type ?? null,
      traceAddress: traceAddressToString(trace.traceAddress),
      error: trace.error ?? null,
      finalityStatus,
    });
  }
}
