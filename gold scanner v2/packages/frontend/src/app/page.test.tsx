import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiStateView } from "../components/ApiStateView.js";
import { GoldIdSections } from "../components/GoldIdSections.js";
import { SolvencyHero } from "../components/SolvencyHero.js";
import type { SolvencyResult } from "../lib/types.js";

const MOCK_SOLVENCY: SolvencyResult = {
  paxg: {
    routeAsset: "paxg",
    goldTokenId: "1",
    lockedOnEthereum: "1000",
    goldSupply: "1150",
  },
  xaut: {
    routeAsset: "xaut",
    goldTokenId: "2",
    lockedOnEthereum: "4000000000001",
    goldSupply: "12",
  },
};

describe("SolvencyHero", () => {
  it("renders per-asset sections with finality for PAXG and XAUT", () => {
    const html = renderToStaticMarkup(<SolvencyHero data={MOCK_SOLVENCY} />);
    assert.match(html, /solvency-hero/);
    assert.match(html, /solvency-asset-1/);
    assert.match(html, /solvency-asset-2/);
    assert.match(html, /PAXG/);
    assert.match(html, /XAUT/);
    assert.match(html, /GOLD token ID 1/);
    assert.match(html, /GOLD token ID 2/);
    assert.match(html, /finalized/);
    assert.match(html, /lockedOnEthereum/);
    assert.match(html, /1000/);
    assert.match(html, /"goldSupply": "12"|&quot;goldSupply&quot;: &quot;12&quot;/);
    assert.ok(!html.includes("combinedTotal"));
  });
});

describe("GoldIdSections", () => {
  it("shows GOLD ID 1 and ID 2 as distinct sections", () => {
    const html = renderToStaticMarkup(<GoldIdSections solvency={MOCK_SOLVENCY} />);
    assert.match(html, /gold-id-1/);
    assert.match(html, /gold-id-2/);
    assert.match(html, /ID 1 \(PAXG route\)/);
    assert.match(html, /ID 2 \(XAUT route\)/);
    assert.match(html, /goldTokenId/);
    assert.match(html, /&quot;1&quot;/);
    assert.match(html, /&quot;2&quot;/);
    assert.ok(html.indexOf("gold-id-1") < html.indexOf("gold-id-2"));
  });
});

describe("home page states", () => {
  it("renders loading state", () => {
    const html = renderToStaticMarkup(
      <ApiStateView state={{ kind: "loading" }} testId="home-solvency" />,
    );
    assert.match(html, /home-solvency-loading/);
    assert.match(html, /Loading/);
  });

  it("renders empty state", () => {
    const html = renderToStaticMarkup(
      <ApiStateView state={{ kind: "empty", message: "No solvency data" }} testId="home-solvency" />,
    );
    assert.match(html, /home-solvency-empty/);
    assert.match(html, /No solvency data/);
  });

  it("renders error state with retry", () => {
    const html = renderToStaticMarkup(
      <ApiStateView
        state={{ kind: "error", message: "Network error" }}
        onRetry={() => {}}
        testId="home-solvency"
      />,
    );
    assert.match(html, /home-solvency-error/);
    assert.match(html, /Network error/);
    assert.match(html, /home-solvency-retry/);
    assert.match(html, /Retry/);
  });

  it("renders ready state with solvency hero", () => {
    const html = renderToStaticMarkup(
      <ApiStateView
        state={{
          kind: "ready",
          children: <SolvencyHero data={MOCK_SOLVENCY} />,
        }}
        testId="home-solvency"
      />,
    );
    assert.match(html, /home-solvency-ready/);
    assert.match(html, /solvency-hero/);
  });
});

describe("bridge page states", () => {
  it("renders loading state", () => {
    const html = renderToStaticMarkup(
      <ApiStateView state={{ kind: "loading" }} testId="bridge-page" />,
    );
    assert.match(html, /bridge-page-loading/);
  });

  it("renders error state with retry", () => {
    const html = renderToStaticMarkup(
      <ApiStateView
        state={{ kind: "error", message: "Bridge API failed" }}
        onRetry={() => {}}
        testId="bridge-page"
      />,
    );
    assert.match(html, /bridge-page-error/);
    assert.match(html, /bridge-page-retry/);
  });
});

describe("frontend app module", () => {
  it("loads the home page module", async () => {
    const page = await import("../app/page.js");
    assert.equal(typeof page.default, "function");
  });
});
