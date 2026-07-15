import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { ago, compact, duration, modelShort, money } from "../lib/format";
import type { Trace } from "../lib/types";
import { StatCard } from "../components/StatCard";
import { SpendChart } from "../components/SpendChart";
import { StatusPill } from "../components/StatusPill";

function mergeRuns(live: Trace[], page: Trace[]): Trace[] {
  const seen = new Set<string>();
  const out: Trace[] = [];
  for (const t of [...live, ...page]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt).slice(0, 13);
}

export function Overview() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api.stats() });
  const series = useQuery({ queryKey: ["series"], queryFn: () => api.series(24) });
  const page = useQuery({ queryKey: ["traces", "recent"], queryFn: () => api.traces({ limit: 12 }) });
  const live = useLive();

  const s = stats.data;
  const errorRate = s && s.runs > 0 ? (s.errors / s.runs) * 100 : 0;
  const recent = mergeRuns(live.traces, page.data?.traces ?? []);

  if (stats.isSuccess && s && s.runs === 0) {
    return <EmptyConnect />;
  }

  return (
    <div className="page">
      <div className="page-head between">
        <h1 className="page-title">Overview</h1>
        <span className="head-note mono">all runs · updates live</span>
      </div>

      <div className="stat-grid">
        <StatCard label="RUNS" value={compact(s?.runs ?? 0)} sub={`${s?.running ?? 0} running now`} accent="cyan" />
        <StatCard label="SPEND" value={money(s?.costUsd ?? 0)} sub="all-time" accent="violet" />
        <StatCard
          label="TOKENS"
          value={compact((s?.tokensIn ?? 0) + (s?.tokensOut ?? 0))}
          sub={`${compact(s?.tokensCache ?? 0)} cached`}
        />
        <StatCard label="TOOL CALLS" value={compact(s?.toolCalls ?? 0)} />
        <StatCard
          label="ERROR RATE"
          value={`${errorRate.toFixed(1)}%`}
          sub={`${s?.errors ?? 0} failed`}
          accent={errorRate > 10 ? "rose" : "neutral"}
        />
        <StatCard label="AVG LATENCY" value={duration(s?.avgDurationMs ?? 0)} accent="amber" />
      </div>

      <section className="panel section-block">
        <div className="panel-head">
          <div className="panel-title">Spend</div>
          <div className="panel-note mono">last 24h · hourly · USD</div>
        </div>
        <div className="chart-wrap">
          <SpendChart points={series.data ?? []} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Recent runs</div>
          <Link to="/traces" className="panel-link mono">
            all traces →
          </Link>
        </div>
        <div className="runs">
          <div className="run-head mono run-cols">
            <span>RUN</span>
            <span>MODEL</span>
            <span>STATUS</span>
            <span>TOKENS</span>
            <span>COST</span>
            <span>WHEN</span>
          </div>
          {recent.map((t) => (
            <Link to={`/traces/${t.id}`} className="run-row run-cols" key={t.id}>
              <span className="run-name">{t.name}</span>
              <span className="mono u-muted">{modelShort(t.model)}</span>
              <span>
                <StatusPill status={t.status} />
              </span>
              <span className="mono">{compact(t.tokensIn + t.tokensOut)}</span>
              <span className="mono">{money(t.costUsd)}</span>
              <span className="mono u-muted">{ago(t.startedAt)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyConnect() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-kicker mono">AGENT OBSERVABILITY</div>
        <h1 className="hero-title">
          Your agents are black boxes.
          <br />
          <span className="hero-accent">AgentGlass makes them glass.</span>
        </h1>
        <p className="hero-sub">
          Point your agent's base URL at AgentGlass and every LLM call, tool invocation, token, and
          dollar shows up here. Waiting for your first run…
        </p>
      </section>
      <section className="connect-card panel">
        <div className="panel-head">
          <div className="panel-title">Start capturing</div>
        </div>
        <pre className="code-block mono">
          <span className="code-comment"># Claude / Anthropic SDK</span>
          {"\n"}
          <span className="code-key">export</span> ANTHROPIC_BASE_URL=http://localhost:4319
          {"\n\n"}
          <span className="code-comment"># OpenAI SDK</span>
          {"\n"}
          <span className="code-key">export</span> OPENAI_BASE_URL=http://localhost:4319/v1
        </pre>
      </section>
    </div>
  );
}
