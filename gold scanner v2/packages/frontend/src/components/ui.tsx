import type { ReactNode } from "react";

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="json-block" data-testid="json-block">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function FinalityBadge({ status }: { status: string }) {
  const cls =
    status === "finalized"
      ? "badge-finalized"
      : status === "pending"
        ? "badge-pending"
        : "badge-reverted";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function SectionCard({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="card" data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
