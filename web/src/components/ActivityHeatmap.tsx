import type { ActivityCell } from "../lib/types";

/** GitHub-style contribution grid: weeks as columns, weekdays as rows, cells
 *  shaded by run count. No chart library — plain positioned squares. */
export function ActivityHeatmap({ cells }: { cells: ActivityCell[] }) {
  if (cells.length === 0) return <div className="empty-note">No activity yet.</div>;

  const max = Math.max(...cells.map((c) => c.count), 1);
  const level = (count: number) => {
    if (count === 0) return 0;
    if (count <= max * 0.25) return 1;
    if (count <= max * 0.5) return 2;
    if (count <= max * 0.75) return 3;
    return 4;
  };

  // Pad the front so the first cell falls on its correct weekday row.
  const firstWeekday = new Date(cells[0]!.day).getDay();
  const padded: (ActivityCell | null)[] = [...Array<null>(firstWeekday).fill(null), ...cells];
  const weeks: (ActivityCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  return (
    <div className="heatmap">
      {weeks.map((week, wi) => (
        <div className="hm-col" key={wi}>
          {Array.from({ length: 7 }).map((_, di) => {
            const cell = week[di];
            if (!cell) return <span className="hm-cell hm-empty" key={di} />;
            return (
              <span
                className={`hm-cell hm-l${level(cell.count)}`}
                key={di}
                title={`${new Date(cell.day).toLocaleDateString()} · ${cell.count} runs`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
