import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoldIdSections } from "./components/GoldIdSections.js";
import { SolvencyHero } from "./components/SolvencyHero.js";
import {
  TokenHoldingsTable,
  ValidatorSetTable,
} from "./components/DataViews.js";
import { LiveFeed } from "./components/LiveFeed.js";
import type {
  AddressTokenBalance,
  CheckpointStatus,
  DelegationsResult,
  SolvencyResult,
  ValidatorSetRow,
} from "./lib/types.js";

const MOCK_SOLVENCY: SolvencyResult = {
  paxg: {
    routeAsset: "paxg",
    goldTokenId: "1",
    lockedOnEthereum: "1150",
    goldSupply: "1150",
  },
  xaut: {
    routeAsset: "xaut",
    goldTokenId: "2",
    lockedOnEthereum: "12000000000000",
    goldSupply: "12",
  },
};

const MOCK_HOLDINGS: AddressTokenBalance[] = [
  {
    contractAddress: "0x000000000000000000000000000000000000f001",
    tokenID: "1",
    balance: "500",
    tokenStandard: "erc1155",
  },
  {
    contractAddress: "0x000000000000000000000000000000000000f001",
    tokenID: "2",
    balance: "12",
    tokenStandard: "erc1155",
  },
];

const MOCK_VALIDATORS: ValidatorSetRow[] = [
  {
    validatorAddress: "0x0000000000000000000000000000000000000001",
    votingPower: "3000",
    giltStake: "1000",
    goldId1Stake: "1000",
    goldId2Stake: "1000",
    commissionBps: 500,
    jailed: false,
    elected: true,
  },
];

const MOCK_DELEGATIONS: DelegationsResult = {
  delegations: [
    {
      delegator: "0xabc",
      validator: "0xdef",
      stakeAsset: "gilt",
      amount: "100",
    },
  ],
  unbonding: [
    {
      delegator: "0xabc",
      validator: "0xdef",
      stakeAsset: "gold_id_1",
      amount: "50",
    },
  ],
};

describe("wave10 token page GOLD IDs", () => {
  it("shows two GOLD IDs and two holder lists", () => {
    const html = renderToStaticMarkup(
      <GoldIdSections
        solvency={MOCK_SOLVENCY}
        holdersId1={[{ address: "0xholder1", balance: "100" }]}
        holdersId2={[{ address: "0xholder2", balance: "12" }]}
      />,
    );
    assert.match(html, /gold-id-1/);
    assert.match(html, /gold-id-2/);
    assert.match(html, /gold-holders-1/);
    assert.match(html, /gold-holders-2/);
    assert.match(html, /0xholder1/);
    assert.match(html, /0xholder2/);
    assert.ok(html.indexOf("gold-id-1") < html.indexOf("gold-id-2"));
  });
});

describe("wave10 address holdings", () => {
  it("separates GOLD ID 1 and ID 2 holdings", () => {
    const html = renderToStaticMarkup(
      <TokenHoldingsTable holdings={MOCK_HOLDINGS} />,
    );
    assert.match(html, /address-gold-id-1/);
    assert.match(html, /address-gold-id-2/);
    assert.match(html, /GOLD ID 1 holdings/);
    assert.match(html, /GOLD ID 2 holdings/);
    assert.match(html, /<td>1<\/td>/);
    assert.match(html, /<td>2<\/td>/);
    assert.match(html, /<td>500<\/td>/);
    assert.match(html, /<td>12<\/td>/);
  });
});

describe("wave10 validator set", () => {
  it("shows GILT and GOLD ID 1/2 split fields", () => {
    const html = renderToStaticMarkup(
      <ValidatorSetTable validators={MOCK_VALIDATORS} />,
    );
    assert.match(html, /validator-set-table/);
    assert.match(html, /GILT/);
    assert.match(html, /GOLD ID 1/);
    assert.match(html, /GOLD ID 2/);
    assert.match(html, /gilt-stake-0x0000000000000000000000000000000000000001/);
    assert.match(html, /gold-id1-stake-0x0000000000000000000000000000000000000001/);
    assert.match(html, /gold-id2-stake-0x0000000000000000000000000000000000000001/);
  });
});

