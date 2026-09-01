import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createApp } from "./http.js";
import { seedApiFixture } from "./test/seed.js";
import {
  createPool,
  migrate,
  resetDatabase,
} from "./test/db.js";

const apiSrcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
);

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "test") {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts") && !fullPath.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function request(
  port: number,
  method: string,
  target: string,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${target}`, { method });
  const body = await response.text();
  return { status: response.status, body };
}

describe("api security", () => {
  let pool: pg.Pool;
  let port: number;
  let app: ReturnType<typeof createApp>;

  before(async () => {
    await resetDatabase();
    migrate("up");
    pool = createPool();
  });

  after(async () => {
    await pool.end();
    await resetDatabase();
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `TRUNCATE token_transfers, token_balances, internal_txs, logs, receipts,
                transactions, token_contracts, contracts, addresses, blocks CASCADE`,
      );
      await seedApiFixture(client);
    } finally {
      client.release();
    }

    app = createApp({ pool });
    await new Promise<void>((resolve) => {
      app.server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      app.server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("rejects non-GET requests to /api with 405", async () => {
    const { status, body } = await request(
      port,
      "POST",
      "/api?module=account&action=balance&address=0x0000000000000000000000000000000000000a01",
    );
    assert.equal(status, 405);
    assert.match(body, /Method Not Allowed/);
  });

  it("rejects non-GET requests to gold paths with 405", async () => {
    const { status, body } = await request(port, "POST", "/gold/solvency");
    assert.equal(status, 405);
    assert.match(body, /method_not_allowed/);
  });

  it("rejects POST /verify with 405", async () => {
    const { status, body } = await request(port, "POST", "/verify");
    assert.equal(status, 405);
    assert.match(body, /method_not_allowed/);
  });

  it("returns 400 for bad hex address without 500", async () => {
    const { status, body } = await request(
      port,
      "GET",
      "/api?module=account&action=balance&address=NOT_HEX",
    );
    assert.equal(status, 400);
    assert.match(body, /Invalid address/);
    assert.doesNotMatch(body, /stack|at /i);
  });

  it("returns 400 for bad tx hash without 500", async () => {
    const { status, body } = await request(
      port,
      "GET",
      "/api?module=transaction&action=gettxreceiptstatus&txhash=bad",
    );
    assert.equal(status, 400);
    assert.match(body, /Invalid txhash/);
    assert.doesNotMatch(body, /stack|at /i);
  });

  it("returns NOTOK for unknown module without 500", async () => {
    const { status, body } = await request(
      port,
      "GET",
      "/api?module=nope&action=balance",
    );
    assert.equal(status, 200);
    assert.match(body, /Unknown module: nope/);
    assert.doesNotMatch(body, /stack|at /i);
  });

  it("returns 404 for unknown gold route without 500", async () => {
    const { status, body } = await request(port, "GET", "/gold/unknown-route");
    assert.equal(status, 404);
    assert.match(body, /Not found/);
    assert.doesNotMatch(body, /stack|at /i);
  });

  it("returns 400 for oversized query without 500", async () => {
    const huge = "0x" + "a".repeat(5000);
    const { status, body } = await request(
      port,
      "GET",
      `/api?module=account&action=balance&address=${huge}`,
    );
    assert.equal(status, 400);
    assert.match(body, /too large/i);
    assert.doesNotMatch(body, /stack|at /i);
  });

  it("request handlers do not log DATABASE_URL or passwords", () => {
    const handlerFiles = collectSourceFiles(apiSrcDir);
    assert.ok(handlerFiles.length > 0);

    for (const file of handlerFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /console\.(log|info|warn|error|debug)\([^)]*DATABASE_URL/,
        `${file} must not log DATABASE_URL`,
      );
      assert.doesNotMatch(
        source,
        /console\.(log|info|warn|error|debug)\([^)]*password/i,
        `${file} must not log passwords`,
      );
    }
  });

  it("request handlers do not INSERT chain-derived rows", () => {
    const handlerFiles = collectSourceFiles(apiSrcDir);
    for (const file of handlerFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bINSERT\s+INTO\s+(blocks|transactions|token_transfers|bridge_transfers|gold_supply)\b/i,
        `${file} must not INSERT chain-derived rows`,
      );
    }
  });
});
