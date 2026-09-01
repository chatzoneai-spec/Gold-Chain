import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abiEncodeStatic, bytes32FromTxHash } from "../src/abi.ts";
import {
  GOLD_BRIDGE_EVENT_TOPIC,
  GOLD_CHECKPOINT_EVENT_TOPIC,
  GOLD_GOVERNANCE_EVENT_TOPIC,
  GOLD_STAKING_EVENT_TOPIC,
  GOLD_VALIDATOR_EVENT_TOPIC,
  TRANSFER_BATCH_TOPIC,
  TRANSFER_SINGLE_TOPIC,
} from "../src/gold-topics.ts";

const GOLD = "0x000000000000000000000000000000000000f001";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";
const USER_C = "0x0000000000000000000000000000000000000c01";
const OPERATOR = "0x0000000000000000000000000000000000000d01";
const ZERO = "0x0000000000000000000000000000000000000000";

function padAddress(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
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

function encodeBridge(
  route: number,
  state: number,
  direction: number,
  layer: number,
  exact: boolean,
  root: bigint,
  child: bigint,
  rootTx: string,
  childTx: string,
): string {
  const rootWord = bytes32FromTxHash(rootTx);
  const childWord = bytes32FromTxHash(childTx);
  return abiEncodeStatic([
    BigInt(route),
    BigInt(state),
    BigInt(direction),
    BigInt(layer),
    exact ? 1n : 0n,
    root,
    child,
    rootWord,
    childWord,
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

function bridgeLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  correlationId: string,
  data: string,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [GOLD_BRIDGE_EVENT_TOPIC, correlationId],
    data,
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

const CORR = {
  paxg: "0xc000000000000000000000000000000000000000000000000000000000000001",
  xaut: "0xc000000000000000000000000000000000000000000000000000000000000002",
  xautBad: "0xc000000000000000000000000000000000000000000000000000000000000003",
  redeem: "0xc000000000000000000000000000000000000000000000000000000000000004",
  pending: "0xc000000000000000000000000000000000000000000000000000000000000005",
};

const ROOT = {
  paxg: "0x1000000000000000000000000000000000000000000000000000000000000010",
  xaut: "0x1000000000000000000000000000000000000000000000000000000000000012",
  xautBad: "0x1000000000000000000000000000000000000000000000000000000000000014",
  redeem: "0x1000000000000000000000000000000000000000000000000000000000000030",
  pending: "0x1000000000000000000000000000000000000000000000000000000000000020",
};

const CHILD = {
  paxg: "0x1000000000000000000000000000000000000000000000000000000000000011",
  xaut: "0x1000000000000000000000000000000000000000000000000000000000000013",
  pending: "0x1000000000000000000000000000000000000000000000000000000000000021",
  redeem: "0x1000000000000000000000000000000000000000000000000000000000000031",
};

const ZERO_TX = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Finalized solvency targets after indexing (confirmation depth 2, head 8). */
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
          bridgeLog(
            TX.b5a,
            5,
            0,
            CORR.paxg,
            encodeBridge(0, 0, 0, 0, true, PAXG_LOCKED_ROOT, PAXG_LOCKED_ROOT, ROOT.paxg, ZERO_TX),
          ),
        ],
      },
      {
        hash: TX.b5b,
        logs: [
          bridgeLog(
            TX.b5b,
            5,
            0,
            CORR.paxg,
            encodeBridge(0, 2, 0, 1, true, PAXG_BRIDGE_CHILD, PAXG_BRIDGE_CHILD, ROOT.paxg, CHILD.paxg),
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
          bridgeLog(
            TX.b6a,
            6,
            0,
            CORR.xaut,
            encodeBridge(1, 0, 0, 0, true, XAUT_LOCKED_ROOT, XAUT_GOLD_SUPPLY, ROOT.xaut, ZERO_TX),
          ),
        ],
      },
      {
        hash: TX.b6b,
        logs: [
          bridgeLog(
            TX.b6b,
            6,
            0,
            CORR.xaut,
            encodeBridge(1, 2, 0, 1, true, XAUT_LOCKED_ROOT, XAUT_GOLD_SUPPLY, ROOT.xaut, CHILD.xaut),
          ),
          singleLog(TX.b6b, 6, 1, ZERO, USER_A, 2n, XAUT_GOLD_SUPPLY),
        ],
      },
      {
        hash: TX.b6c,
        logs: [
          bridgeLog(
            TX.b6c,
            6,
            0,
            CORR.xautBad,
            encodeBridge(1, 1, 0, 0, false, XAUT_BAD_ROOT, XAUT_GOLD_SUPPLY, ROOT.xautBad, ZERO_TX),
          ),
        ],
      },
      {
        hash: TX.b6d,
        logs: [
          bridgeLog(
            TX.b6d,
            6,
            0,
            CORR.redeem,
            encodeBridge(0, 3, 1, 1, true, 300n, 300n, ROOT.redeem, CHILD.redeem),
          ),
          singleLog(TX.b6d, 6, 1, USER_A, ZERO, 1n, 300n),
        ],
      },
      {
        hash: TX.b6e,
        logs: [
          bridgeLog(
            TX.b6e,
            6,
            0,
            CORR.redeem,
            encodeBridge(0, 4, 1, 0, true, 300n, 300n, ROOT.redeem, CHILD.redeem),
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
            topics: [GOLD_STAKING_EVENT_TOPIC, padAddress(USER_A)],
            data: abiEncodeStatic([0n, 5000n]),
            logIndex: "0x0",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [GOLD_VALIDATOR_EVENT_TOPIC, padAddress(OPERATOR)],
            data: abiEncodeStatic([1n, 0n]),
            logIndex: "0x1",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [GOLD_GOVERNANCE_EVENT_TOPIC, padAddress(USER_A)],
            data: abiEncodeStatic([
              0n,
              BigInt(
                "0xc1000000000000000000000000000000000000000000000000000000000001",
              ),
            ]),
            logIndex: "0x2",
          },
          {
            transactionHash: TX.b6f,
            blockNumber: "0x6",
            address: GOLD,
            topics: [GOLD_CHECKPOINT_EVENT_TOPIC],
            data: abiEncodeStatic([
              BigInt(
                "0xc2000000000000000000000000000000000000000000000000000000000001",
              ),
              BigInt(
                "0xc3000000000000000000000000000000000000000000000000000000000001",
              ),
            ]),
            logIndex: "0x3",
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
          bridgeLog(
            TX.b8a,
            8,
            0,
            CORR.pending,
            encodeBridge(0, 2, 0, 1, true, 500n, 500n, ROOT.pending, CHILD.pending),
          ),
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
