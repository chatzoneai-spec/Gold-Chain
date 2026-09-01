import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/blocks", label: "Blocks" },
  { href: "/txs", label: "Transactions" },
  { href: "/tokens", label: "Tokens" },
  { href: "/search", label: "Search" },
  { href: "/solvency", label: "Solvency" },
  { href: "/bridge", label: "Bridge" },
  { href: "/redemption", label: "Redemption" },
  { href: "/gold", label: "GOLD" },
  { href: "/staking", label: "Staking" },
  { href: "/delegation", label: "Delegation" },
  { href: "/checkpoints", label: "Checkpoints" },
  { href: "/governance", label: "Governance" },
  { href: "/migration", label: "Migration" },
  { href: "/verify", label: "Verify" },
];

export function SiteNav() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand">
          GoldScan
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
