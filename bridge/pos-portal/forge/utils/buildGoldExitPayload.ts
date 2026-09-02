import { Buffer } from "node:buffer";
import { AbiCoder, getBytes, hexlify, keccak256, toBeHex } from "ethers";
import { rlp } from "ethereumjs-util";
import Trie from "merkle-patricia-tree";
import { getReceiptBytes } from "../../test/helpers/proofs.js";

const abi = new AbiCoder();

const TRANSFER_SINGLE_EVENT_SIG =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

function pad32(value: bigint): Uint8Array {
  return getBytes(toBeHex(value, 32));
}

function blockHeaderLeaf(
  blockNumber: bigint,
  blockTime: bigint,
  txRoot: Uint8Array | Buffer,
  receiptRoot: Uint8Array | Buffer
): Uint8Array {
  return getBytes(
    keccak256(concatBytes([pad32(blockNumber), pad32(blockTime), txRoot, receiptRoot]))
  );
}

function concatBytes(parts: Array<Uint8Array | Buffer>): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function triePut(trie: Trie, key: Uint8Array, value: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    trie.put(key, value, (err) => (err ? reject(err) : resolve()));
  });
}

async function trieFindPath(
  trie: Trie,
  key: Uint8Array
): Promise<{ parentNodes: Uint8Array[]; path: Uint8Array }> {
  return new Promise((resolve, reject) => {
    trie.findPath(key, (err, _node, reminder, stack) => {
      if (err) {
        reject(err);
        return;
      }
      if (reminder.length > 0) {
        reject(new Error("Node does not contain the key"));
        return;
      }
      resolve({
        parentNodes: stack.map((s) => s.raw),
        path: key,
      });
    });
  });
}

async function emptyTrieRoot(): Promise<Buffer> {
  const trie = new Trie();
  return trie.root;
}

async function buildReceiptProof(receipt: Record<string, unknown>): Promise<{
  receiptBytes: Uint8Array;
  receiptRoot: Uint8Array;
  parentNodes: Uint8Array[];
  path: Uint8Array;
}> {
  const receiptBytes = getReceiptBytes(receipt);
  const trie = new Trie();
  const txIndexPath = rlp.encode(0);
  await triePut(trie, txIndexPath, receiptBytes);

  const { parentNodes, path } = await trieFindPath(trie, txIndexPath);
  return {
    receiptBytes,
    receiptRoot: trie.root,
    parentNodes,
    path,
  };
}

function buildExitPayload(
  headerNumber: bigint,
  blockNumber: bigint,
  blockTime: bigint,
  txRoot: Uint8Array,
  receiptRoot: Uint8Array,
  receiptBytes: Uint8Array,
  receiptParentNodes: Uint8Array[],
  receiptPath: Uint8Array,
  receiptLogIndex: number
): Uint8Array {
  const branchMask = Buffer.concat([Buffer.from("00", "hex"), receiptPath]);
  return rlp.encode([
    headerNumber,
    Buffer.alloc(0),
    blockNumber,
    blockTime,
    txRoot,
    receiptRoot,
    receiptBytes,
    rlp.encode(receiptParentNodes),
    branchMask,
    receiptLogIndex,
  ]);
}

async function main() {
  const encoded = process.argv[2];
  if (!encoded) {
    console.error("missing args");
    process.exit(1);
  }

  const [
    childGold,
    withdrawer,
    operator,
    tokenId,
    childAmount,
    blockNumber,
    blockTime,
    headerNumber,
  ] = abi.decode(
    ["address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
    encoded
  ) as [string, string, string, bigint, bigint, bigint, bigint, bigint];

  const logData = abi.encode(["uint256", "uint256"], [tokenId, childAmount]);

  const receipt = {
    status: true,
    cumulativeGasUsed: "0x5208",
    logsBloom: "0x" + "00".repeat(512),
    transactionIndex: 0,
    logs: [
      {
        address: childGold,
        topics: [
          TRANSFER_SINGLE_EVENT_SIG,
          operator,
          withdrawer,
          "0x0000000000000000000000000000000000000000",
        ],
        data: logData,
      },
    ],
  };

  const { receiptBytes, receiptRoot, parentNodes } = await buildReceiptProof(receipt);
  const receiptPath = rlp.encode(0);
  const txRoot = await emptyTrieRoot();
  const rootHash = blockHeaderLeaf(blockNumber, blockTime, txRoot, receiptRoot);
  const exitPayload = buildExitPayload(
    headerNumber,
    blockNumber,
    blockTime,
    txRoot,
    receiptRoot,
    receiptBytes,
    parentNodes,
    receiptPath,
    0
  );

  const output = abi.encode(
    ["bytes", "bytes32", "uint256", "uint256", "bytes32", "bytes32"],
    [hexlify(exitPayload), rootHash, blockNumber, blockTime, txRoot, receiptRoot]
  );

  process.stdout.write(output);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
