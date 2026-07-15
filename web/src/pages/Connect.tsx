import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

const PORT = 4319;
const BASE = `http://localhost:${PORT}`;

export function Connect() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 4000 });

  return (
    <div className="page">
      <div className="page-head between">
        <h1 className="page-title">Connect</h1>
        <div className={`live-pill${health.isSuccess ? " is-live" : ""}`}>
          <span className="live-dot" />
          <span className="mono">
            {health.isSuccess ? `online · ${health.data?.traces ?? 0} traces` : "connecting…"}
          </span>
        </div>
      </div>

      <p className="connect-intro">
        Point your agent's base URL at AgentGlass. It transparently forwards to the real provider
        and records every call — no SDK, no code changes.
      </p>

      <div className="connect-grid">
        <section className="panel connect-panel">
          <div className="panel-head">
            <div className="panel-title">Anthropic · Claude</div>
            <span className="prov-badge mono">/v1/messages</span>
          </div>
          <pre className="code-block mono">
            <span className="code-comment"># any shell / SDK</span>
            {"\n"}
            <span className="code-key">export</span> ANTHROPIC_BASE_URL={BASE}
          </pre>
          <pre className="code-block mono">
            <span className="code-comment"># Claude Code, one-off</span>
            {"\n"}
            ANTHROPIC_BASE_URL={BASE} claude
          </pre>
        </section>

        <section className="panel connect-panel">
          <div className="panel-head">
            <div className="panel-title">OpenAI</div>
            <span className="prov-badge mono">/v1/chat/completions</span>
          </div>
          <pre className="code-block mono">
            <span className="code-comment"># any shell / SDK</span>
            {"\n"}
            <span className="code-key">export</span> OPENAI_BASE_URL={BASE}/v1
          </pre>
          <pre className="code-block mono">
            <span className="code-comment"># Python SDK</span>
            {"\n"}
            OpenAI(base_url=<span className="code-str">"{BASE}/v1"</span>)
          </pre>
        </section>
      </div>

      <section className="panel section-block">
        <div className="panel-head">
          <div className="panel-title">Group calls into one run</div>
          <span className="panel-note mono">optional</span>
        </div>
        <p className="connect-note">
          By default, calls that arrive close together are grouped into one trace. To group
          explicitly — one trace per agent task — send a session header with each request:
        </p>
        <pre className="code-block mono">
          <span className="code-key">x-agentglass-session</span>: refactor-auth-2024-06-01
        </pre>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">How it works</div>
        </div>
        <div className="flow mono">
          <span className="flow-node">your agent</span>
          <span className="flow-arrow">→</span>
          <span className="flow-node flow-glass">AgentGlass :{PORT}</span>
          <span className="flow-arrow">→</span>
          <span className="flow-node">Anthropic / OpenAI</span>
        </div>
        <p className="connect-note">
          Requests and streamed responses pass through untouched; model, tokens, cost, and latency
          are recorded on the way.
        </p>
      </section>
    </div>
  );
}
