import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packageName } from "./index.js";

describe("api", () => {
  it("exports the package name", () => {
    assert.equal(packageName, "@goldscan/api");
  });
});
