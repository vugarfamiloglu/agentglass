import type { ToolStat } from "../lib/types";
import { compact } from "../lib/format";

export function ToolTable({ tools }: { tools: ToolStat[] }) {
  if (tools.length === 0) return <div className="empty-note st-empty">No tool calls yet.</div>;
  const max = Math.max(...tools.map((t) => t.calls), 1);
  return (
    <div className="stat-table">
      <div className="st-head mono tool-cols">
        <span>TOOL</span>
        <span>CALLS</span>
        <span>ERRORS</span>
        <span />
      </div>
      {tools.map((t) => (
        <div className="st-row tool-cols" key={t.tool}>
          <span className="st-name mono">{t.tool}</span>
          <span className="mono">{compact(t.calls)}</span>
          <span className={`mono ${t.errors > 0 ? "u-rose" : "u-muted"}`}>{t.errors}</span>
          <span className="st-bar-track">
            <span className="st-bar bar-tool" style={{ width: `${(t.calls / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
