import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abiEncodeStatic } from "../src/abi.ts";
import {
  COMMITMENT_PLANTED_TOPIC,
  COMMITMENT_UPDATED_TOPIC,
  correlationFromAddress,
  DELEGATED_TOPIC,
  EXITED_SCALED_ERC1155_TOPIC,
  GOLD_REDEMPTION_REQUESTED_TOPIC,
  LOCKED_SCALED_ERC1155_TOPIC,
  MIGRATION_MINT_TOPIC,
  PROPOSAL_CREATED_TOPIC,
  TOKEN_B1155_DELEGATED_TOPIC,
  TRANSFER_BATCH_TOPIC,
  TRANSFER_SINGLE_TOPIC,
  VALIDATOR_CREATED_TOPIC,
  COMMISSION_RATE_EDITED_TOPIC,
} from "../src/gold-topics.ts";

const GOLD = "0x000000000000000000000000000000000000f001";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";
const USER_C = "0x0000000000000000000000000000000000000c01";
const OPERATOR = "0x0000000000000000000000000000000000000d01";
const ZERO = "0x0000000000000000000000000000000000000000";
const ROOT_TOKEN_PAXG = "0x000000000000000000000000000000000000e101";
const ROOT_TOKEN_XAUT = "0x000000000000000000000000000000000000e102";

