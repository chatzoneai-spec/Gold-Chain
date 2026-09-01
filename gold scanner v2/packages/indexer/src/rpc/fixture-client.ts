import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RpcBlock, RpcClient, RpcReceipt, RpcTrace } from "./types.js";

type FixtureData = {
  head: string;
  blocks: Record<string, RpcBlock>;
  receipts: Record<string, RpcReceipt>;
  traces?: Record<string, { result: RpcTrace[] }>;
};

type StagedFixtureData = {
  stages: FixtureData[];
};

function isStaged(data: FixtureData | StagedFixtureData): data is StagedFixtureData {
  return "stages" in data;
}

function blockKey(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}

function loadFixture(fixtureName: string): FixtureData | StagedFixtureData {
  const fixturesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../fixtures",
  );
  const raw = readFileSync(path.join(fixturesDir, fixtureName), "utf8");
  return JSON.parse(raw) as FixtureData | StagedFixtureData;
}

export class FixtureRpcClient implements RpcClient {
  private stageIndex = 0;
  private readonly data: FixtureData | StagedFixtureData;

  constructor(fixtureName: string) {
    this.data = loadFixture(fixtureName);
  }

  advanceStage(): void {
    if (isStaged(this.data) && this.stageIndex < this.data.stages.length - 1) {
      this.stageIndex += 1;
    }
  }

  getStageIndex(): number {
    return this.stageIndex;
  }

  private current(): FixtureData {
    if (isStaged(this.data)) {
      return this.data.stages[this.stageIndex] ?? this.data.stages[0]!;
    }
    return this.data;
  }

  async getBlockNumber(): Promise<number> {
    const head = this.current().head;
    return Number.parseInt(head, 16);
  }

  async getBlockByNumber(blockNumber: number): Promise<RpcBlock | null> {
    const key = blockKey(blockNumber);
    return this.current().blocks[key] ?? null;
  }

  async getTransactionReceipt(txHash: string): Promise<RpcReceipt | null> {
    return this.current().receipts[txHash] ?? null;
  }

  async getTransactionTraces(txHash: string): Promise<RpcTrace[]> {
    const traceEntry = this.current().traces?.[txHash];
    return traceEntry?.result ?? [];
  }
}
