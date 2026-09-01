export type EtherscanResult = unknown;

export interface EtherscanResponse {
  status: "0" | "1";
  message: string;
  result: EtherscanResult;
}

export function ok(result: EtherscanResult, message = "OK"): EtherscanResponse {
  return { status: "1", message, result };
}

export function empty(message: string): EtherscanResponse {
  return { status: "1", message, result: [] };
}

export function notOk(message: string, result: EtherscanResult = message): EtherscanResponse {
  return { status: "0", message: "NOTOK", result };
}

export function toJson(response: EtherscanResponse): string {
  return JSON.stringify(response);
}
