import type { NextConfig } from "next";

const apiOrigin = process.env.GOLDSCAN_API_ORIGIN ?? "http://127.0.0.1:4000";

const goldApiPaths = [
  "solvency",
  "bridge-activity",
  "redemption-receipts",
  "staking",
  "validators",
  "delegation",
  "checkpoints",
  "governance",
  "migration-status",
  "validator-set",
  "delegations",
  "checkpoint-status",
  "governance-board",
];

const nextConfig: NextConfig = {
  async rewrites() {
    const rewrites = [
      { source: "/api", destination: `${apiOrigin}/api` },
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/ws", destination: `${apiOrigin}/ws` },
      { source: "/contract/:path*", destination: `${apiOrigin}/contract/:path*` },
    ];

    for (const path of goldApiPaths) {
      rewrites.push({
        source: `/gold/${path}`,
        destination: `${apiOrigin}/gold/${path}`,
      });
      rewrites.push({
        source: `/gold/${path}/:path*`,
        destination: `${apiOrigin}/gold/${path}/:path*`,
      });
    }

    return rewrites;
  },
};

export default nextConfig;