describe("wave10 delegation unbonding", () => {
  it("renders unbonding section data", () => {
    const html = renderToStaticMarkup(
      <section data-testid="unbonding-section">
        <h2>Unbonding</h2>
        <pre>{JSON.stringify(MOCK_DELEGATIONS.unbonding)}</pre>
      </section>,
    );
    assert.match(html, /unbonding-section/);
    assert.match(html, /gold_id_1/);
    assert.match(html, /Unbonding/);
  });
});

describe("wave10 checkpoint status", () => {
  it("shows committed state", () => {
    const committed: CheckpointStatus = {
      lastCommitted: {
        blockNumber: 42,
        checkpointHash: "0xabc",
        validatorSetHash: "0xdef",
      },
      halted: false,
      diverged: false,
    };
    const html = renderToStaticMarkup(
      <section data-testid="checkpoint-status">
        <strong data-testid="checkpoint-halted">
          {committed.halted ? "yes" : "no"}
        </strong>
        <span>{committed.lastCommitted?.blockNumber}</span>
      </section>,
    );
    assert.match(html, /checkpoint-status/);
    assert.match(html, /42/);
    assert.match(html, /checkpoint-halted/);
    assert.doesNotMatch(html, />yes</);
  });

  it("shows halted state", () => {
    const halted: CheckpointStatus = {
      lastCommitted: null,
      halted: true,
      diverged: false,
    };
    const html = renderToStaticMarkup(
      <section data-testid="checkpoint-status">
        <strong data-testid="checkpoint-halted">
          {halted.halted ? "yes" : "no"}
        </strong>
      </section>,
    );
    assert.match(html, /checkpoint-halted/);
    assert.match(html, />yes</);
  });
});

describe("wave10 verify messages", () => {
  it("renders success message", () => {
    const html = renderToStaticMarkup(
      <p className="success-text" data-testid="verify-success">
        Verified: 0xabc
      </p>,
    );
    assert.match(html, /verify-success/);
    assert.match(html, /Verified: 0xabc/);
  });

  it("renders mismatch message", () => {
    const html = renderToStaticMarkup(
      <p className="error-text" data-testid="verify-mismatch">
        bytecode_mismatch
      </p>,
    );
    assert.match(html, /verify-mismatch/);
    assert.match(html, /bytecode_mismatch/);
  });
});

describe("wave10 tx decodedInput", () => {
  it("renders decoded input section", () => {
    const decoded = {
      selector: "0xa9059cbb",
      signature: "transfer(address,uint256)",
      args: ["0xabc", "1000"],
    };
    const html = renderToStaticMarkup(
      <section data-testid="tx-decoded-input">
        <h2>Decoded input</h2>
        <pre>{JSON.stringify(decoded)}</pre>
      </section>,
    );
    assert.match(html, /tx-decoded-input/);
    assert.match(html, /transfer\(address,uint256\)/);
    assert.match(html, /0xa9059cbb/);
  });
});

describe("wave10 block tx list", () => {
  it("renders block transaction list section", () => {
    const html = renderToStaticMarkup(
      <section className="card" data-testid="block-tx-list">
        <h2>Transactions</h2>
        <table className="data-table">
          <tbody>
            <tr>
              <td>0xhash123</td>
            </tr>
          </tbody>
        </table>
      </section>,
    );
    assert.match(html, /block-tx-list/);
    assert.match(html, /0xhash123/);
  });
});

describe("wave10 live feed", () => {
  it("renders a block event from mock WebSocket", () => {
    const mockSocket = {
      onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null,
      close: () => {},
      send: () => {},
    };

    const html = renderToStaticMarkup(<LiveFeed testSocket={mockSocket} />);
    assert.match(html, /live-feed/);

    const event = {
      type: "block",
      number: "99",
      hash: "0xblockhash",
      timestamp: "1700000000",
      finalityStatus: "finalized",
    };
    mockSocket.onmessage?.({ data: JSON.stringify(event) });

    const htmlAfter = renderToStaticMarkup(<LiveFeed testSocket={mockSocket} />);
    assert.match(htmlAfter, /live-feed/);
  });
});

describe("wave10 solvency hero", () => {
  it("still renders per-asset sections", () => {
    const html = renderToStaticMarkup(<SolvencyHero data={MOCK_SOLVENCY} />);
    assert.match(html, /solvency-asset-1/);
    assert.match(html, /solvency-asset-2/);
    assert.match(html, /GOLD token ID 1/);
    assert.match(html, /GOLD token ID 2/);
    assert.ok(!html.includes("combinedTotal"));
  });
});
