import type pg from "pg";
import * as evm from "./writer-evm.js";
import * as gold from "./writer-gold.js";

export type {
  BlockRow,
  BridgeTransferRow,
  CheckpointRow,
  GovernanceEventRow,
  InternalTxRow,
  LogRow,
  ReceiptRow,
  StakingEventRow,
  TokenTransferRow,
  TransactionRow,
  ValidatorEventRow,
} from "./writer-types.js";

export class IndexerWriter {
  constructor(private readonly client: pg.PoolClient) {}

  async ensureAddress(address: string): Promise<void> {
    await evm.ensureAddress(this.client, address);
  }

  async upsertBlock(row: Parameters<typeof evm.upsertBlock>[1]): Promise<void> {
    await evm.upsertBlock(this.client, row);
  }

  async markBlockRevertedByNumber(blockNumber: number): Promise<void> {
    await this.client.query(
      `UPDATE blocks SET finality_status = 'reverted' WHERE number = $1`,
      [blockNumber],
    );
    await this.markBlockDerivedRowsReverted(blockNumber);
  }

  async markBlockRevertedFromNumber(blockNumber: number): Promise<void> {
    await this.client.query(
      `UPDATE blocks SET finality_status = 'reverted' WHERE number >= $1`,
      [blockNumber],
    );
    const { rows } = await this.client.query<{ number: string }>(
      `SELECT number FROM blocks WHERE number >= $1`,
      [blockNumber],
    );
    for (const row of rows) {
      await this.markBlockDerivedRowsReverted(Number(row.number));
    }
  }

  private async markBlockDerivedRowsReverted(blockNumber: number): Promise<void> {
    await evm.markEvmDerivedRowsReverted(this.client, blockNumber);
    await gold.markGoldDerivedRowsReverted(this.client, blockNumber);
  }

  async clearDerivedRowsForBlock(blockNumber: number): Promise<void> {
    const { rows } = await this.client.query<{ contract_address: string }>(
      `SELECT DISTINCT contract_address FROM token_transfers WHERE block_number = $1`,
      [blockNumber],
    );
    await this.client.query(`DELETE FROM token_transfers WHERE block_number = $1`, [
      blockNumber,
    ]);
    for (const row of rows) {
      await gold.refreshTokenBalancesForContract(this.client, row.contract_address);
    }
    await gold.clearGoldDerivedRowsForBlock(this.client, blockNumber);
    await evm.clearEvmDerivedRowsForBlock(this.client, blockNumber);
  }

  async markOrphanedTransactionsReverted(
    blockNumber: number,
    activeTxHashes: string[],
  ): Promise<void> {
    await evm.markOrphanedTransactionsReverted(
      this.client,
      blockNumber,
      activeTxHashes,
    );
  }

  async upsertTransaction(
    row: Parameters<typeof evm.upsertTransaction>[1],
  ): Promise<void> {
    await evm.upsertTransaction(this.client, row);
  }

  async upsertReceipt(row: Parameters<typeof evm.upsertReceipt>[1]): Promise<void> {
    await evm.upsertReceipt(this.client, row);
  }

  async upsertLog(row: Parameters<typeof evm.upsertLog>[1]): Promise<void> {
    await evm.upsertLog(this.client, row);
  }

  async upsertInternalTx(
    row: Parameters<typeof evm.upsertInternalTx>[1],
  ): Promise<void> {
    await evm.upsertInternalTx(this.client, row);
  }

  async upsertContract(
    address: string,
    bytecode: string | null = null,
  ): Promise<void> {
    await evm.upsertContract(this.client, address, bytecode);
  }

  async upsertTokenContract(
    address: string,
    type: "erc20" | "erc721" | "erc1155",
    name: string | null = null,
    symbol: string | null = null,
    decimals: number | null = null,
  ): Promise<void> {
    await evm.upsertTokenContract(
      this.client,
      address,
      type,
      name,
      symbol,
      decimals,
    );
  }

  async upsertTokenTransfer(
    row: Parameters<typeof evm.upsertTokenTransfer>[1],
  ): Promise<void> {
    await evm.upsertTokenTransfer(this.client, row);
  }

  async insertBridgeTransfer(
    row: Parameters<typeof gold.insertBridgeTransfer>[1],
  ): Promise<void> {
    await gold.insertBridgeTransfer(this.client, row);
  }

  async insertStakingEvent(
    row: Parameters<typeof gold.insertStakingEvent>[1],
  ): Promise<void> {
    await gold.insertStakingEvent(this.client, row);
  }

  async insertValidatorEvent(
    row: Parameters<typeof gold.insertValidatorEvent>[1],
  ): Promise<void> {
    await gold.insertValidatorEvent(this.client, row);
  }

  async insertGovernanceEvent(
    row: Parameters<typeof gold.insertGovernanceEvent>[1],
  ): Promise<void> {
    await gold.insertGovernanceEvent(this.client, row);
  }

  async insertCheckpoint(
    row: Parameters<typeof gold.insertCheckpoint>[1],
  ): Promise<void> {
    await gold.insertCheckpoint(this.client, row);
  }

  async refreshTokenBalancesForContract(contractAddress: string): Promise<void> {
    await gold.refreshTokenBalancesForContract(this.client, contractAddress);
  }

  async refreshGoldSupply(): Promise<void> {
    await gold.refreshGoldSupply(this.client);
  }

  async updateFinalityForRange(
    fromBlock: number,
    toBlock: number,
    headNumber: number,
    revertedFrom: number | null = null,
  ): Promise<void> {
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1) {
      const status = evm.finalityStatusForBlockNumber(
        blockNumber,
        headNumber,
        revertedFrom,
      );
      await evm.updateEvmFinalityForBlock(this.client, blockNumber, status);
      await gold.updateGoldFinalityForBlock(this.client, blockNumber, status);
    }

    await gold.refreshGoldSupply(this.client);
  }

  async getBlockHashAtNumber(blockNumber: number): Promise<string | null> {
    return evm.getBlockHashAtNumber(this.client, blockNumber);
  }
}