function padAddress(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function correlationAddress(correlation: string): string {
  return `0x${correlation.slice(2).padStart(40, "0").slice(-40)}`;
}

function encodeBatch(ids: bigint[], values: bigint[]): string {
  const idsBody = [BigInt(ids.length), ...ids];
  const valuesOffset = 64 + 32 * idsBody.length;
  const valuesBody = [BigInt(values.length), ...values];
  return abiEncodeStatic([
    64n,
    BigInt(valuesOffset),
    ...idsBody,
    ...valuesBody,
  ]);
}

function encodeProposalCreated(proposalId: bigint, proposer: string): string {
  const base = 9 * 32;
  const proposerWord = BigInt(padAddress(proposer));
  return abiEncodeStatic([
    proposalId,
    proposerWord,
    BigInt(base),
    BigInt(base + 32),
    BigInt(base + 64),
    BigInt(base + 96),
    0n,
    0n,
    BigInt(base + 128),
    0n,
    0n,
    0n,
    0n,
    0n,
  ]);
}

function singleLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  from: string,
  to: string,
  id: bigint,
  value: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      TRANSFER_SINGLE_TOPIC,
      padAddress(OPERATOR),
      padAddress(from),
      padAddress(to),
    ],
    data: abiEncodeStatic([id, value]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function batchLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  from: string,
  to: string,
  ids: bigint[],
  values: bigint[],
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      TRANSFER_BATCH_TOPIC,
      padAddress(OPERATOR),
      padAddress(from),
      padAddress(to),
    ],
    data: encodeBatch(ids, values),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function lockedScaledLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  depositor: string,
  correlation: string,
  rootToken: string,
  childTokenId: bigint,
  rootAmount: bigint,
  childAmount: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      LOCKED_SCALED_ERC1155_TOPIC,
      padAddress(depositor),
      padAddress(correlationAddress(correlation)),
      padAddress(rootToken),
    ],
    data: abiEncodeStatic([childTokenId, rootAmount, childAmount]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function migrationMintLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  account: string,
  tokenId: bigint,
  amount: bigint,
  migrationRef: string,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      MIGRATION_MINT_TOPIC,
      padAddress(account),
      `0x${tokenId.toString(16).padStart(64, "0")}`,
    ],
    data: abiEncodeStatic([amount, BigInt(migrationRef)]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function goldRedemptionRequestedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  redeemer: string,
  correlation: string,
  tokenId: bigint,
  goldAmount: bigint,
  rootReleaseAmount: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      GOLD_REDEMPTION_REQUESTED_TOPIC,
      padAddress(redeemer),
      padAddress(correlationAddress(correlation)),
      `0x${tokenId.toString(16).padStart(64, "0")}`,
    ],
    data: abiEncodeStatic([goldAmount, rootReleaseAmount]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function exitedScaledLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  correlation: string,
  rootToken: string,
  childTokenId: bigint,
  childAmount: bigint,
  rootAmount: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      EXITED_SCALED_ERC1155_TOPIC,
      padAddress(correlationAddress(correlation)),
      padAddress(rootToken),
    ],
    data: abiEncodeStatic([childTokenId, childAmount, rootAmount]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

const TX = {
  b1: "0x2000000000000000000000000000000000000000000000000000000000000001",
  b2: "0x2000000000000000000000000000000000000000000000000000000000000002",
  b3: "0x2000000000000000000000000000000000000000000000000000000000000003",
  b4: "0x2000000000000000000000000000000000000000000000000000000000000004",
  b5a: "0x2000000000000000000000000000000000000000000000000000000000000005",
  b5b: "0x2000000000000000000000000000000000000000000000000000000000000006",
  b6a: "0x2000000000000000000000000000000000000000000000000000000000000007",
  b6b: "0x2000000000000000000000000000000000000000000000000000000000000008",
  b6c: "0x2000000000000000000000000000000000000000000000000000000000000009",
  b6d: "0x200000000000000000000000000000000000000000000000000000000000000a",
  b6e: "0x200000000000000000000000000000000000000000000000000000000000000b",
  b6f: "0x200000000000000000000000000000000000000000000000000000000000000c",
  b8a: "0x200000000000000000000000000000000000000000000000000000000000000d",
  b8b: "0x200000000000000000000000000000000000000000000000000000000000000e",
};

/** 160-bit-safe correlation ids that round-trip through indexed address topics. */
export const CORR = {
  paxg: correlationFromAddress(
    "0x000000000000000000000000c0000000000000000000000000000000000001",
  ),
  xaut: correlationFromAddress(
    "0x000000000000000000000000c0000000000000000000000000000000000002",
  ),
  xautBad: correlationFromAddress(
    "0x000000000000000000000000c0000000000000000000000000000000000003",
  ),
  redeem: correlationFromAddress(
    "0x000000000000000000000000c0000000000000000000000000000000000004",
  ),
  pending: correlationFromAddress(
    "0x000000000000000000000000c0000000000000000000000000000000000005",
  ),
};

const PROPOSAL_ID = BigInt(
  "0xc1000000000000000000000000000000000000000000000000000000000001",
);

const PAXG_LOCKED_ROOT = 1150n;
const PAXG_BRIDGE_CHILD = 1000n;
const XAUT_GOLD_SUPPLY = 12n;
const XAUT_LOCKED_ROOT = XAUT_GOLD_SUPPLY * 1_000_000_000_000n;
const XAUT_BAD_ROOT = XAUT_LOCKED_ROOT + 1n;

function block(
  number: number,
  txs: Array<{ hash: string; logs: ReturnType<typeof singleLog>[] }>,
) {
  const parent =
    number === 1
      ? "0xgenesis0000000000000000000000000000000000000000000000000000000000"
      : `0xblock${String(number - 1).padStart(60, "0")}`;
  return {
    number: `0x${number.toString(16)}`,
    hash: `0xblock${String(number).padStart(60, "0")}`,
    parentHash: parent,
    timestamp: `0x65b000${number.toString(16).padStart(2, "0")}`,
    miner: "0x0000000000000000000000000000000000000001",
    gasUsed: "0x5208",
    gasLimit: "0x1c9c380",
    transactions: txs.map((tx, index) => ({
      hash: tx.hash,
      blockNumber: `0x${number.toString(16)}`,
      from: USER_A,
      to: GOLD,
      value: "0x0",
      gas: "0x5208",
      gasPrice: "0x3b9aca00",
      input: "0x",
      nonce: `0x${index.toString(16)}`,
      transactionIndex: `0x${index.toString(16)}`,
    })),
  };
}

function receipt(txHash: string, blockNumber: number, logs: object[]) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    contractAddress: null,
    status: "0x1",
    logsBloom: "0x00",
    logs,
  };
}

const fixture = {
  head: "0x8",
  blocks: {} as Record<string, ReturnType<typeof block>>,
  receipts: {} as Record<string, ReturnType<typeof receipt>>,
  traces: {},
};

