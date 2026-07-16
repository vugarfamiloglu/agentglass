/** Typed client for the AgentGlass API. Every response uses the `{ ok, data }`
 *  / `{ ok, error }` envelope, which these helpers unwrap. */

import type { Analytics, DashboardStats, SeriesPoint, Span, Trace } from "./types";

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  const env = (await res.json()) as Envelope<T>;
  if (!env.ok || env.data === undefined) {
    throw new Error(env.error ?? `request failed (${res.status})`);
  }
  return env.data;
}

export async function getJson<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path));
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function delJson<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path, { method: "DELETE" }));
}

export interface AssistantReply {
  answer: string;
  source: "local" | "llm";
}

export type AssistantChunk =
  | { type: "delta"; text: string }
  | { type: "done"; source: "local" | "llm" }
  | { type: "error"; message: string };

/** Stream an answer, handing each chunk over as it lands. */
export async function askStream(
  message: string,
  traceId: string | undefined,
  onChunk: (chunk: AssistantChunk) => void,
): Promise<void> {
  const res = await fetch("/api/assistant/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, traceId }),
  });
  if (!res.ok || !res.body) throw new Error(`the assistant returned ${res.status}`);

  const reader = res.body.getReader();
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
      try {
        onChunk(JSON.parse(line.slice(5).trim()) as AssistantChunk);
      } catch {
        /* non-JSON event — ignore */
      }
    }
  }
}

export interface ModelEntry {
  key: string;
  label: string;
  provider: string;
  input: number;
  output: number;
  cache: number;
  cacheWrite: number;
  family?: boolean;
}

export interface LlmProvider {
  id: string;
  label: string;
  kind: "anthropic" | "openai";
  baseUrl: string;
  defaultModel: string;
  keyless?: boolean;
  hint: string;
}

export interface AssistantSettings {
  assistantConfigured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  configuredProviders: string[];
  retentionDays: number;
  dbSizeBytes: number;
  traces: number;
  /** A public demo serves reads only — the UI hides what it can't do. */
  readonly: boolean;
}

export interface Health {
  service: string;
  version: string;
  traces: number;
  clients: number;
  readonly: boolean;
}

export interface TracePage {
  traces: Trace[];
  total: number;
}

export interface TracesQuery {
  source?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  health: () => getJson<Health>("/api/health"),
  stats: (hours?: number) => getJson<DashboardStats>(`/api/stats${qs({ hours })}`),
  series: (hours = 24) => getJson<SeriesPoint[]>(`/api/series${qs({ hours })}`),
  analytics: (hours = 24) => getJson<Analytics>(`/api/analytics${qs({ hours })}`),
  traces: (query: TracesQuery = {}) => getJson<TracePage>(`/api/traces${qs({ ...query })}`),
  trace: (id: string) => getJson<Trace>(`/api/traces/${id}`),
  spans: (id: string) => getJson<{ trace: Trace; spans: Span[] }>(`/api/traces/${id}/spans`),
  deleteTrace: (id: string) => delJson<{ deleted: boolean }>(`/api/traces/${id}`),
  clearTraces: () => delJson<{ removed: number }>("/api/traces"),
  models: () => getJson<ModelEntry[]>("/api/models"),
  ask: (message: string, traceId?: string) =>
    postJson<AssistantReply>("/api/assistant", { message, traceId }),
  settings: () => getJson<AssistantSettings>("/api/settings"),
  assistantProviders: () => getJson<LlmProvider[]>("/api/assistant/providers"),
  /** Ask the provider what it serves — works with a key that isn't saved yet. */
  assistantModels: (body: { provider: string; key?: string; baseUrl?: string }) =>
    postJson<{ models: string[] }>("/api/assistant/models", body),
  setAssistant: (body: { provider: string; key: string; model: string; baseUrl: string }) =>
    postJson<{ configured: boolean; model: string }>("/api/settings/assistant", body),
  clearAssistant: () => delJson<{ configured: boolean }>("/api/settings/assistant"),
  setRetention: (days: number) =>
    putJson<{ retentionDays: number; removed: number }>("/api/settings/retention", { days }),
};
