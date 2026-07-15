import type { ReactNode } from "react";

type Accent = "cyan" | "violet" | "rose" | "amber" | "neutral";

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: Accent;
}

export function StatCard({ label, value, sub, accent = "neutral" }: StatCardProps) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-label mono">{label}</div>
      <div className="stat-value">{value}</div>
      {sub != null && <div className="stat-sub mono">{sub}</div>}
    </div>
  );
}
