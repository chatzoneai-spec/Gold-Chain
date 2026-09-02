import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abiEncodeStatic } from "../src/abi.ts";
import {
  COMMITMENT_PLANTED_TOPIC,
  COMMITMENT_UPDATED_TOPIC,
  DELEGATED_TOPIC,
  PROPOSAL_CREATED_TOPIC,
  PROPOSAL_EXECUTED_TOPIC,
  PROPOSAL_QUEUED_TOPIC,
  STAKE_CREDIT_INITIALIZED_TOPIC,
  TOKEN_B1155_DELEGATED_TOPIC,
  UNDELEGATED_TOPIC,
  VALIDATOR_CREATED_TOPIC,
  VALIDATOR_JAILED_TOPIC,
  VOTE_CAST_TOPIC,
  COMMISSION_RATE_EDITED_TOPIC,
} from "../src/gold-topics.ts";

const GOLD = "0x000000000000000000000000000000000000f001";
const USER_A = "0x0000000000000000000000000000000000000a01";
const USER_B = "0x0000000000000000000000000000000000000b01";
const VALIDATOR1 = "0x0000000000000000000000000000000000000d01";
const VALIDATOR2 = "0x0000000000000000000000000000000000000d02";

const PROPOSAL_ID = BigInt(
  "0xc1000000000000000000000000000000000000000000000000000000000001",
);
const CHECKPOINT_COMMITTED = 1n;
const CHECKPOINT_HALTED = 2n;
const TIMELOCK_ETA_UNIX = 1_700_000_000n;

function padAddress(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
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

function encodeVoteCast(proposalId: bigint, support: number): string {
  return abiEncodeStatic([proposalId, BigInt(support), 1n, 128n, 0n]);
}

function stakingDelegatedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  operator: string,
  delegator: string,
  tokenId: bigint,
  amount: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      TOKEN_B1155_DELEGATED_TOPIC,
      padAddress(operator),
      padAddress(delegator),
      `0x${tokenId.toString(16).padStart(64, "0")}`,
    ],
    data: abiEncodeStatic([amount]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function stakingGiltLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  operator: string,
  delegator: string,
  topic: string,
  shares: bigint,
  giltAmount: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [topic, padAddress(operator), padAddress(delegator)],
    data: abiEncodeStatic([shares, giltAmount]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function validatorCreatedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  validator: string,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      VALIDATOR_CREATED_TOPIC,
      padAddress(validator),
      padAddress(validator),
      padAddress(GOLD),
    ],
    data: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000",
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function commissionEditedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  validator: string,
  commissionBps: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [COMMISSION_RATE_EDITED_TOPIC, padAddress(validator)],
    data: abiEncodeStatic([commissionBps]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function stakeCreditInitializedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  validator: string,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      STAKE_CREDIT_INITIALIZED_TOPIC,
      padAddress(validator),
      padAddress(GOLD),
    ],
    data: "0x",
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function validatorJailedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  validator: string,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [VALIDATOR_JAILED_TOPIC, padAddress(validator)],
    data: "0x",
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function governanceLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  topic: string,
  data: string,
  voter?: string,
) {
  const topics = [topic];
  if (voter) {
    topics.push(padAddress(voter));
  }
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics,
    data,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function checkpointPlantedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  epoch: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      COMMITMENT_PLANTED_TOPIC,
      `0x${epoch.toString(16).padStart(64, "0")}`,
    ],
    data: abiEncodeStatic([1n, 1n]),
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function checkpointHaltedLog(
  txHash: string,
  blockNumber: number,
  logIndex: number,
  epoch: bigint,
) {
  return {
    transactionHash: txHash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    address: GOLD,
    topics: [
      COMMITMENT_UPDATED_TOPIC,
      `0x${epoch.toString(16).padStart(64, "0")}`,
    ],
    data: abiEncodeStatic([0n, 1n]),
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
          stakingGiltLog(
            TX.b1,
            1,
            0,
            VALIDATOR1,
            USER_A,
            DELEGATED_TOPIC,
            10_000n,
            10_000n,
          ),
          stakingDelegatedLog(TX.b1, 1, 1, VALIDATOR1, USER_A, 1n, 500n),
        ],
      },
    ],
  },
  {
    n: 2,
    txs: [
      {
        hash: TX.b2,
        logs: [
          stakingGiltLog(
            TX.b2,
            2,
            0,
            VALIDATOR1,
            USER_A,
            UNDELEGATED_TOPIC,
            2_000n,
            2_000n,
          ),
        ],
      },
    ],
  },
  {
    n: 3,
    txs: [
      {
        hash: TX.b3a,
        logs: [
          validatorCreatedLog(TX.b3a, 3, 0, VALIDATOR1),
          commissionEditedLog(TX.b3a, 3, 1, VALIDATOR1, 500n),
        ],
      },
      {
        hash: TX.b3b,
        logs: [stakeCreditInitializedLog(TX.b3b, 3, 0, VALIDATOR1)],
      },
    ],
  },
  {
    n: 4,
    txs: [
      {
        hash: TX.b4,
        logs: [validatorJailedLog(TX.b4, 4, 0, VALIDATOR2)],
      },
    ],
  },
  {
    n: 5,
    txs: [
      {
        hash: TX.b5a,
        logs: [
          governanceLog(
            TX.b5a,
            5,
            0,
            PROPOSAL_CREATED_TOPIC,
            encodeProposalCreated(PROPOSAL_ID, USER_A),
          ),
          checkpointPlantedLog(TX.b5a, 5, 1, CHECKPOINT_COMMITTED),
        ],
      },
      {
        hash: TX.b5b,
        logs: [
          governanceLog(
            TX.b5b,
            5,
            0,
            VOTE_CAST_TOPIC,
            encodeVoteCast(PROPOSAL_ID, 1),
            USER_B,
          ),
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
          governanceLog(
            TX.b6a,
            6,
            0,
            PROPOSAL_QUEUED_TOPIC,
            abiEncodeStatic([PROPOSAL_ID, TIMELOCK_ETA_UNIX]),
          ),
        ],
      },
      {
        hash: TX.b6b,
        logs: [
          governanceLog(
            TX.b6b,
            6,
            0,
            PROPOSAL_EXECUTED_TOPIC,
            abiEncodeStatic([PROPOSAL_ID]),
          ),
        ],
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
        logs: [checkpointHaltedLog(TX.b8, 8, 0, CHECKPOINT_HALTED)],
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
