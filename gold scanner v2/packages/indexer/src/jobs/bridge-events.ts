import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic, txHashFromBytes32 } from "../abi.js";
import {
  bridgeStateFromCode,
  directionFromCode,
  GOLD_BRIDGE_EVENT_TOPIC,
  isAmountExactForRoute,
  routeAssetFromCode,
  sourceLayerFromCode,
} from "../gold-topics.js";
import type { FinalityStatus } from "../finality.js";

const ZERO_TX_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function decodeBridgeLog(log: RpcLog, finalityStatus: FinalityStatus) {
  const correlationId = log.topics[1]!;
  const [
    routeCode,
    bridgeStateCode,
    directionCode,
    sourceLayerCode,
    amountExactWord,
    rootAmount,
    childAmount,
    rootTxWord,
    childTxWord,
  ] = abiDecodeStatic(log.data, 9);

  const routeAsset = routeAssetFromCode(Number(routeCode));
  const rootTxHash = txHashFromBytes32(rootTxWord);
  const childTxHash = txHashFromBytes32(childTxWord);
  const amountExact =
    amountExactWord === 1n
      ? true
      : amountExactWord === 0n
        ? false
        : isAmountExactForRoute(routeAsset, rootAmount, childAmount);

  return {
    routeAsset,
    rootAmount: rootAmount.toString(),
    childAmount: childAmount.toString(),
    bridgeState: bridgeStateFromCode(Number(bridgeStateCode)),
    finalityStatus,
    rootTxHash: rootTxHash === ZERO_TX_HASH ? null : rootTxHash,
    childTxHash: childTxHash === ZERO_TX_HASH ? null : childTxHash,
    direction: directionFromCode(Number(directionCode)),
    sourceLayer: sourceLayerFromCode(Number(sourceLayerCode)),
    receiptCorrelationId: correlationId,
    amountExact,
  };
}

export async function processBridgeEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== GOLD_BRIDGE_EVENT_TOPIC) {
      continue;
    }

    await writer.insertBridgeTransfer(decodeBridgeLog(log, finalityStatus));
  }
}
