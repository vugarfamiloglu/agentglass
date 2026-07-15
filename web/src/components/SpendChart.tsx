import type { SeriesPoint } from "../lib/types";

/** Hand-rolled SVG area chart of hourly cost. No chart library — just paths. */
export function SpendChart({ points }: { points: SeriesPoint[] }) {
  const W = 760;
  const H = 150;
  const PAD = 8;

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

  return (
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
  );
}
