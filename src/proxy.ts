/**
 * The recording proxy — the whole point of AgentGlass. A client sets its base
 * URL to us; we transparently forward each call to the real provider (streaming
 * preserved) and record model, messages, usage, cost, and latency in between.
 *
 * Golden rule: recording must NEVER change or break the response the client
 * gets. Every record path is wrapped so a bug here can't take down an agent.
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { costOf } from "./pricing.js";
import type { Store } from "./db.js";
import type { Hub } from "./hub.js";
import type { TraceSource } from "./types.js";

const ANTHROPIC_URL = process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com";
const OPENAI_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com";

interface Usage {
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
}

interface Provider {
  source: TraceSource;
  target: (path: string) => string;
  /** Request headers to forward to the upstream API. */
  authHeaders: string[];
  model: (body: Record<string, unknown>) => string;
  usageFromJson: (json: Record<string, unknown>) => Usage;
  usageFromStream: (sse: string) => Usage;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const ANTHROPIC: Provider = {
  source: "anthropic",
  target: (p) => `${ANTHROPIC_URL}${p}`,
  authHeaders: ["x-api-key", "authorization", "anthropic-version", "anthropic-beta", "content-type"],
  model: (b) => String(b.model ?? "claude"),
  usageFromJson: (j) => {
    const u = (j.usage ?? {}) as Record<string, unknown>;
    return {
      tokensIn: num(u.input_tokens),
      tokensOut: num(u.output_tokens),
      tokensCache: num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens),
    };
  },
  usageFromStream: (sse) => {
    let tokensIn = 0;
    let tokensOut = 0;
    let tokensCache = 0;
    for (const data of sseData(sse)) {
      const u = (data.usage ?? (data.message as Record<string, unknown>)?.usage) as
        | Record<string, unknown>
        | undefined;
      if (!u) continue;
      if (u.input_tokens != null) tokensIn = num(u.input_tokens);
      if (u.output_tokens != null) tokensOut = num(u.output_tokens);
      tokensCache = num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens) || tokensCache;
    }
    return { tokensIn, tokensOut, tokensCache };
  },
};

const OPENAI: Provider = {
  source: "openai",
  target: (p) => `${OPENAI_URL}${p}`,
  authHeaders: ["authorization", "openai-organization", "openai-project", "openai-beta", "content-type"],
  model: (b) => String(b.model ?? "gpt"),
  usageFromJson: (j) => {
    const u = (j.usage ?? {}) as Record<string, unknown>;
    const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
    return {
      tokensIn: num(u.prompt_tokens),
      tokensOut: num(u.completion_tokens),
      tokensCache: num(details.cached_tokens),
    };
  },
  usageFromStream: (sse) => {
    let usage: Usage = { tokensIn: 0, tokensOut: 0, tokensCache: 0 };
    for (const data of sseData(sse)) {
      const u = data.usage as Record<string, unknown> | undefined;
      if (u) {
        const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
        usage = {
          tokensIn: num(u.prompt_tokens),
          tokensOut: num(u.completion_tokens),
          tokensCache: num(details.cached_tokens),
        };
      }
    }
    return usage;
  },
};

/** Parse `data: {...}` lines out of an SSE payload into JSON objects. */
function sseData(sse: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of sse.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      out.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      /* partial/non-JSON event — ignore */
    }
  }
  return out;
}

/** Best-effort run name from the last user message in the request. */
function runNameFrom(body: Record<string, unknown>): string {
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as { role?: string; content?: unknown };
      if (m.role !== "user") continue;
      let text = "";
      if (typeof m.content === "string") text = m.content;
      else if (Array.isArray(m.content)) {
        const part = m.content.find((p: { type?: string }) => p.type === "text") as
          | { text?: string }
          | undefined;
        text = part?.text ?? "";
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text) return text.length > 56 ? `${text.slice(0, 56)}…` : text;
    }
  }
  return "Agent run";
}

/** Groups a provider's successive calls into one trace by session + idle window. */
export class Correlator {
  private sessions = new Map<string, { traceId: string; lastAt: number }>();
  private readonly reuseMs = 60_000;
  private readonly idleMs = 90_000;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: Store,
    private hub: Hub,
  ) {}

  resolve(key: string, source: TraceSource, model: string, runName: string): string {
    const now = Date.now();
    const existing = this.sessions.get(key);
    if (existing && now - existing.lastAt < this.reuseMs) {
      const trace = this.store.getTrace(existing.traceId);
      if (trace && trace.status === "running") {
        existing.lastAt = now;
        return existing.traceId;
      }
    }
    const trace = this.store.createTrace({ name: runName, source, model });
    this.sessions.set(key, { traceId: trace.id, lastAt: now });
    this.hub.broadcast({ type: "trace.start", trace });
    return trace.id;
  }

  startSweeper(): void {
    this.timer = setInterval(() => this.sweep(), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, s] of this.sessions) {
      if (now - s.lastAt <= this.idleMs) continue;
      const trace = this.store.getTrace(s.traceId);
      if (trace && trace.status === "running") {
        const finished = this.store.finishTrace(s.traceId, "ok", s.lastAt);
        if (finished) this.hub.broadcast({ type: "trace.end", trace: finished });
      }
      this.sessions.delete(key);
    }
  }
}