const blockDefs = [
  {
    n: 1,
    txs: [
      {
        hash: TX.b1,
        logs: [singleLog(TX.b1, 1, 0, USER_A, USER_B, 1n, 100n)],
      },
    ],
  },
  {
    n: 2,
    txs: [
      {
        hash: TX.b2,
        logs: [singleLog(TX.b2, 2, 0, USER_A, USER_C, 2n, 5n)],
      },
    ],
  },
  {
    n: 3,
    txs: [
      {
        hash: TX.b3,
        logs: [
          batchLog(TX.b3, 3, 0, USER_A, USER_B, [1n, 2n], [10n, 20n]),
        ],
      },
    ],
  },
  {
    n: 4,
    txs: [
      {
        hash: TX.b4,
        logs: [
          singleLog(TX.b4, 4, 0, ZERO, USER_A, 1n, 500n),
          singleLog(TX.b4, 4, 1, USER_A, ZERO, 1n, 50n),
        ],
      },
    ],
  },
  {
    n: 5,
    txs: [
      {
        hash: TX.b5a,
        logs: [
          lockedScaledLog(
            TX.b5a,
            5,
            0,
            USER_A,
            CORR.paxg,
            ROOT_TOKEN_PAXG,
            1n,
            PAXG_LOCKED_ROOT,
            PAXG_LOCKED_ROOT,
          ),
        ],
      },
      {
        hash: TX.b5b,
        logs: [
          migrationMintLog(
            TX.b5b,
            5,
            0,
            USER_A,
            1n,
            PAXG_BRIDGE_CHILD,
            CORR.paxg,
          ),
          singleLog(TX.b5b, 5, 1, ZERO, USER_A, 1n, PAXG_BRIDGE_CHILD),
        ],
      },
    ],
  },
  {
    n: 6,
    txs: [
      {
        hash: TX.b6a,
        logs: [
          lockedScaledLog(
            TX.b6a,
            6,
            0,
            USER_A,
            CORR.xaut,
            ROOT_TOKEN_XAUT,
            2n,
            XAUT_LOCKED_ROOT,
            XAUT_GOLD_SUPPLY,
          ),
        ],
      },
      {
        hash: TX.b6b,
        logs: [
          migrationMintLog(
            TX.b6b,
            6,
            0,
            USER_A,
            2n,
            XAUT_GOLD_SUPPLY,
            CORR.xaut,
          ),
          singleLog(TX.b6b, 6, 1, ZERO, USER_A, 2n, XAUT_GOLD_SUPPLY),
        ],
      },
      {
        hash: TX.b6c,
        logs: [
          lockedScaledLog(
            TX.b6c,
            6,
            0,
            USER_A,
            CORR.xautBad,
            ROOT_TOKEN_XAUT,
            2n,
            XAUT_BAD_ROOT,
            XAUT_GOLD_SUPPLY,
          ),
        ],
      },
      {
        hash: TX.b6d,
        logs: [
          goldRedemptionRequestedLog(
            TX.b6d,
            6,
            0,
            USER_A,
            CORR.redeem,
            1n,
            300n,
            300n,
          ),
          singleLog(TX.b6d, 6, 1, USER_A, ZERO, 1n, 300n),
        ],
      },
      {
        hash: TX.b6e,
        logs: [
          exitedScaledLog(
            TX.b6e,
            6,
            0,
            CORR.redeem,
            ROOT_TOKEN_PAXG,
            1n,
            300n,
            300n,
          ),
        ],
      },
      {
        hash: TX.b6f,
        logs: [
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [
              TOKEN_B1155_DELEGATED_TOPIC,
              padAddress(OPERATOR),
              padAddress(USER_A),
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            ],
            data: abiEncodeStatic([5000n]),
            logIndex: "0x0",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [
              VALIDATOR_CREATED_TOPIC,
              padAddress(OPERATOR),
              padAddress(OPERATOR),
              padAddress(GOLD),
            ],
            data: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000",
            logIndex: "0x1",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [COMMISSION_RATE_EDITED_TOPIC, padAddress(OPERATOR)],
            data: abiEncodeStatic([500n]),
            logIndex: "0x2",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [PROPOSAL_CREATED_TOPIC],
            data: encodeProposalCreated(PROPOSAL_ID, USER_A),
            logIndex: "0x3",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [COMMITMENT_PLANTED_TOPIC, "0x0000000000000000000000000000000000000000000000000000000000000001"],
            data: abiEncodeStatic([1n, 1n]),
            logIndex: "0x4",
          },
        ],
      },
    ],
  },
  {
    n: 7,
    txs: [
      {
        hash: "0x200000000000000000000000000000000000000000000000000000000000000f",
        logs: [],
      },
    ],
  },
  {
    n: 8,
    txs: [
      {
        hash: TX.b8a,
        logs: [
          migrationMintLog(TX.b8a, 8, 0, USER_A, 1n, 500n, CORR.pending),
        ],
      },
      {
        hash: TX.b8b,
        logs: [singleLog(TX.b8b, 8, 0, ZERO, USER_A, 1n, 500n)],
      },
    ],
  },
];

for (const def of blockDefs) {
  const blk = block(def.n, def.txs);
  fixture.blocks[`0x${def.n.toString(16)}`] = blk;
  for (const tx of def.txs) {
    fixture.receipts[tx.hash] = receipt(tx.hash, def.n, tx.logs);
  }
}

const outPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wave3.json",
);
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
