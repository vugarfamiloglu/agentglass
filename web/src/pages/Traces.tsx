import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { ago, compact, duration, modelShort, money } from "../lib/format";
import { StatusPill } from "../components/StatusPill";

const STATUSES = ["all", "ok", "error", "running"] as const;

export function Traces() {
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);

  const query = useQuery({
    queryKey: ["traces", "list", status, q, limit],
    queryFn: () =>
      api.traces({ status: status === "all" ? undefined : status, q: q || undefined, limit }),
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const traces = data?.traces ?? [];

  return (
    <div className="page">
      <div className="page-head between">
        <h1 className="page-title">Traces</h1>
        <span className="head-note mono">{data?.total ?? 0} total</span>
      </div>

      <div className="toolbar">
        <div className="tb-search">
          <span className="search-icon mono">⌕</span>
          <input
            className="search-input"
            placeholder="Search by run name or model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="seg">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`seg-btn mono${status === s ? " is-on" : ""}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="tr-head mono tr-cols">
          <span>RUN</span>
          <span>MODEL</span>
          <span>STATUS</span>
          <span>SPANS</span>
          <span>TOKENS</span>
          <span>COST</span>
          <span>DURATION</span>
          <span>WHEN</span>
        </div>
        {traces.map((t) => (
          <Link to={`/traces/${t.id}`} key={t.id} className="tr-row tr-cols">
            <span className="run-name">{t.name}</span>
            <span className="mono u-muted">{modelShort(t.model)}</span>
            <span>
              <StatusPill status={t.status} />
            </span>
            <span className="mono">{t.spanCount}</span>
            <span className="mono">{compact(t.tokensIn + t.tokensOut)}</span>
            <span className="mono">{money(t.costUsd)}</span>
            <span className="mono u-muted">{duration(t.durationMs)}</span>
            <span className="mono u-muted">{ago(t.startedAt)}</span>
          </Link>
        ))}
        {traces.length === 0 && !query.isLoading && (
          <div className="empty-panel">
            <div className="empty-glyph mono">◍</div>
            <div className="empty-note">No traces match these filters.</div>
          </div>
        )}
      </div>

      {data && traces.length < data.total && (
        <div className="load-more">
          <button className="btn-ghost mono" onClick={() => setLimit((l) => l + 50)}>
            Load more · {traces.length} / {data.total}
          </button>
        </div>
      )}
    </div>
  );
}
