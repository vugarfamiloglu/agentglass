import { Link } from "react-router-dom";

import { useLive } from "../lib/live";
import { ago, compact, modelShort, money } from "../lib/format";
import { StatusPill } from "../components/StatusPill";

export function Live() {
  const { traces, connected } = useLive();
  return (
    <div className="page">
      <div className="page-head between">
        <h1 className="page-title">Live</h1>
        <div className={`live-pill${connected ? " is-live" : ""}`}>
          <span className="live-dot" />
          <span className="mono">{connected ? "streaming" : "offline"}</span>
        </div>
      </div>
      <div className="panel">
        <div className="run-head mono run-cols">
          <span>RUN</span>
          <span>MODEL</span>
          <span>STATUS</span>
          <span>TOKENS</span>
          <span>COST</span>
          <span>WHEN</span>
        </div>
        {traces.length === 0 ? (
          <div className="empty-panel">
            <div className="empty-glyph mono">◍</div>
            <div className="empty-note">Waiting for runs — they appear here the instant they start.</div>
          </div>
        ) : (
          traces.map((t) => (
            <Link to={`/traces/${t.id}`} key={t.id} className="run-row run-cols">
              <span className="run-name">{t.name}</span>
              <span className="mono u-muted model-cell">{modelShort(t.model)}</span>
              <span>
                <StatusPill status={t.status} />
              </span>
              <span className="mono">{compact(t.tokensIn + t.tokensOut)}</span>
              <span className="mono">{money(t.costUsd)}</span>
              <span className="mono u-muted">{ago(t.startedAt)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
