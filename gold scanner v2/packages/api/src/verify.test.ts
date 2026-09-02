import assert from "node:assert/strict";
import { describe, it } from "node:test";
import solc from "solc";
import {
  bytecodeMatches,
  bundledSolcVersion,
  loadSolcCompiler,
  normalizeSolcVersion,
  VerifyError,
} from "./verify.js";

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
});

describe("bytecodeMatches", () => {
  it("rejects prefix match when bytecodes differ after stripMetadata", () => {
    const shorter = "0x608060405234801561001057600080fd5b50";
    const longer = `${shorter}60405161001a9061002a565b600080fd5b`;
    assert.equal(bytecodeMatches(shorter, longer), false);
    assert.equal(bytecodeMatches(longer, shorter), false);
  });
});
