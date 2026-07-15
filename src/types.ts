/**
 * Core domain model. A **trace** is one agent run (a top-level task/turn). It
 * contains a tree of **spans** — each span is an LLM call, a tool execution, a
 * nested agent, or a discrete event. Token and cost totals roll up from spans
 * to their trace so the dashboard can show both the forest and the trees.
 */

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

export interface NewTrace {
  name: string;
  source: TraceSource;
  model?: string | null;
  startedAt?: number;
  meta?: Record<string, unknown> | null;
}

export interface NewSpan {
  traceId: string;
  parentId?: string | null;
  type: SpanType;
  name: string;
  status?: SpanStatus;
  model?: string | null;
  startedAt: number;
  endedAt?: number | null;
  tokensIn?: number;
  tokensOut?: number;
  tokensCache?: number;
  costUsd?: number;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Live event pushed over the WebSocket to the dashboard. */
export type LiveEvent =
  | { type: "trace.start"; trace: Trace }
  | { type: "trace.update"; trace: Trace }
  | { type: "trace.end"; trace: Trace }
  | { type: "span.add"; span: Span };
