export interface TipRow {
  label: string;
  value: string;
  /** CSS colour for the swatch; omit for a row with no series behind it. */
  swatch?: string;
}

interface ChartTipProps {
  /** CSS left/top — a percentage for SVG charts, px for the activity grid. */
  x: string;
  y: string;
  /** Render to the left of the anchor, for points near the right edge. */
  flip?: boolean;
  title: string;
  rows: TipRow[];
}

/**
 * The readout every chart shares. Anchored to a data point, never to the raw
 * cursor — a number that drifts between points isn't a number you can trust.
 * It never takes the pointer, so it can't fight the chart underneath it.
 */
export function ChartTip({ x, y, flip = false, title, rows }: ChartTipProps) {
  return (
    <div className={`tip${flip ? " is-flipped" : ""}`} style={{ left: x, top: y }} aria-hidden="true">
      <div className="tip-title mono">{title}</div>
      {rows.map((r) => (
        <div className="tip-row" key={r.label}>
          <span className="tip-label mono">
            {r.swatch && <i className="tip-sw" style={{ background: r.swatch }} />}
            {r.label}
          </span>
          <span className="tip-value mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
