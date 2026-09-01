export const MAX_QUERY_BYTES = 4096;

const HEX_ADDRESS = /^0x[0-9a-f]{40}$/;
const INVALID_HEX_BODY = /[^0-9a-f]/;

export function isOversizedQuery(url: URL): boolean {
  return url.search.length > MAX_QUERY_BYTES;
}

export function isHexAddress(value: string): boolean {
  return HEX_ADDRESS.test(value.toLowerCase());
}

export function isHexHash(value: string): boolean {
  const trimmed = value.toLowerCase();
  return (
    trimmed.startsWith("0x") &&
    trimmed.length > 2 &&
    !INVALID_HEX_BODY.test(trimmed.slice(2))
  );
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireHexAddress(
  value: string | null | undefined,
  label: string,
): string {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    throw new ValidationError(`Missing ${label}`);
  }
  if (!isHexAddress(trimmed)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return trimmed;
}

export function requireHexHash(
  value: string | null | undefined,
  label: string,
): string {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    throw new ValidationError(`Missing ${label}`);
  }
  if (!trimmed.startsWith("0x") || trimmed.length < 3) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return trimmed;
}
