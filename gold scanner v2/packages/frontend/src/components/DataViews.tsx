import Link from "next/link";
import { FinalityBadge, JsonBlock } from "@/components/ui";
import type {
  AddressTokenBalance,
  TokenListEntry,
  ValidatorSetRow,
} from "@/lib/types";

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

export function ValidatorSetTable({ validators }: { validators: ValidatorSetRow[] }) {
  return (
    <table className="data-table" data-testid="validator-set-table">
      <thead>
        <tr>
          <th>Validator</th>
          <th>Voting power</th>
          <th>GILT</th>
          <th>GOLD ID 1</th>
          <th>GOLD ID 2</th>
          <th>Commission</th>
          <th>Jailed</th>
          <th>Elected</th>
        </tr>
      </thead>
      <tbody>
        {validators.map((row) => (
          <tr key={row.validatorAddress}>
            <td>
              <Link href={`/address/${row.validatorAddress}`}>
                {row.validatorAddress.slice(0, 10)}…
              </Link>
            </td>
            <td>{row.votingPower}</td>
            <td data-testid={`gilt-stake-${row.validatorAddress}`}>{row.giltStake}</td>
            <td data-testid={`gold-id1-stake-${row.validatorAddress}`}>
              {row.goldId1Stake}
            </td>
            <td data-testid={`gold-id2-stake-${row.validatorAddress}`}>
              {row.goldId2Stake}
            </td>
            <td>{row.commissionBps} bps</td>
            <td>{row.jailed ? "yes" : "no"}</td>
            <td>{row.elected ? "yes" : "no"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TokenHoldingsTable({
  holdings,
  testIdPrefix = "holdings",
}: {
  holdings: AddressTokenBalance[];
  testIdPrefix?: string;
}) {
  const gold1 = holdings.filter(
    (row) => row.tokenID === "1" && row.tokenStandard === "erc1155",
  );
  const gold2 = holdings.filter(
    (row) => row.tokenID === "2" && row.tokenStandard === "erc1155",
  );
  const other = holdings.filter((row) => row.tokenID !== "1" && row.tokenID !== "2");

  return (
    <div data-testid={`${testIdPrefix}-table`}>
      <div className="gold-id-section" data-testid="address-gold-id-1">
        <h3>GOLD ID 1 holdings</h3>
        <HoldingsRows rows={gold1} />
      </div>
      <div className="gold-id-section" data-testid="address-gold-id-2">
        <h3>GOLD ID 2 holdings</h3>
        <HoldingsRows rows={gold2} />
      </div>
      {other.length > 0 ? (
        <div data-testid="address-other-holdings">
          <h3>Other tokens</h3>
          <HoldingsRows rows={other} />
        </div>
      ) : null}
    </div>
  );
}

function HoldingsRows({ rows }: { rows: AddressTokenBalance[] }) {
  if (rows.length === 0) {
    return <p className="muted">No balance</p>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Contract</th>
          <th>Token ID</th>
          <th>Balance</th>
          <th>Standard</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.contractAddress}-${row.tokenID}`}>
            <td>
              <Link href={`/tokens/${row.contractAddress}`}>
                {row.contractAddress.slice(0, 10)}…
              </Link>
            </td>
            <td>{row.tokenID}</td>
            <td>{row.balance}</td>
            <td>{row.tokenStandard}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TokenListTable({ tokens }: { tokens: TokenListEntry[] }) {
  return (
    <table className="data-table" data-testid="token-list-table">
      <thead>
        <tr>
          <th>Contract</th>
          <th>Type</th>
          <th>Name</th>
          <th>Symbol</th>
        </tr>
      </thead>
      <tbody>
        {tokens.map((token) => (
          <tr key={token.contractAddress}>
            <td>
              <Link href={`/tokens/${token.contractAddress}`}>
                {token.contractAddress}
              </Link>
            </td>
            <td>{token.tokenType}</td>
            <td>{token.tokenName}</td>
            <td>{token.symbol}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
