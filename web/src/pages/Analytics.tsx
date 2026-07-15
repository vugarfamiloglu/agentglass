import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { SpendChart } from "../components/SpendChart";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { ModelTable } from "../components/ModelTable";
import { ToolTable } from "../components/ToolTable";

export function Analytics() {
  const q = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(24) });
  const a = q.data;

  return (
    <div className="page">
      <div className="page-head between">
        <h1 className="page-title">Analytics</h1>
        <a className="btn-ghost mono" href="/api/export/traces.csv">
          ↓ Export CSV
        </a>
      </div>

      <section className="panel section-block">
        <div className="panel-head">
          <div className="panel-title">Spend</div>
          <div className="panel-note mono">last 24h · hourly · USD</div>
        </div>
        <div className="chart-wrap">
          <SpendChart points={a?.series ?? []} />
        </div>
      </section>

      <section className="panel section-block">
        <div className="panel-head">
          <div className="panel-title">Activity</div>
          <div className="panel-note mono">runs / day · last ~17 weeks</div>
        </div>
        <div className="hm-wrap">
          <ActivityHeatmap cells={a?.activity ?? []} />
        </div>
      </section>

      <div className="an-grid">
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">By model</div>
            <div className="panel-note mono">{a?.models.length ?? 0} models</div>
          </div>
          <ModelTable models={a?.models ?? []} />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">By tool</div>
            <div className="panel-note mono">{a?.tools.length ?? 0} tools</div>
          </div>
          <ToolTable tools={a?.tools ?? []} />
        </section>
      </div>
    </div>
  );
}
