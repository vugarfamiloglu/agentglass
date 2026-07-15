import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

// Phase 0 overview: a connect hero + live health. The full dashboard (stats,
// charts, recent runs, and the AI rail) replaces this once traces flow in.
export function Overview() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 4000 });
  const traces = health.data?.traces ?? 0;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-kicker mono">AGENT OBSERVABILITY</div>
        <h1 className="hero-title">
          Your agents are black boxes.
          <br />
          <span className="hero-accent">Glasswing makes them glass.</span>
        </h1>
        <p className="hero-sub">
          Capture every LLM call, tool invocation, token, and dollar your agents spend — then
          inspect and replay the whole run. No SDK, no code changes: just point your agent here.
        </p>
      </section>

      <section className="connect-card panel">
        <div className="panel-head">
          <div className="panel-title">Start capturing</div>
          <div className={`live-pill${health.isSuccess ? " is-live" : ""}`}>
            <span className="live-dot" />
            <span className="mono">{health.isSuccess ? "server online" : "connecting…"}</span>
          </div>
        </div>
        <p className="connect-lead">
          Set your agent's base URL to Glasswing. It transparently forwards to Anthropic or OpenAI
          and records everything in between.
        </p>
        <pre className="code-block mono">
          <span className="code-comment"># Claude / Anthropic SDK</span>
          {"\n"}
          <span className="code-key">export</span> ANTHROPIC_BASE_URL=http://localhost:4319
          {"\n\n"}
          <span className="code-comment"># OpenAI SDK</span>
          {"\n"}
          <span className="code-key">export</span> OPENAI_BASE_URL=http://localhost:4319/v1
        </pre>
        <div className="connect-foot mono">
          {traces > 0
            ? `${traces} trace${traces === 1 ? "" : "s"} captured so far`
            : "waiting for your first trace…"}
        </div>
      </section>
    </div>
  );
}
