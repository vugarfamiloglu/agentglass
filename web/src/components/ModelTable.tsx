import type { ModelStat } from "../lib/types";
import { compact, money } from "../lib/format";

export function ModelTable({ models }: { models: ModelStat[] }) {
  if (models.length === 0) return <div className="empty-note st-empty">No model calls yet.</div>;
  const max = Math.max(...models.map((m) => m.costUsd), 0.00001);
  return (
    <div className="stat-table">
      <div className="st-head mono model-cols">
        <span>MODEL</span>
        <span>CALLS</span>
        <span>TOKENS</span>
        <span>COST</span>
        <span />
      </div>
      {models.map((m) => (
        <div className="st-row model-cols" key={m.model}>
          <span className="st-name">{m.model}</span>
          <span className="mono">{compact(m.calls)}</span>
          <span className="mono u-muted">{compact(m.tokensIn + m.tokensOut)}</span>
          <span className="mono">{money(m.costUsd)}</span>
          <span className="st-bar-track">
            <span className="st-bar bar-cost" style={{ width: `${(m.costUsd / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
