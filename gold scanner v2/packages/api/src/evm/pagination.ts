export interface Pagination {
  page: number;
  offset: number;
  limit: number;
}

const DEFAULT_OFFSET = 10;
const MAX_OFFSET = 100;

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const offset = Math.min(
    MAX_OFFSET,
    Math.max(1, parseInt(searchParams.get("offset") ?? String(DEFAULT_OFFSET), 10) || DEFAULT_OFFSET),
  );
  return {
    page,
    offset,
    limit: offset,
  };
}

export function sqlLimitOffset(pagination: Pagination): { limit: number; offset: number } {
  return {
    limit: pagination.limit,
    offset: (pagination.page - 1) * pagination.limit,
  };
}
