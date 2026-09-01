import Link from "next/link";
import { FinalityBadge, JsonBlock } from "@/components/ui";

export function BlockTable({
  blocks,
}: {
  blocks: Array<{
    number: string;
    hash: string;
    timestamp: string;
    validator: string;
    gasUsed: string;
    gasLimit: string;
    finalityStatus: string;
  }>;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Number</th>
          <th>Hash</th>
          <th>Timestamp</th>
          <th>Validator</th>
          <th>Gas</th>
          <th>Finality</th>
        </tr>
      </thead>
      <tbody>
        {blocks.map((block) => (
          <tr key={block.hash}>
            <td>
              <Link href={`/blocks/${block.number}`}>{block.number}</Link>
            </td>
            <td>
              <Link href={`/blocks/${block.number}`}>{block.hash.slice(0, 14)}…</Link>
            </td>
            <td>{block.timestamp}</td>
            <td>
              <Link href={`/address/${block.validator}`}>
                {String(block.validator).slice(0, 10)}…
              </Link>
            </td>
            <td>
              {block.gasUsed} / {block.gasLimit}
            </td>
            <td>
              <FinalityBadge status={block.finalityStatus} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TxTable({
  txs,
}: {
  txs: Array<{
    hash: string;
    blockNumber: string;
    from: string;
    to: string;
    value: string;
    gasUsed?: string;
    gas?: string;
    finalityStatus: string;
  }>;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Hash</th>
          <th>Block</th>
          <th>From</th>
          <th>To</th>
          <th>Value</th>
          <th>Gas</th>
          <th>Finality</th>
        </tr>
      </thead>
      <tbody>
        {txs.map((tx) => (
          <tr key={tx.hash}>
            <td>
              <Link href={`/tx/${tx.hash}`}>{tx.hash.slice(0, 14)}…</Link>
            </td>
            <td>
              <Link href={`/blocks/${tx.blockNumber}`}>{tx.blockNumber}</Link>
            </td>
            <td>
              <Link href={`/address/${tx.from}`}>{tx.from.slice(0, 10)}…</Link>
            </td>
            <td>
              <Link href={`/address/${tx.to}`}>{tx.to.slice(0, 10)}…</Link>
            </td>
            <td>{tx.value}</td>
            <td>{tx.gasUsed ?? tx.gas}</td>
            <td>
              <FinalityBadge status={tx.finalityStatus} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <JsonBlock value={value} />
    </section>
  );
}