function forwardHeaders(provider: Provider, raw: Headers): Headers {
  const headers = new Headers();
  for (const name of provider.authHeaders) {
    const value = raw.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function handle(
  c: Context,
  provider: Provider,
  store: Store,
  hub: Hub,
  correlator: Correlator,
): Promise<Response> {
  const path = new URL(c.req.url).pathname;
  const rawBody = await c.req.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    /* non-JSON body — forward as-is, record nothing structured */
  }

  const model = provider.model(body);
  const sessionKey =
    c.req.header("x-agentglass-session") ?? c.req.header("x-agentglass-trace") ?? `${provider.source}:default`;
  const started = Date.now();

  let upstream: Response;
  try {
    upstream = await fetch(provider.target(path), {
      method: "POST",
      headers: forwardHeaders(provider, new Headers(c.req.raw.headers)),
      body: rawBody,
    });
  } catch (err) {
    // Upstream unreachable — record the failure, surface a clean error.
    record(store, hub, correlator, {
      sessionKey,
      source: provider.source,
      model,
      runName: runNameFrom(body),
      started,
      ended: Date.now(),
      usage: { tokensIn: 0, tokensOut: 0, tokensCache: 0 },
      status: "error",
      error: err instanceof Error ? err.message : "upstream fetch failed",
      input: body,
      output: null,
    });
    return c.json({ error: { type: "agentglass_proxy_error", message: "upstream unreachable" } }, 502);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const isStream = contentType.includes("event-stream") || body.stream === true;
  const ok = upstream.ok;

  const commit = (usage: Usage, output: unknown, err: string | null) =>
    record(store, hub, correlator, {
      sessionKey,
      source: provider.source,
      model,
      runName: runNameFrom(body),
      started,
      ended: Date.now(),
      usage,
      status: ok && !err ? "ok" : "error",
      error: err ?? (ok ? null : `upstream ${upstream.status}`),
      input: body,
      output,
    });

  if (isStream && upstream.body) {
    // Tee: one copy streams to the client untouched, the other we parse.
    const [toClient, toRecord] = upstream.body.tee();
    void streamText(toRecord).then((sse) => {
      try {
        commit(provider.usageFromStream(sse), { streamed: true }, ok ? null : sse.slice(0, 400));
      } catch {
        /* recording is best-effort */
      }
    });
    const headers = new Headers();
    headers.set("content-type", contentType);
    const cc = upstream.headers.get("cache-control");
    if (cc) headers.set("cache-control", cc);
    return new Response(toClient, { status: upstream.status, headers });
  }

  const text = await upstream.text();
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    commit(provider.usageFromJson(json), ok ? json : null, ok ? null : text.slice(0, 400));
  } catch {
    commit({ tokensIn: 0, tokensOut: 0, tokensCache: 0 }, null, ok ? null : text.slice(0, 400));
  }
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

interface RecordInput {
  sessionKey: string;
  source: TraceSource;
  model: string;
  runName: string;
  started: number;
  ended: number;
  usage: Usage;
  status: "ok" | "error";
  error: string | null;
  input: unknown;
  output: unknown;
}

function record(store: Store, hub: Hub, correlator: Correlator, r: RecordInput): void {
  try {
    const traceId = correlator.resolve(r.sessionKey, r.source, r.model, r.runName);
    const cost = costOf(r.model, r.usage.tokensIn, r.usage.tokensOut, r.usage.tokensCache);
    const span = store.addSpan({
      traceId,
      type: "llm",
      name: r.model,
      model: r.model,
      status: r.status,
      startedAt: r.started,
      endedAt: r.ended,
      tokensIn: r.usage.tokensIn,
      tokensOut: r.usage.tokensOut,
      tokensCache: r.usage.tokensCache,
      costUsd: cost,
      input: r.input,
      output: r.output,
      error: r.error,
    });
    hub.broadcast({ type: "span.add", span });
    const trace = store.getTrace(traceId);
    if (trace) hub.broadcast({ type: "trace.update", trace });
  } catch {
    /* never let recording affect the proxied response */
  }
}

export function proxyRoutes(store: Store, hub: Hub, correlator: Correlator): Hono {
  const proxy = new Hono();
  proxy.post("/v1/messages", (c) => handle(c, ANTHROPIC, store, hub, correlator));
  proxy.post("/v1/chat/completions", (c) => handle(c, OPENAI, store, hub, correlator));
  return proxy;
}
