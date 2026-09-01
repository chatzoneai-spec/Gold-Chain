import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abiEncodeStatic } from "../src/abi.ts";
import {
  GOLD_CHECKPOINT_EVENT_TOPIC,
  GOLD_GOVERNANCE_EVENT_TOPIC,
  GOLD_STAKING_EVENT_TOPIC,
  GOLD_VALIDATOR_EVENT_TOPIC,
} from "../src/gold-topics.ts";

const GOLD = "0x000000000000000000000000000000000000f001";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";
const VALIDATOR1 = "0x0000000000000000000000000000000000000d01";
const VALIDATOR2 = "0x0000000000000000000000000000000000000d02";

const PROPOSAL_WORD = BigInt(
  "0xc1000000000000000000000000000000000000000000000000000000000001",
);
const CHECKPOINT_COMMITTED = BigInt(
  "0xc2000000000000000000000000000000000000000000000000000000000001",
);
const CHECKPOINT_HALTED = BigInt(
  "0xc2000000000000000000000000000000000000000000000000000000000002",
);
const VALIDATOR_SET_HASH = BigInt(
  "0xc3000000000000000000000000000000000000000000000000000000000001",
);
const TIMELOCK_ETA_UNIX = 1_700_000_000n;

function padAddress(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function stakingLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  staker: string,
  validator: string,
  eventType: bigint,
  amount: bigint,
  assetCode: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      GOLD_STAKING_EVENT_TOPIC,
      padAddress(staker),
      padAddress(validator),
    ],
    data: abiEncodeStatic([eventType, amount, assetCode]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function validatorLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  validator: string,
  eventType: bigint,
  amount: bigint,
  commissionBps: bigint,
  jailed: bigint,
  elected: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [GOLD_VALIDATOR_EVENT_TOPIC, padAddress(validator)],
    data: abiEncodeStatic([eventType, amount, commissionBps, jailed, elected]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function governanceLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  topicAddress: string | null,
  eventType: bigint,
  supportCode: bigint,
  timelockEtaUnix: bigint,
) {
  const topics = [GOLD_GOVERNANCE_EVENT_TOPIC];
  if (topicAddress) {
    topics.push(padAddress(topicAddress));
  }
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics,
    data: abiEncodeStatic([
      eventType,
      PROPOSAL_WORD,
      supportCode,
      timelockEtaUnix,
    ]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function checkpointLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  checkpointWord: bigint,
  statusCode: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [GOLD_CHECKPOINT_EVENT_TOPIC],
    data: abiEncodeStatic([checkpointWord, VALIDATOR_SET_HASH, statusCode]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

const TX = {
  b1: "0x3000000000000000000000000000000000000000000000000000000000000001",
  b2: "0x3000000000000000000000000000000000000000000000000000000000000002",
  b3a: "0x3000000000000000000000000000000000000000000000000000000000000003",
  b3b: "0x3000000000000000000000000000000000000000000000000000000000000004",
  b4: "0x3000000000000000000000000000000000000000000000000000000000000005",
  b5a: "0x3000000000000000000000000000000000000000000000000000000000000006",
  b5b: "0x3000000000000000000000000000000000000000000000000000000000000007",
  b6a: "0x3000000000000000000000000000000000000000000000000000000000000008",
  b6b: "0x3000000000000000000000000000000000000000000000000000000000000009",
  b7: "0x300000000000000000000000000000000000000000000000000000000000000a",
  b8: "0x300000000000000000000000000000000000000000000000000000000000000b",
};

function block(
  number: number,
  txs: Array<{ hash: string; logs: object[] }>,
) {
  const parent =
    number === 1
      ? "0xgenesis0000000000000000000000000000000000000000000000000000000000"
      : `0xblock${String(number - 1).padStart(60, "0")}`;
  return {
    number: `0x${number.toString(16)}`,
    hash: `0xblock${String(number).padStart(60, "0")}`,
    parentHash: parent,
    timestamp: `0x65c000${number.toString(16).padStart(2, "0")}`,
    miner: VALIDATOR1,
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
        logs: [
          stakingLog(TX.b1, 1, 0, USER_A, VALIDATOR1, 0n, 10_000n, 0n),
          stakingLog(TX.b1, 1, 1, USER_A, VALIDATOR1, 0n, 500n, 1n),
        ],
      },
    ],
  },
  {
    n: 2,
    txs: [
      {
        hash: TX.b2,
        logs: [stakingLog(TX.b2, 2, 0, USER_A, VALIDATOR1, 2n, 2_000n, 0n)],
      },
    ],
  },
  {
    n: 3,
    txs: [
      {
        hash: TX.b3a,
        logs: [
          validatorLog(TX.b3a, 3, 0, VALIDATOR1, 0n, 0n, 500n, 0n, 0n),
        ],
      },
      {
        hash: TX.b3b,
        logs: [
          validatorLog(TX.b3b, 3, 0, VALIDATOR1, 4n, 0n, 0n, 0n, 1n),
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
          validatorLog(TX.b4, 4, 0, VALIDATOR2, 2n, 0n, 0n, 1n, 0n),
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
          governanceLog(TX.b5a, 5, 0, USER_A, 0n, 0n, 0n),
          checkpointLog(TX.b5a, 5, 1, CHECKPOINT_COMMITTED, 0n),
        ],
      },
      {
        hash: TX.b5b,
        logs: [governanceLog(TX.b5b, 5, 0, USER_B, 1n, 1n, 0n)],
      },
    ],
  },
  {
    n: 6,
    txs: [
      {
        hash: TX.b6a,
        logs: [
          governanceLog(TX.b6a, 6, 0, null, 2n, 0n, TIMELOCK_ETA_UNIX),
        ],
      },
      {
        hash: TX.b6b,
        logs: [governanceLog(TX.b6b, 6, 0, null, 3n, 0n, 0n)],
      },
    ],
  },
  {
    n: 7,
    txs: [{ hash: TX.b7, logs: [] }],
  },
  {
    n: 8,
    txs: [
      {
        hash: TX.b8,
        logs: [checkpointLog(TX.b8, 8, 0, CHECKPOINT_HALTED, 2n)],
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
  "../fixtures/wave8.json",
);
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
