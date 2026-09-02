import type { IndexerWriter } from "../writer.js";
import type { RpcLog } from "../rpc/types.js";
import { abiDecodeStatic } from "../abi.js";
import {
  correlationFromAddress,
  EXITED_SCALED_ERC1155_TOPIC,
  GOLD_BRIDGE_EVENT_TOPICS,
  GOLD_REDEMPTION_REQUESTED_TOPIC,
  isAmountExactForRoute,
  LOCKED_SCALED_ERC1155_TOPIC,
  MIGRATION_MINT_TOPIC,
  routeAssetFromTokenId,
  topicMatches,
  XAUT_SCALE,
} from "../gold-topics.js";
import type { BridgeTransferRow } from "../writer-types.js";
import type { FinalityStatus } from "../finality.js";
import { topicToAddress } from "../util.js";

function bytes32ToCorrelation(word: bigint): string {
  return `0x${word.toString(16).padStart(64, "0")}`;
}

function decodeLockedScaled(
  log: RpcLog,
  finalityStatus: FinalityStatus,
): BridgeTransferRow {
  const [childTokenId, rootAmount, childAmount] = abiDecodeStatic(log.data, 3);
  const routeAsset = routeAssetFromTokenId(childTokenId);
  const amountExact = isAmountExactForRoute(routeAsset, rootAmount, childAmount);
  const depositReceiver = topicToAddress(log.topics[2]!);

  return {
    routeAsset,
    rootAmount: rootAmount.toString(),
    childAmount: childAmount.toString(),
    bridgeState: amountExact ? "locked" : "synced",
    finalityStatus,
    rootTxHash: log.transactionHash,
    childTxHash: null,
    direction: "deposit",
    sourceLayer: "ethereum",
    receiptCorrelationId: correlationFromAddress(depositReceiver),
    amountExact,
  };
}

function decodeMigrationMint(
  log: RpcLog,
  finalityStatus: FinalityStatus,
): BridgeTransferRow {
  const [amount, migrationRef] = abiDecodeStatic(log.data, 2);
  const tokenId = BigInt(log.topics[2]!);
  const routeAsset = routeAssetFromTokenId(tokenId);
  const childAmount = amount;
  const rootAmount =
    routeAsset === "paxg" ? amount : amount * XAUT_SCALE;

  return {
    routeAsset,
    rootAmount: rootAmount.toString(),
    childAmount: childAmount.toString(),
    bridgeState: "minted_or_credited",
    finalityStatus,
    rootTxHash: null,
    childTxHash: log.transactionHash,
    direction: "deposit",
    sourceLayer: "gold_chain",
    receiptCorrelationId: bytes32ToCorrelation(migrationRef),
    amountExact: isAmountExactForRoute(routeAsset, rootAmount, childAmount),
  };
}

function decodeGoldRedemptionRequested(
  log: RpcLog,
  finalityStatus: FinalityStatus,
): BridgeTransferRow {
  const [goldAmount, rootReleaseAmount] = abiDecodeStatic(log.data, 2);
  const tokenId = BigInt(log.topics[3]!);
  const routeAsset = routeAssetFromTokenId(tokenId);
  const recipient = topicToAddress(log.topics[2]!);

  return {
    routeAsset,
    rootAmount: rootReleaseAmount.toString(),
    childAmount: goldAmount.toString(),
    bridgeState: "burned_or_debited",
    finalityStatus,
    rootTxHash: null,
    childTxHash: log.transactionHash,
    direction: "exit",
    sourceLayer: "gold_chain",
    receiptCorrelationId: correlationFromAddress(recipient),
    amountExact: isAmountExactForRoute(routeAsset, rootReleaseAmount, goldAmount),
  };
}

function decodeExitedScaled(
  log: RpcLog,
  finalityStatus: FinalityStatus,
): BridgeTransferRow {
  const [childTokenId, childAmount, rootAmount] = abiDecodeStatic(log.data, 3);
  const routeAsset = routeAssetFromTokenId(childTokenId);
  const exitor = topicToAddress(log.topics[1]!);

  return {
    routeAsset,
    rootAmount: rootAmount.toString(),
    childAmount: childAmount.toString(),
    bridgeState: "released",
    finalityStatus,
    rootTxHash: log.transactionHash,
    childTxHash: null,
    direction: "exit",
    sourceLayer: "ethereum",
    receiptCorrelationId: correlationFromAddress(exitor),
    amountExact: isAmountExactForRoute(routeAsset, rootAmount, childAmount),
  };
}

function decodeBridgeLog(
  log: RpcLog,
  finalityStatus: FinalityStatus,
): BridgeTransferRow | null {
  const topic0 = log.topics[0]?.toLowerCase();
  if (!topic0) {
    return null;
  }

  switch (topic0) {
    case LOCKED_SCALED_ERC1155_TOPIC:
      return decodeLockedScaled(log, finalityStatus);
    case MIGRATION_MINT_TOPIC:
      return decodeMigrationMint(log, finalityStatus);
    case GOLD_REDEMPTION_REQUESTED_TOPIC:
      return decodeGoldRedemptionRequested(log, finalityStatus);
    case EXITED_SCALED_ERC1155_TOPIC:
      return decodeExitedScaled(log, finalityStatus);
    default:
      return null;
  }
}

export async function processBridgeEvents(
  writer: IndexerWriter,
  logs: RpcLog[],
  finalityStatus: FinalityStatus,
): Promise<void> {
  for (const log of logs) {
    if (!topicMatches(log.topics[0], GOLD_BRIDGE_EVENT_TOPICS)) {
      continue;
    }

    const row = decodeBridgeLog(log, finalityStatus);
    if (row) {
      await writer.insertBridgeTransfer(row);
    }
  }
}
