import type { Span } from "../lib/types";
import { compact } from "../lib/format";

/** Per-LLM-call input size across a run — how the context window grows, and how
 *  much of each call was served from cache. Hand-rolled stacked SVG bars. */
export function ContextChart({ spans }: { spans: Span[] }) {
  const llm = spans.filter((s) => s.type === "llm");
  if (llm.length < 2) return null;

  const W = 760;
  const H = 130;
  const gap = 6;
  const totals = llm.map((s) => s.tokensIn + s.tokensCache);
  const max = Math.max(...totals, 1);
  const peak = Math.max(...totals);
  const bw = (W - gap * (llm.length - 1)) / llm.length;

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
        <svg viewBox={`0 0 ${W} ${H}`} className="ctx-chart" preserveAspectRatio="none">
          {llm.map((s, i) => {
            const x = i * (bw + gap);
            const total = s.tokensIn + s.tokensCache;
            const th = (total / max) * (H - 4);
            const ch = (s.tokensCache / max) * (H - 4);
            return (
              <g key={s.id}>
                <rect x={x} y={H - th} width={bw} height={th} className="ctx-bar-fresh" rx="2" />
                {ch > 0 && (
                  <rect x={x} y={H - ch} width={bw} height={ch} className="ctx-bar-cache" rx="2" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
