/**
 * Provider wire-format adapters. Everything AgentGlass needs to know about a
 * vendor's HTTP shape lives here: which headers to forward, where the model
 * name and token usage hide, how to read the tool calls a response asked for,
 * and how to find the answers to those calls in the next request.
 *
 * Adding a provider means adding one object here; the proxy stays format-blind.
 */
import type { TraceSource } from "./types.js";

const ANTHROPIC_URL = process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com";
const OPENAI_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com";

export interface Usage {
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
}

/** A tool the model asked the agent to run. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** The answer the agent sent back for a tool call, seen on the next request. */
export interface ToolResult {
  id: string;
  output: unknown;
  isError: boolean;
}

export interface Provider {
  source: TraceSource;
  target: (path: string) => string;
  /** Request headers to forward to the upstream API. */
  authHeaders: string[];
  model: (body: Record<string, unknown>) => string;
  usageFromJson: (json: Record<string, unknown>) => Usage;
  usageFromStream: (sse: string) => Usage;
  toolCallsFromJson: (json: Record<string, unknown>) => ToolCall[];
  toolCallsFromStream: (sse: string) => ToolCall[];
  toolResultsFromRequest: (body: Record<string, unknown>) => ToolResult[];
}

export const EMPTY_USAGE: Usage = {
  tokensIn: 0,
  tokensOut: 0,
  tokensCacheRead: 0,
  tokensCacheWrite: 0,
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

/** Tool arguments arrive as a JSON string; keep the raw text if it won't parse. */
function parseArgs(raw: string): unknown {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Parse `data: {...}` lines out of an SSE payload into JSON objects. */
export function sseData(sse: string): Record<string, unknown>[] {
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

// ---- Anthropic ----

/** Anthropic reports cache tokens in buckets separate from `input_tokens`. */
function anthropicUsage(u: Record<string, unknown>): Usage {
  return {
    tokensIn: num(u.input_tokens),
    tokensOut: num(u.output_tokens),
    tokensCacheRead: num(u.cache_read_input_tokens),
    tokensCacheWrite: num(u.cache_creation_input_tokens),
  };
}

export const ANTHROPIC: Provider = {
  source: "anthropic",
  target: (p) => `${ANTHROPIC_URL}${p}`,
  authHeaders: ["x-api-key", "authorization", "anthropic-version", "anthropic-beta", "content-type"],
  model: (b) => str(b.model) || "claude",
  usageFromJson: (j) => anthropicUsage(obj(j.usage)),
  usageFromStream: (sse) => {
    // message_start carries the input side; message_delta the final output count.
    let u: Usage = { ...EMPTY_USAGE };
    for (const d of sseData(sse)) {
      const raw = d.usage ?? obj(d.message).usage;
      if (!raw) continue;
      const next = anthropicUsage(obj(raw));
      u = {
        tokensIn: next.tokensIn || u.tokensIn,
        tokensOut: next.tokensOut || u.tokensOut,
        tokensCacheRead: next.tokensCacheRead || u.tokensCacheRead,
        tokensCacheWrite: next.tokensCacheWrite || u.tokensCacheWrite,
      };
    }
    return u;
  },
  toolCallsFromJson: (j) => {
    const out: ToolCall[] = [];
    if (!Array.isArray(j.content)) return out;
    for (const raw of j.content) {
      const block = obj(raw);
      if (block.type !== "tool_use") continue;
      const id = str(block.id);
      if (id) out.push({ id, name: str(block.name), input: block.input ?? null });
    }
    return out;
  },
  toolCallsFromStream: (sse) => {
    // A tool_use block opens with content_block_start; its input then streams
    // in as input_json_delta fragments keyed by the block index.
    const open = new Map<number, { id: string; name: string; json: string }>();
    for (const d of sseData(sse)) {
      if (d.type === "content_block_start") {
        const block = obj(d.content_block);
        const id = str(block.id);
        if (block.type === "tool_use" && id) {
          open.set(num(d.index), { id, name: str(block.name), json: "" });
        }
      } else if (d.type === "content_block_delta") {
        const delta = obj(d.delta);
        if (delta.type !== "input_json_delta") continue;
        const cur = open.get(num(d.index));
        if (cur) cur.json += str(delta.partial_json);
      }
    }
    return [...open.values()].map((t) => ({ id: t.id, name: t.name, input: parseArgs(t.json) }));
  },
  toolResultsFromRequest: (b) => {
    const out: ToolResult[] = [];
    if (!Array.isArray(b.messages)) return out;
    for (const raw of b.messages) {
      const message = obj(raw);
      if (message.role !== "user" || !Array.isArray(message.content)) continue;
      for (const rawPart of message.content) {
        const part = obj(rawPart);
        if (part.type !== "tool_result") continue;
        const id = str(part.tool_use_id);
        if (id) out.push({ id, output: part.content ?? null, isError: part.is_error === true });
      }
    }
    return out;
  },
};

// ---- OpenAI (and every gateway that speaks /v1/chat/completions) ----

function openaiUsage(u: Record<string, unknown>): Usage {
  // `prompt_tokens` already includes the cached ones, so subtract them out
  // rather than billing the same tokens at both the full and cached rate.
  const prompt = num(u.prompt_tokens);
  const cached = num(obj(u.prompt_tokens_details).cached_tokens);
  return {
    tokensIn: Math.max(0, prompt - cached),
    tokensOut: num(u.completion_tokens),
    tokensCacheRead: cached,
    // Caching is automatic and writes aren't billed.
    tokensCacheWrite: 0,
  };
}

export const OPENAI: Provider = {
  source: "openai",
  target: (p) => `${OPENAI_URL}${p}`,
  authHeaders: ["authorization", "openai-organization", "openai-project", "openai-beta", "content-type"],
  model: (b) => str(b.model) || "gpt",
  usageFromJson: (j) => openaiUsage(obj(j.usage)),
  usageFromStream: (sse) => {
    let u: Usage = { ...EMPTY_USAGE };
    for (const d of sseData(sse)) if (d.usage) u = openaiUsage(obj(d.usage));
    return u;
  },
  toolCallsFromJson: (j) => {
    const out: ToolCall[] = [];
    const choices = Array.isArray(j.choices) ? j.choices : [];
    const calls = obj(obj(choices[0]).message).tool_calls;
    if (!Array.isArray(calls)) return out;
    for (const raw of calls) {
      const call = obj(raw);
      const id = str(call.id);
      const fn = obj(call.function);
      if (id) out.push({ id, name: str(fn.name), input: parseArgs(str(fn.arguments)) });
    }
    return out;
  },
  toolCallsFromStream: (sse) => {
    // Tool calls stream as deltas keyed by index: id and name land in the first
    // fragment, the JSON arguments accumulate across the rest.
    const open = new Map<number, { id: string; name: string; args: string }>();
    for (const d of sseData(sse)) {
      if (!Array.isArray(d.choices)) continue;
      for (const rawChoice of d.choices) {
        const calls = obj(obj(rawChoice).delta).tool_calls;
        if (!Array.isArray(calls)) continue;
        for (const raw of calls) {
          const call = obj(raw);
          const index = num(call.index);
          const cur = open.get(index) ?? { id: "", name: "", args: "" };
          const fn = obj(call.function);
          cur.id ||= str(call.id);
          cur.name += str(fn.name);
          cur.args += str(fn.arguments);
          open.set(index, cur);
        }
      }
    }
    return [...open.values()]
      .filter((t) => t.id)
      .map((t) => ({ id: t.id, name: t.name, input: parseArgs(t.args) }));
  },
  toolResultsFromRequest: (b) => {
    const out: ToolResult[] = [];
    if (!Array.isArray(b.messages)) return out;
    for (const raw of b.messages) {
      const message = obj(raw);
      const id = str(message.tool_call_id);
      // There's no error flag on a tool message, so failures look like results.
      if (message.role === "tool" && id) {
        out.push({ id, output: message.content ?? null, isError: false });
      }
    }
    return out;
  },
};
