export type JobType =
  | "receipts"
  | "contract-detection"
  | "logs"
  | "token-transfers-erc20-721"
  | "token-transfers-erc1155"
  | "bridge-events"
  | "staking-events"
  | "validator-events"
  | "governance-events"
  | "checkpoint-events"
  | "internal-txs";

export type Job = {
  type: JobType;
  payload: unknown;
};

export class JobQueue {
  private readonly jobs: Job[] = [];

  enqueue(job: Job): void {
    this.jobs.push(job);
  }

  async drain(handler: (job: Job) => Promise<void>): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      await handler(job);
    }
  }
}
