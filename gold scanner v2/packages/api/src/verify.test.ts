import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import pg from "pg";
import solc from "solc";
import { migrate, DATABASE_URL, withPoolClient } from "./test/db.js";
import {
  bytecodeMatches,
  bundledSolcVersion,
  compileContract,
  handleVerify,
  loadSolcCompiler,
  normalizeSolcVersion,
  VerifyError,
} from "./verify.js";

const SLICE3_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13 <0.9.0;
contract Slice3Tiny {
    bytes4 constant SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    function selectorValue(address to, uint256 amount) external pure returns (bytes4) {
        return bytes4(SELECTOR);
    }
}`;

function remoteSolcVersion(bundled: string): string {
  if (bundled === "0.8.20") {
    return "0.8.25";
  }
  if (bundled === "0.8.25") {
    return "0.8.20";
  }
  return "0.8.25";
}

describe("verify compiler version enforcement", () => {
  it("normalizeSolcVersion extracts semver from claimed version", () => {
    assert.equal(normalizeSolcVersion("v0.8.20+commit.abc"), "0.8.20");
  });

  it("loadSolcCompiler uses bundled compiler when claimed version matches package", async () => {
    const compiler = await loadSolcCompiler(bundledSolcVersion());
    assert.equal(typeof compiler.compile, "function");
  });

  it("loadSolcCompiler rejects unavailable claimed versions", async () => {
    await assert.rejects(
      () =>
        loadSolcCompiler("0.7.6", (_version, callback) => {
          callback(new Error("not found"), undefined);
        }),
      (error: unknown) => {
        assert.ok(error instanceof VerifyError);
        assert.equal(error.message, "compiler_version_unavailable");
        return true;
      },
    );
  });

  it("loadSolcCompiler returns the remote compiler for the claimed version", async () => {
    const compiler = await loadSolcCompiler("0.8.20", (_version, callback) => {
      callback(undefined, solc);
    });
    assert.equal(typeof compiler.compile, "function");
  });

  it("compiling the same source under different solc versions produces different bytecode", async () => {
    const versionA = bundledSolcVersion();
    const versionB = remoteSolcVersion(versionA);

    const compiledA = await compileContract({
      address: "0x0000000000000000000000000000000000000001",
      source: SLICE3_SOURCE,
      compilerVersion: versionA,
    });
    const compiledB = await compileContract({
      address: "0x0000000000000000000000000000000000000001",
      source: SLICE3_SOURCE,
      compilerVersion: versionB,
    });

    assert.notEqual(compiledA.bytecode, compiledB.bytecode);

    const bytecodeA = compiledA.bytecode.toLowerCase();
    const bytecodeB = compiledB.bytecode.toLowerCase();
    assert.ok(
      !bytecodeA.startsWith(bytecodeB) && !bytecodeB.startsWith(bytecodeA),
      "bytecodes must not be prefixes of each other",
    );
  });
});

describe("handleVerify solc version mismatch", () => {
  let pool: pg.Pool;

  before(async () => {
    migrate("up");
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  after(async () => {
    await pool.end();
  });

  afterEach(async () => {
    await withPoolClient(async (client) => {
      await client.query(
        `TRUNCATE contracts, addresses RESTART IDENTITY CASCADE`,
      );
    });
  });

  it("rejects a version A claim against version B on-chain bytecode", async () => {
    const versionA = bundledSolcVersion();
    const versionB = remoteSolcVersion(versionA);
    const verifyAddress = "0x0000000000000000000000000000000000000f97";

    const onChain = await compileContract({
      address: verifyAddress,
      source: SLICE3_SOURCE,
      compilerVersion: versionB,
    });

    await withPoolClient(async (client) => {
      await client.query(
        `INSERT INTO addresses (address, gilt_balance) VALUES ($1, 0)`,
        [verifyAddress],
      );
      await client.query(
        `INSERT INTO contracts (address, bytecode, is_verified)
         VALUES ($1, $2, false)`,
        [verifyAddress, onChain.bytecode],
      );
    });

    const response = await handleVerify(pool, {
      address: verifyAddress,
      source: SLICE3_SOURCE,
      compilerVersion: versionA,
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "bytecode_mismatch" });

    const { rows } = await pool.query(
      `SELECT is_verified FROM contracts WHERE address = $1`,
      [verifyAddress],
    );
    assert.equal(rows[0]!.is_verified, false);
  });
});

describe("bytecodeMatches", () => {
  it("rejects prefix match when bytecodes differ after stripMetadata", () => {
    const shorter = "0x608060405234801561001057600080fd5b50";
    const longer = `${shorter}60405161001a9061002a565b600080fd5b`;
    assert.equal(bytecodeMatches(shorter, longer), false);
    assert.equal(bytecodeMatches(longer, shorter), false);
  });
});
