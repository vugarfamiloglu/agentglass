/**
 * The "ask your runs" assistant. It answers common questions locally by
 * computing over the trace store (works with no API key), and routes anything
 * open-ended to a configured LLM when a key has been added in Settings.
 */
import type { Store } from "./db.js";
import type { Vault } from "./vault.js";
import type { ModelStat, Span, ToolStat, Trace } from "./types.js";

// ---- small server-side formatters ----

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0";
}
function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

interface Context {
  stats: ReturnType<Store["stats"]>;
  models: ModelStat[];
  tools: ToolStat[];
  recent: Trace[];
  trace: { trace: Trace; priciest: Span | null } | null;
}

function buildContext(store: Store, traceId?: string): Context {
  let trace: Context["trace"] = null;
  if (traceId) {
    const t = store.getTrace(traceId);
    if (t) {
      const spans = store.getSpans(traceId);
      const priciest = spans.slice().sort((a, b) => b.costUsd - a.costUsd)[0] ?? null;
      trace = { trace: t, priciest };
    }
  }
  return {
    stats: store.stats(),
    models: store.byModel(),
    tools: store.byTool(),
    recent: store.listTraces({ limit: 8 }).traces,
    trace,
  };
}

function localAnswer(question: string, ctx: Context): string | null {
  const q = question.toLowerCase();
  const m = ctx.stats;

  if (ctx.trace && /\b(this run|this trace|cost so much|why did|what happened)\b/.test(q)) {
    const t = ctx.trace.trace;
    const p = ctx.trace.priciest;
    return (
      `**${t.name}** used ${compact(t.tokensIn + t.tokensOut)} tokens and cost ${money(t.costUsd)} across ${t.spanCount} spans (${t.toolCount} tool calls).` +
      (p ? `\n\nThe most expensive step was the ${p.type} call \`${p.name}\` at ${money(p.costUsd)}.` : "") +
      (t.status === "error" ? `\n\nThis run **failed**: ${t.error ?? "a step errored out"}.` : "")
    );
  }
  if (/\bmodels?\b/.test(q)) {
    return (
      `Cost by model:\n` +
      ctx.models
        .slice(0, 5)
        .map((x) => `- **${x.model}** — ${money(x.costUsd)} · ${x.calls} calls · ${compact(x.tokensIn + x.tokensOut)} tokens`)
        .join("\n")
    );
  }
  if (/\btools?\b/.test(q)) {
    return (
      `Most-used tools:\n` +
      ctx.tools
        .slice(0, 6)
        .map((x) => `- \`${x.tool}\` — ${x.calls} calls${x.errors ? ` (${x.errors} errors)` : ""}`)
        .join("\n")
    );
  }
  if (/\b(spend|spent|cost|expensive|budget|money|dollar|priciest)\b/.test(q) || /how much/.test(q)) {
    const top = ctx.models[0];
    return (
      `You've spent **${money(m.costUsd)}** across **${m.runs} runs**.` +
      (top ? `\n\nBiggest cost driver: **${top.model}** — ${money(top.costUsd)} over ${top.calls} calls.` : "")
    );
  }
  if (/\b(error|fail|failure|broke|broken|crash)\b/.test(q)) {
    const rate = m.runs ? ((m.errors / m.runs) * 100).toFixed(1) : "0";
    const bad = ctx.tools.filter((t) => t.errors > 0).slice(0, 3);
    return (
      `**${m.errors}** of ${m.runs} runs failed (**${rate}%** error rate).` +
      (bad.length
        ? `\n\nTools failing most:\n` + bad.map((t) => `- \`${t.tool}\` — ${t.errors} of ${t.calls} calls`).join("\n")
        : `\n\nNo tool-level failures recorded.`)
    );
  }
  if (/\b(slow|fast|latency|duration|speed|took|time)\b/.test(q)) {
    return `Average run latency is **${duration(m.avgDurationMs)}** across ${m.runs} runs.`;
  }
  if (/\b(how many|count|total runs|number of runs|summary|overview)\b/.test(q)) {
    return `**${m.runs} runs** total — ${m.runs - m.errors} ok, ${m.errors} failed. ${compact(m.tokensIn + m.tokensOut)} tokens, ${m.toolCalls} tool calls, ${money(m.costUsd)} spent, ${duration(m.avgDurationMs)} avg.`;
  }
  return null;
}

function systemPrompt(ctx: Context): string {
  const m = ctx.stats;
  const models = ctx.models.slice(0, 6).map((x) => `${x.model}: ${money(x.costUsd)}, ${x.calls} calls`).join("; ");
  const tools = ctx.tools.slice(0, 8).map((x) => `${x.tool}: ${x.calls}${x.errors ? `/${x.errors}err` : ""}`).join("; ");
  const recent = ctx.recent.map((t) => `${t.name} (${t.model ?? "?"}, ${money(t.costUsd)}, ${t.status})`).join("; ");
  let s =
    `You are AgentGlass's assistant. Answer concisely in markdown using ONLY the data below about the user's AI agent runs. If asked something the data can't answer, say so.\n\n` +
    `Totals: ${m.runs} runs, ${m.errors} failed, ${money(m.costUsd)} spent, ${compact(m.tokensIn + m.tokensOut)} tokens, ${m.toolCalls} tool calls, ${duration(m.avgDurationMs)} avg latency.\n` +
    `By model: ${models}\nBy tool: ${tools}\nRecent runs: ${recent}`;
  if (ctx.trace) {
    const t = ctx.trace.trace;
    s += `\nCurrently viewing run "${t.name}": ${money(t.costUsd)}, ${compact(t.tokensIn + t.tokensOut)} tokens, ${t.spanCount} spans, status ${t.status}.`;
  }
  return s;
}

async function callLLM(
  provider: string,
  key: string,
  model: string,
  system: string,
  question: string,
): Promise<string> {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
    });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? "OpenAI error");
    return j.choices?.[0]?.message?.content ?? "(no answer)";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: question }],
    }),
  });
  const j = (await res.json()) as { content?: { text?: string }[]; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "Anthropic error");
  return j.content?.[0]?.text ?? "(no answer)";
}

export interface AssistantReply {
  answer: string;
  source: "local" | "llm";
}

export async function ask(
  store: Store,
  vault: Vault,
  question: string,
  traceId?: string,
): Promise<AssistantReply> {
  const ctx = buildContext(store, traceId);

  const local = localAnswer(question, ctx);
  const sealed = store.getSetting("assistant_key");

  // With no key, always answer locally (and nudge toward configuring one).
  if (!sealed) {
    return {
      answer:
        local ??
        "I can answer questions about your spend, errors, latency, models, and tools right now. For open-ended analysis, add an LLM key in **Settings**.",
      source: "local",
    };
  }

  // A key is configured — prefer the LLM for richer answers, fall back to local.
  const key = vault.open(sealed);
  if (!key) return { answer: local ?? "The stored key could not be read. Re-add it in Settings.", source: "local" };
  const provider = store.getSetting("assistant_provider") ?? "anthropic";
  const model = store.getSetting("assistant_model") ?? (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");
  try {
    const answer = await callLLM(provider, key, model, systemPrompt(ctx), question);
    return { answer, source: "llm" };
  } catch (err) {
    return {
      answer: local ?? `The assistant LLM call failed: ${err instanceof Error ? err.message : "unknown error"}.`,
      source: "local",
    };
  }
}
