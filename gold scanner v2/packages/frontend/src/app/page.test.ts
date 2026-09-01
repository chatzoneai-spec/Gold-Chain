import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("frontend", () => {
  it("loads the app module", async () => {
    const page = await import("./page.js");
    assert.equal(typeof page.default, "function");
  });
});
