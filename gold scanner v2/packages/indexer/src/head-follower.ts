import type { RpcClient } from "./rpc/types.js";

export type HeadFollowerOptions = {
  pollIntervalMs?: number;
};

export class HeadFollower {
  private lastHead = 0;

  constructor(
    private readonly rpc: RpcClient,
    private readonly options: HeadFollowerOptions = {},
  ) {}

  async pollHead(): Promise<number> {
    const head = await this.rpc.getBlockNumber();
    this.lastHead = head;
    return head;
  }

  getLastHead(): number {
    return this.lastHead;
  }

  getPollIntervalMs(): number {
    return this.options.pollIntervalMs ?? 0;
  }
}
