import { FinalityBadge, JsonBlock } from "./ui";
import type { SolvencyResult, TokenHolder } from "@/lib/types";

export function GoldIdSections({
  solvency,
  holdersId1,
  holdersId2,
}: {
  solvency: SolvencyResult;
  holdersId1?: TokenHolder[];
  holdersId2?: TokenHolder[];
}) {
  return (
    <div data-testid="gold-id-sections">
      <GoldIdPanel
        tokenId="1"
        routeAsset="paxg"
        supply={solvency.paxg.goldSupply}
        locked={solvency.paxg.lockedOnEthereum}
        asset={solvency.paxg}
        holders={holdersId1}
      />
      <GoldIdPanel
        tokenId="2"
        routeAsset="xaut"
        supply={solvency.xaut.goldSupply}
        locked={solvency.xaut.lockedOnEthereum}
        asset={solvency.xaut}
        holders={holdersId2}
      />
    </div>
  );
}

function GoldIdPanel({
  tokenId,
  routeAsset,
  supply,
  locked,
  asset,
  holders,
}: {
  tokenId: string;
  routeAsset: string;
  supply: string;
  locked: string;
  asset: SolvencyResult["paxg"];
  holders?: TokenHolder[];
}) {
  return (
    <section
      className="card gold-id-section"
      data-testid={`gold-id-${tokenId}`}
    >
      <div className="section-label">GOLD ERC1155 — Token ID {tokenId}</div>
      <h2>ID {tokenId} ({routeAsset.toUpperCase()} route)</h2>
      <p>Supply: <strong>{supply}</strong></p>
      <p>Backing locked ({routeAsset}): <strong>{locked}</strong></p>
      <FinalityBadge status="finalized" />
      {holders ? (
        <div data-testid={`gold-holders-${tokenId}`}>
          <h3>Holders</h3>
          {holders.length === 0 ? (
            <p className="muted">No holders</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((holder) => (
                  <tr key={holder.address}>
                    <td>{holder.address}</td>
                    <td>{holder.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      <JsonBlock value={asset} />
    </section>
  );
}
