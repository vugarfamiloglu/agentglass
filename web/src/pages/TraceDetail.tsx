import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../lib/api";
import { ago, compact, duration, modelShort, money } from "../lib/format";
import type { Span } from "../lib/types";
import { StatusPill } from "../components/StatusPill";
import { ContextChart } from "../components/ContextChart";

function pretty(v: unknown): string {
  if (v == null) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function spanTone(span: Span): "llm" | "tool" | "error" {
  if (span.status === "error") return "error";
  return span.type === "tool" ? "tool" : "llm";
}

function SpanRow({ span, traceStart, traceDur }: { span: Span; traceStart: number; traceDur: number }) {
  const [open, setOpen] = useState(false);
  const offset = Math.max(0, span.startedAt - traceStart);
  const dur = span.durationMs ?? 0;
  const left = traceDur > 0 ? (offset / traceDur) * 100 : 0;
  const width = traceDur > 0 ? Math.max(0.8, (dur / traceDur) * 100) : 2;
  const tone = spanTone(span);
  const label = span.type === "llm" ? modelShort(span.model) : span.name;

  return (
    <div className={`span${open ? " is-open" : ""}`}>
      <button className="span-row span-cols" onClick={() => setOpen((o) => !o)}>
        <span className={`span-badge badge-${tone}`}>{span.type === "llm" ? "LLM" : span.type.toUpperCase()}</span>
        <span className="span-name">
          {label}
          {span.status === "error" && <span className="span-err mono"> · failed</span>}
        </span>
        <span className="span-track">
          <span className={`span-bar bar-${tone}`} style={{ left: `${left}%`, width: `${width}%` }} />
        </span>
        <span className="mono span-num">{span.type === "llm" ? compact(span.tokensIn + span.tokensOut) : "—"}</span>
        <span className="mono span-num">{span.costUsd > 0 ? money(span.costUsd) : "—"}</span>
        <span className="mono span-num u-muted">{duration(span.durationMs)}</span>
      </button>
      {open && (
        <div className="span-detail">
          <div className="sd-meta mono">
            {span.model && <span>model {span.model}</span>}
            <span>
              tokens {span.tokensIn} in · {span.tokensOut} out · {span.tokensCache} cache
            </span>
            {span.costUsd > 0 && <span>cost {money(span.costUsd)}</span>}
            <span>latency {duration(span.durationMs)}</span>
          </div>
          {span.error && <div className="sd-error mono">{span.error}</div>}
          <div className="sd-io">
            <div className="sd-col">
              <div className="sd-label mono">INPUT</div>
              <pre className="sd-json mono">{pretty(span.input)}</pre>
            </div>
            <div className="sd-col">
              <div className="sd-label mono">OUTPUT</div>
              <pre className="sd-json mono">{pretty(span.output)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip">
      <span className="chip-label mono">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  );
}

export function TraceDetail() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["trace", id],
    queryFn: () => api.spans(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.trace.status === "running" ? 1500 : false),
  });

  if (query.isLoading) return <div className="empty">Loading trace…</div>;
  if (query.isError || !query.data) return <div className="empty">Trace not found.</div>;

  const { trace, spans } = query.data;
  const traceStart = trace.startedAt;
  const traceEnd =
    trace.endedAt ?? Math.max(traceStart, ...spans.map((s) => s.endedAt ?? s.startedAt), traceStart);
  const traceDur = Math.max(1, traceEnd - traceStart);
  const totalTokens = trace.tokensIn + trace.tokensOut;

  return (
    <div className="page">
      <div className="page-head">
        <Link to="/traces" className="back-link mono">
          ← Traces
        </Link>
        <div className="between">
          <h1 className="page-title">{trace.name}</h1>
          <div className="detail-actions">
            <Link to={`/diff/${trace.id}`} className="mini-link mono">
              compare ⇄
            </Link>
            <StatusPill status={trace.status} />
          </div>
        </div>
        <div className="detail-meta mono">
          {modelShort(trace.model)} · {trace.source} · started {ago(traceStart)}
        </div>
      </div>

      <div className="chip-row">
        <Chip label="DURATION" value={duration(trace.durationMs ?? traceDur)} />
        <Chip label="SPANS" value={String(trace.spanCount)} />
        <Chip label="TOOL CALLS" value={String(trace.toolCount)} />
        <Chip label="TOKENS" value={compact(totalTokens)} />
        <Chip label="CACHED" value={compact(trace.tokensCache)} />
        <Chip label="COST" value={money(trace.costUsd)} />
      </div>

      {trace.error && <div className="trace-error mono">{trace.error}</div>}

      <ContextChart spans={spans} />

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Timeline</div>
          <div className="panel-note mono">{spans.length} spans · click to expand</div>
        </div>
        <div className="spans">
          {spans.map((s) => (
            <SpanRow key={s.id} span={s} traceStart={traceStart} traceDur={traceDur} />
          ))}
        </div>
      </section>
    </div>
  );
}
