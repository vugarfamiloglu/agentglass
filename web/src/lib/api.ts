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

export async function delJson<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path, { method: "DELETE" }));
}

export interface Health {
  service: string;
  version: string;
  traces: number;
  clients: number;
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
};
