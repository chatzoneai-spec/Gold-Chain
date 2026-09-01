export function abiEncodeStatic(words: bigint[]): string {
  const body = words.map((word) => word.toString(16).padStart(64, "0")).join("");
  return `0x${body}`;
}

export function abiDecodeStatic(data: string, wordCount: number): bigint[] {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const words: bigint[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    const start = index * 64;
    const slice = hex.slice(start, start + 64);
    words.push(slice.length === 0 ? 0n : BigInt(`0x${slice || "0"}`));
  }
  return words;
}

export function abiDecodeUint256Array(data: string, arrayIndex: number): bigint[] {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const offsetWord = BigInt(`0x${hex.slice(arrayIndex * 64, (arrayIndex + 1) * 64)}`);
  const offset = Number(offsetWord / 32n);
  const length = Number(BigInt(`0x${hex.slice(offset * 64, (offset + 1) * 64)}`));
  const values: bigint[] = [];
  for (let index = 0; index < length; index += 1) {
    const start = (offset + 1 + index) * 64;
    values.push(BigInt(`0x${hex.slice(start, start + 64)}`));
  }
  return values;
}

export function bytes32FromTxHash(txHash: string): bigint {
  const normalized = txHash.toLowerCase().replace(/^0x/, "");
  return BigInt(`0x${normalized.padStart(64, "0").slice(-64)}`);
}

export function txHashFromBytes32(word: bigint): string {
  return `0x${word.toString(16).padStart(64, "0").slice(-64)}`;
}
