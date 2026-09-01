import { FinalityBadge, JsonBlock } from "./ui";
import type { SolvencyResult } from "@/lib/types";

export function SolvencyHero({ data }: { data: SolvencyResult }) {
  return (
    <section className="card card-hero" data-testid="solvency-hero">
      <h1>Solvency</h1>
      <p className="muted">
        Locked root-side assets vs GOLD supply — per asset, from API only.
      </p>
      <div className="grid-2">
        <AssetPanel label="PAXG → GOLD ID 1" asset={data.paxg} />
        <AssetPanel label="XAUT → GOLD ID 2" asset={data.xaut} />
      </div>
    </section>
  );
}

function AssetPanel({
  label,
  asset,
}: {
  label: string;
  asset: SolvencyResult["paxg"];
}) {
  return (
    <div className="gold-id-section" data-testid={`solvency-asset-${asset.goldTokenId}`}>
      <div className="section-label">{label}</div>
      <h3>GOLD token ID {asset.goldTokenId}</h3>
      <p>
        Route asset: <strong>{asset.routeAsset}</strong>
      </p>
      <p>
        Locked on Ethereum: <strong>{asset.lockedOnEthereum}</strong>
      </p>
      <p>
        GOLD supply: <strong>{asset.goldSupply}</strong>
      </p>
      <FinalityBadge status="finalized" />
      <JsonBlock value={asset} />
    </div>
  );
}
