import { FinalityBadge, JsonBlock } from "./ui";
import type { SolvencyResult } from "@/lib/types";

export function GoldIdSections({ solvency }: { solvency: SolvencyResult }) {
  return (
    <div data-testid="gold-id-sections">
      <GoldIdPanel
        tokenId="1"
        routeAsset="paxg"
        supply={solvency.paxg.goldSupply}
        locked={solvency.paxg.lockedOnEthereum}
        asset={solvency.paxg}
      />
      <GoldIdPanel
        tokenId="2"
        routeAsset="xaut"
        supply={solvency.xaut.goldSupply}
        locked={solvency.xaut.lockedOnEthereum}
        asset={solvency.xaut}
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
}: {
  tokenId: string;
  routeAsset: string;
  supply: string;
  locked: string;
  asset: SolvencyResult["paxg"];
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
      <JsonBlock value={asset} />
    </section>
  );
}
