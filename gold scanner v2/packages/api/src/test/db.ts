import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://ubuntu@/goldscan_v2_test?host=/var/run/postgresql";

export const MIGRATION_COUNT = 6;

export function migrate(
  direction: "up" | "down",
  count = direction === "down" ? MIGRATION_COUNT : undefined,
): void {
  const args = ["node-pg-migrate", direction, "-m", "migrations"];
  if (direction === "down" && count !== undefined) {
    args.push(String(count));
  }

  execFileSync("npx", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL,
    },
    stdio: "pipe",
  });
}

export async function withPoolClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = createPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function withClient<T>(
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function resetDatabase(): Promise<void> {
  await withClient(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO public");
  });
}

export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: DATABASE_URL });
}
