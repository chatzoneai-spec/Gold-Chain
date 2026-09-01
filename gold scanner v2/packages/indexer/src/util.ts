export function hexToNumber(hex: string): number {
  return Number.parseInt(hex, 16);
}

export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

export function topicToAddress(topic: string): string {
  const normalized = topic.toLowerCase();
  if (!normalized.startsWith("0x") || normalized.length < 42) {
    throw new Error(`Invalid topic for address decode: ${topic}`);
  }
  return `0x${normalized.slice(-40)}`;
}

export function weiHexToDecimalString(hex: string): string {
  return hexToBigInt(hex).toString(10);
}

export function blockTimestampToDate(timestampHex: string): Date {
  return new Date(hexToNumber(timestampHex) * 1000);
}

export function traceAddressToString(traceAddress: number[] | undefined): string {
  if (!traceAddress || traceAddress.length === 0) {
    return "";
  }
  return traceAddress.join(",");
}
