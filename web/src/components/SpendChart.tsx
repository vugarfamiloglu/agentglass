import { useState, type MouseEvent } from "react";

import { hourStamp, money } from "../lib/format";
import { ChartTip } from "./ChartTip";
import type { SeriesPoint } from "../lib/types";

const W = 760;
const H = 150;
const PAD = 8;

/** Hand-rolled SVG area chart of hourly cost. No chart library — just paths. */
export function SpendChart({ points }: { points: SeriesPoint[] }) {
  const [at, setAt] = useState<number | null>(null);

  if (points.length < 2) {
    return <div className="chart-empty mono">gathering data…</div>;
  }

  const max = Math.max(...points.map((p) => p.cost), 0.00001);
  const step = W / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = H - PAD - (p.cost / max) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  // Snap to the nearest hour instead of tracking the cursor freely: a reading
  // that lands between two points is a reading that was never measured.
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const ratio = (e.clientX - box.left) / box.width;
    const i = Math.round(ratio * (points.length - 1));
    setAt(Math.max(0, Math.min(points.length - 1, i)));
  };

  const point = at === null ? null : points[at];
  const xPct = at === null ? 0 : (at / (points.length - 1)) * 100;
  const dotPct = at === null ? 0 : (coords[at]![1] / H) * 100;
  // The dot rides the line, but the readout is centred on its anchor and would
  // hang out of the chart at a peak or a trough — hold it inside.
  const tipPct = Math.min(Math.max(dotPct, 30), 70);

  return (
    <div className="chart-hit" onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38e1c8" stopOpacity="0.32" />
            <stop offset="1" stopColor="#38e1c8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="spend-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38e1c8" />
            <stop offset="1" stopColor="#8b7bff" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spend-fill)" />
        <path d={line} fill="none" stroke="url(#spend-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* The crosshair and dot live in HTML, not SVG: the viewBox is stretched
          non-uniformly, which would squash a circle into an ellipse. */}
      {point && (
        <>
          <span className="chart-cross" style={{ left: `${xPct}%` }} />
          <span className="chart-dot" style={{ left: `${xPct}%`, top: `${dotPct}%` }} />
          <ChartTip
            x={`${xPct}%`}
            y={`${tipPct}%`}
            flip={xPct > 62}
            title={hourStamp(point.t)}
            rows={[
              { label: "spend", value: money(point.cost), swatch: "var(--cyan)" },
              { label: "runs", value: String(point.runs) },
            ]}
          />
        </>
      )}
    </div>
  );
}
