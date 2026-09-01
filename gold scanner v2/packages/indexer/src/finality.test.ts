import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  finalityStatusForBlock,
  getConfirmationDepth,
} from "./finality.js";

const TEST_CONFIRMATION_DEPTH = "7";

describe("finality", () => {
  beforeEach(() => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = TEST_CONFIRMATION_DEPTH;
  });

  afterEach(() => {
    delete process.env.GOLDSCAN_CONFIRMATION_DEPTH;
  });

  it("exposes the configured confirmation depth from GOLDSCAN_CONFIRMATION_DEPTH", () => {
    assert.equal(getConfirmationDepth(), 7);
  });

  it("throws when GOLDSCAN_CONFIRMATION_DEPTH is missing", () => {
    delete process.env.GOLDSCAN_CONFIRMATION_DEPTH;

    assert.throws(
      () => getConfirmationDepth(),
      /GOLDSCAN_CONFIRMATION_DEPTH is required/,
    );
  });

  it("throws when GOLDSCAN_CONFIRMATION_DEPTH is invalid", () => {
    process.env.GOLDSCAN_CONFIRMATION_DEPTH = "not-a-number";

    assert.throws(
      () => getConfirmationDepth(),
      /GOLDSCAN_CONFIRMATION_DEPTH must be a non-negative integer/,
    );
  });

  it("returns pending when the block is within confirmation depth", () => {
    assert.equal(
      finalityStatusForBlock({ blockNumber: 100, headNumber: 106 }),
      "pending",
    );
  });

  it("returns finalized when the block is past confirmation depth", () => {
    assert.equal(
      finalityStatusForBlock({ blockNumber: 100, headNumber: 107 }),
      "finalized",
    );
  });

  it("returns reverted when the block was reorged", () => {
    assert.equal(
      finalityStatusForBlock({
        blockNumber: 100,
        headNumber: 200,
        reorged: true,
      }),
      "reverted",
    );
  });
});
