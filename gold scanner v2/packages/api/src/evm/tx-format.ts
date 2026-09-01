export function formatTransactionRow(row: Record<string, unknown>) {
  return {
    blockNumber: String(row.block_number),
    timeStamp: String(Math.floor(new Date(String(row.timestamp)).getTime() / 1000)),
    hash: row.hash,
    nonce: row.nonce,
    blockHash: row.block_hash,
    transactionIndex: String(row.transaction_index),
    from: row.from_address,
    to: row.to_address ?? "",
    value: row.value,
    gas: row.gas,
    gasPrice: row.gas_price ?? "0",
    isError: row.status === 1 ? "0" : "1",
    txreceipt_status: String(row.status),
    input: row.input,
    contractAddress: row.contract_address ?? "",
    cumulativeGasUsed: row.cumulative_gas_used ?? "0",
    gasUsed: row.gas_used ?? "0",
    finalityStatus: row.finality_status,
  };
}

export const TX_SELECT_SQL = `
  SELECT t.hash, t.block_number, t.from_address, t.to_address, t.value::text,
         t.gas::text, t.gas_price::text, t.input, t.nonce::text,
         t.transaction_index, t.status, t.finality_status,
         b.hash AS block_hash, b.timestamp,
         r.cumulative_gas_used::text, r.gas_used::text, r.contract_address
  FROM transactions t
  JOIN blocks b ON b.number = t.block_number
  LEFT JOIN receipts r ON r.transaction_hash = t.hash
`;
