import { useState } from "react";

import { compact, money } from "../lib/format";
import { ChartTip } from "./ChartTip";
import type { Span } from "../lib/types";

const W = 760;
const H = 130;
const GAP = 6;

/** Per-LLM-call input size across a run — how the context window grows, and how
 *  much of each call was served from cache. Hand-rolled stacked SVG bars. */
export function ContextChart({ spans }: { spans: Span[] }) {
  const [at, setAt] = useState<number | null>(null);

  const llm = spans.filter((s) => s.type === "llm");
  if (llm.length < 2) return null;

  const totals = llm.map((s) => s.tokensIn + s.tokensCache);
  const max = Math.max(...totals, 1);
  const peak = Math.max(...totals);
  const bw = (W - GAP * (llm.length - 1)) / llm.length;
  const barHeight = (total: number) => (total / max) * (H - 4);

  const call = at === null ? null : llm[at]!;
  const xPct = at === null ? 0 : ((at * (bw + GAP) + bw / 2) / W) * 100;
  // The readout is taller than the chart, so anchoring it to the bar top would
  // push it up into the panel header. The column it belongs to is already
  // unmistakable — everything else is dimmed — so x carries the meaning and y
  // just stays put.
  const yPct = 50;

  return (
    <section className="panel section-block">
      <div className="panel-head">
        <div className="panel-title">Context window</div>
        <div className="ctx-legend mono">
          <span className="ctx-key">
            <i className="ctx-sw sw-fresh" /> input
          </span>
          <span className="ctx-key">
            <i className="ctx-sw sw-cache" /> cached
          </span>
          <span className="ctx-peak">peak {compact(peak)} tok</span>
        </div>
      </div>
      <div className="ctx-wrap">
        <div className="chart-hit" onMouseLeave={() => setAt(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="ctx-chart" preserveAspectRatio="none">
            {llm.map((s, i) => {
              const x = i * (bw + GAP);
              const th = barHeight(totals[i]!);
              const ch = (s.tokensCache / max) * (H - 4);
              const dim = at !== null && at !== i ? " is-dim" : "";
              return (
                <g key={s.id}>
                  <rect x={x} y={H - th} width={bw} height={th} className={`ctx-bar-fresh${dim}`} rx="2" />
                  {ch > 0 && (
                    <rect x={x} y={H - ch} width={bw} height={ch} className={`ctx-bar-cache${dim}`} rx="2" />
                  )}
                </g>
              );
            })}
            {/* Full-height hit columns, drawn last so they sit above the bars.
                Catching the gaps too makes a thin bar easy to land on. */}
            {llm.map((s, i) => (
              <rect
                key={`hit-${s.id}`}
                x={i * (bw + GAP)}
                y={0}
                width={bw + GAP}
                height={H}
                fill="transparent"
                onMouseEnter={() => setAt(i)}
              />
            ))}
          </svg>

          {call && (
            <ChartTip
              x={`${xPct}%`}
              y={`${yPct}%`}
              flip={xPct > 62}
              title={`call ${at! + 1} of ${llm.length}`}
              rows={[
                { label: "input", value: compact(call.tokensIn), swatch: "var(--violet)" },
                { label: "cached", value: compact(call.tokensCache), swatch: "var(--cyan)" },
                { label: "total", value: `${compact(totals[at!]!)} tok` },
                { label: "cost", value: money(call.costUsd) },
              ]}
            />
          )}
        </div>
      </div>
    </section>
  );
}
