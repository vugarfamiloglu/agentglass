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

/** Read `data: {...}` events off a live SSE body as they arrive. */
async function* sseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        /* non-JSON event — ignore */
      }
    }
  }
}

/** Pull something readable out of a non-2xx provider response. */
async function apiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.trim().slice(0, 200) || `the provider returned ${res.status}`;
}

export function defaultModel(provider: string): string {
  // GPT-5 spends its budget on reasoning tokens and can return nothing under a
  // small cap, so the OpenAI default is the flagship that streams predictably.
  return provider === "openai" ? "gpt-4.1" : "claude-opus-4-8";
}

async function streamLLM(
  provider: string,
  key: string,
  model: string,
  system: string,
  question: string,
  onText: (text: string) => Promise<void>,
): Promise<void> {
  const openai = provider === "openai";
  const res = await fetch(
    openai ? "https://api.openai.com/v1/chat/completions" : "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: openai
        ? { "content-type": "application/json", authorization: `Bearer ${key}` }
        : {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
      body: JSON.stringify(
        openai
          ? {
              model,
              stream: true,
              max_completion_tokens: 1200,
              messages: [
                { role: "system", content: system },
                { role: "user", content: question },
              ],
            }
          : {
              model,
              stream: true,
              max_tokens: 1200,
              system,
              messages: [{ role: "user", content: question }],
            },
      ),
    },
  );
  if (!res.ok || !res.body) throw new Error(await apiError(res));

  for await (const evt of sseEvents(res.body)) {
    if (openai) {
      const choices = evt.choices;
      const first = Array.isArray(choices) ? (choices[0] as { delta?: { content?: unknown } }) : null;
      const text = first?.delta?.content;
      if (typeof text === "string" && text) await onText(text);
      continue;
    }
    if (evt.type === "content_block_delta") {
      // Thinking deltas stream through here too; only text reaches the user.
      const delta = evt.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === "text_delta" && delta.text) await onText(delta.text);
    } else if (evt.type === "error") {
      const err = evt.error as { message?: string } | undefined;
      throw new Error(err?.message ?? "the provider ended the stream");
    }
  }
}

export type AssistantChunk =
  | { type: "delta"; text: string }
  | { type: "done"; source: "local" | "llm" }
  | { type: "error"; message: string };

export interface AssistantReply {
  answer: string;
  source: "local" | "llm";
}

const NO_KEY_HINT =
  "I can answer questions about your spend, errors, latency, models, and tools right now. For open-ended analysis, add an LLM key in **Settings**.";

/**
 * Answer a question, emitting the reply in pieces. Local answers arrive whole;
 * LLM answers stream token by token. Either way the caller gets exactly one
 * terminal `done` chunk naming which one it got.
 */
export async function askStream(
  store: Store,
  vault: Vault,
  question: string,
  traceId: string | undefined,
  emit: (chunk: AssistantChunk) => Promise<void> | void,
): Promise<void> {
  const ctx = buildContext(store, traceId);
  const local = localAnswer(question, ctx);
  const sealed = store.getSetting("assistant_key");

  // With no key, everything is computed from the store.
  if (!sealed) {
    await emit({ type: "delta", text: local ?? NO_KEY_HINT });
    await emit({ type: "done", source: "local" });
    return;
  }

  const key = vault.open(sealed);
  if (!key) {
    await emit({
      type: "delta",
      text: local ?? "The stored key could not be read. Re-add it in **Settings**.",
    });
    await emit({ type: "done", source: "local" });
    return;
  }

  const provider = store.getSetting("assistant_provider") ?? "anthropic";
  const model = store.getSetting("assistant_model") || defaultModel(provider);

  let streamed = false;
  try {
    await streamLLM(provider, key, model, systemPrompt(ctx), question, async (text) => {
      streamed = true;
      await emit({ type: "delta", text });
    });
    if (!streamed) await emit({ type: "delta", text: local ?? "The model returned an empty answer." });
    await emit({ type: "done", source: streamed ? "llm" : "local" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // Nothing has reached the reader yet, so the local answer can still stand in.
    if (!streamed) {
      await emit({ type: "delta", text: local ?? `The assistant LLM call failed: ${message}.` });
      await emit({ type: "done", source: "local" });
      return;
    }
    await emit({ type: "error", message: `The answer was cut short: ${message}.` });
    await emit({ type: "done", source: "llm" });
  }
}

/** Collect a streamed answer into one reply, for callers that can't stream. */
export async function ask(
  store: Store,
  vault: Vault,
  question: string,
  traceId?: string,
): Promise<AssistantReply> {
  let answer = "";
  let source: AssistantReply["source"] = "local";
  await askStream(store, vault, question, traceId, (chunk) => {
    if (chunk.type === "delta") answer += chunk.text;
    else if (chunk.type === "error") answer += `${answer ? "\n\n" : ""}${chunk.message}`;
    else source = chunk.source;
  });
  return { answer, source };
}
