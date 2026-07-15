import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";
import { compact, duration, modelShort, money } from "../lib/format";
import type { Span, Trace } from "../lib/types";
import { StatusPill } from "../components/StatusPill";

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: Trace[];
}) {
  return (
    <div className="diff-pick">
      <span className="diff-pick-label mono">{label}</span>
      <select className="diff-select mono" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">select a run…</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {modelShort(t.model)} · {money(t.costUsd)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface Metric {
  label: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  higherWorse?: boolean;
}

function DeltaCell({ m }: { m: Metric }) {
  const diff = m.b - m.a;
  if (diff === 0) return <span className="dm-delta flat mono">=</span>;
  const pct = m.a !== 0 ? (diff / m.a) * 100 : 100;
  const worse = m.higherWorse ? diff > 0 : diff < 0;
  const sign = diff > 0 ? "+" : "−";
  return (
    <span className={`dm-delta mono ${worse ? "worse" : "better"}`}>
      {sign}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function SpanList({ spans }: { spans: Span[] }) {
  return (
    <div className="diff-col">
      {spans.map((s) => (
        <div className="diff-span" key={s.id}>
          <span className={`span-badge badge-${s.status === "error" ? "error" : s.type === "tool" ? "tool" : "llm"}`}>
            {s.type === "llm" ? "LLM" : s.type.toUpperCase()}
          </span>
          <span className="diff-span-name">{s.type === "llm" ? modelShort(s.model) : s.name}</span>
          <span className="mono u-muted diff-span-num">
            {s.type === "llm" ? compact(s.tokensIn + s.tokensOut) : duration(s.durationMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffView({ a, b }: { a: string; b: string }) {
  const qa = useQuery({ queryKey: ["trace", a], queryFn: () => api.spans(a) });
  const qb = useQuery({ queryKey: ["trace", b], queryFn: () => api.spans(b) });

  if (qa.isLoading || qb.isLoading) return <div className="empty">Loading runs…</div>;
  if (!qa.data || !qb.data) return <div className="empty">One of these runs could not be loaded.</div>;

  const ta = qa.data.trace;
  const tb = qb.data.trace;

  const metrics: Metric[] = [
    { label: "COST", a: ta.costUsd, b: tb.costUsd, fmt: money, higherWorse: true },
    { label: "TOKENS", a: ta.tokensIn + ta.tokensOut, b: tb.tokensIn + tb.tokensOut, fmt: compact, higherWorse: true },
    { label: "SPANS", a: ta.spanCount, b: tb.spanCount, fmt: (n) => String(n) },
    { label: "TOOL CALLS", a: ta.toolCount, b: tb.toolCount, fmt: (n) => String(n) },
    { label: "DURATION", a: ta.durationMs ?? 0, b: tb.durationMs ?? 0, fmt: duration, higherWorse: true },
  ];

  return (
    <>
      <div className="diff-cards">
        {[ta, tb].map((t, i) => (
          <div className="diff-card" key={t.id}>
            <div className="diff-card-tag mono">{i === 0 ? "A" : "B"}</div>
            <div className="diff-card-name">{t.name}</div>
            <div className="diff-card-meta mono">
              {modelShort(t.model)} · <StatusPill status={t.status} />
            </div>
          </div>
        ))}
      </div>

      <section className="panel section-block">
        <div className="panel-head">
          <div className="panel-title">Metrics</div>
        </div>
        {metrics.map((m) => (
          <div className="diff-metric" key={m.label}>
            <span className="dm-a mono">{m.fmt(m.a)}</span>
            <span className="dm-label mono">{m.label}</span>
            <DeltaCell m={m} />
            <span className="dm-b mono">{m.fmt(m.b)}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Spans</div>
          <div className="panel-note mono">
            {ta.spanCount} vs {tb.spanCount}
          </div>
        </div>
        <div className="diff-spans">
          <SpanList spans={qa.data.spans} />
          <SpanList spans={qb.data.spans} />
        </div>
      </section>
    </>
  );
}

export function Diff() {
  const params = useParams();
  const [a, setA] = useState(params.a ?? "");
  const [b, setB] = useState(params.b ?? "");

  const list = useQuery({ queryKey: ["traces", "diff-options"], queryFn: () => api.traces({ limit: 80 }) });
  const options = list.data?.traces ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Compare runs</h1>
      </div>

      <div className="diff-pickers">
        <Picker label="A" value={a} onChange={setA} options={options} />
        <span className="diff-vs mono">⇄</span>
        <Picker label="B" value={b} onChange={setB} options={options} />
      </div>

      {a && b && a !== b ? (
        <DiffView a={a} b={b} />
      ) : (
        <div className="panel empty-panel">
          <div className="empty-glyph mono">⇄</div>
          <div className="empty-note">Pick two different runs to compare them side by side.</div>
        </div>
      )}
    </div>
  );
}
