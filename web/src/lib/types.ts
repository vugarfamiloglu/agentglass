/** Wire types — mirror the server DTOs (camelCase). */

export type TraceSource = "sim" | "anthropic" | "openai" | "sdk";
export type TraceStatus = "running" | "ok" | "error";
export type SpanType = "llm" | "tool" | "agent" | "event";
export type SpanStatus = "running" | "ok" | "error";

export interface Trace {
  id: string;
  name: string;
  source: TraceSource;
  status: TraceStatus;
  model: string | null;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  spanCount: number;
  toolCount: number;
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  costUsd: number;
  error: string | null;
  meta: Record<string, unknown> | null;
}

export interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  type: SpanType;
  name: string;
  status: SpanStatus;
  model: string | null;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  costUsd: number;
  input: unknown;
  output: unknown;
  error: string | null;
  meta: Record<string, unknown> | null;
}

export interface DashboardStats {
  runs: number;
  errors: number;
  running: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  toolCalls: number;
  avgDurationMs: number;
}

export interface SeriesPoint {
  t: number;
  cost: number;
  runs: number;
}

export type LiveEvent =
  | { type: "hello"; clients: number }
  | { type: "trace.start"; trace: Trace }
  | { type: "trace.update"; trace: Trace }
  | { type: "trace.end"; trace: Trace }
  | { type: "span.add"; span: Span };
