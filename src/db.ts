/**
 * Trace store on top of Node's built-in `node:sqlite` (WAL). No native modules,
 * no build step — it just works on every platform Node runs on.
 *
 * Discipline: all access goes through this class. `addSpan` is the only writer
 * that touches trace aggregate columns, keeping token/cost rollups consistent.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  NewSpan,
  NewTrace,
  Span,
  SpanStatus,
  Trace,
  TraceStatus,
} from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS traces (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  source       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',
  model        TEXT,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  duration_ms  INTEGER,
  span_count   INTEGER NOT NULL DEFAULT 0,
  tool_count   INTEGER NOT NULL DEFAULT 0,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  tokens_cache INTEGER NOT NULL DEFAULT 0,
  cost_usd     REAL    NOT NULL DEFAULT 0,
  error        TEXT,
  meta         TEXT
);
CREATE INDEX IF NOT EXISTS idx_traces_started ON traces(started_at DESC);

CREATE TABLE IF NOT EXISTS spans (
  id           TEXT PRIMARY KEY,
  trace_id     TEXT NOT NULL,
  parent_id    TEXT,
  type         TEXT NOT NULL,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ok',
  model        TEXT,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  duration_ms  INTEGER,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  tokens_cache INTEGER NOT NULL DEFAULT 0,
  cost_usd     REAL    NOT NULL DEFAULT 0,
  input        TEXT,
  output       TEXT,
  error        TEXT,
  meta         TEXT
);
CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id, started_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function toJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function fromJson<T = unknown>(v: unknown): T | null {
  if (typeof v !== "string" || v.length === 0) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

/** Raw row shapes returned by node:sqlite (snake_case columns). */
type TraceRow = Record<string, string | number | null>;
type SpanRow = Record<string, string | number | null>;

export interface ListOptions {
  limit?: number;
  offset?: number;
  source?: string;
  status?: string;
  query?: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "glasswing.db"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
  }

  // ---- settings ----

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  // ---- traces ----

  createTrace(input: NewTrace): Trace {
    const id = `tr_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const startedAt = input.startedAt ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO traces(id, name, source, status, model, started_at, meta)
         VALUES(?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(id, input.name, input.source, input.model ?? null, startedAt, toJson(input.meta));
    return this.getTrace(id)!;
  }

  finishTrace(id: string, status: TraceStatus, endedAt: number, error?: string | null): Trace | null {
    const trace = this.getTrace(id);
    if (!trace) return null;
    const duration = endedAt - trace.startedAt;
    this.db
      .prepare(
        "UPDATE traces SET status = ?, ended_at = ?, duration_ms = ?, error = ? WHERE id = ?",
      )
      .run(status, endedAt, duration, error ?? null, id);
    return this.getTrace(id);
  }

  /** Insert a span and roll its token/cost/count totals up into the trace. */
  addSpan(input: NewSpan): Span {
    const id = `sp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const status: SpanStatus = input.status ?? "ok";
    const endedAt = input.endedAt ?? null;
    const duration = endedAt != null ? endedAt - input.startedAt : null;
    const tokensIn = input.tokensIn ?? 0;
    const tokensOut = input.tokensOut ?? 0;
    const tokensCache = input.tokensCache ?? 0;
    const cost = input.costUsd ?? 0;

    this.db
      .prepare(
        `INSERT INTO spans(id, trace_id, parent_id, type, name, status, model, started_at,
           ended_at, duration_ms, tokens_in, tokens_out, tokens_cache, cost_usd, input, output, error, meta)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.traceId,
        input.parentId ?? null,
        input.type,
        input.name,
        status,
        input.model ?? null,
        input.startedAt,
        endedAt,
        duration,
        tokensIn,
        tokensOut,
        tokensCache,
        cost,
        toJson(input.input),
        toJson(input.output),
        input.error ?? null,
        toJson(input.meta),
      );

    this.db
      .prepare(
        `UPDATE traces SET
           span_count   = span_count + 1,
           tool_count   = tool_count + ?,
           tokens_in    = tokens_in + ?,
           tokens_out   = tokens_out + ?,
           tokens_cache = tokens_cache + ?,
           cost_usd     = cost_usd + ?,
           model        = COALESCE(model, ?)
         WHERE id = ?`,
      )
      .run(
        input.type === "tool" ? 1 : 0,
        tokensIn,
        tokensOut,
        tokensCache,
        cost,
        input.model ?? null,
        input.traceId,
      );

    return this.rowToSpan(
      this.db.prepare("SELECT * FROM spans WHERE id = ?").get(id) as SpanRow,
    );
  }

  getTrace(id: string): Trace | null {
    const row = this.db.prepare("SELECT * FROM traces WHERE id = ?").get(id) as TraceRow | undefined;
    return row ? this.rowToTrace(row) : null;
  }

  getSpans(traceId: string): Span[] {
    const rows = this.db
      .prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC")
      .all(traceId) as SpanRow[];
    return rows.map((r) => this.rowToSpan(r));
  }

  listTraces(opts: ListOptions = {}): { traces: Trace[]; total: number } {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.source) {
      where.push("source = ?");
      args.push(opts.source);
    }
    if (opts.status) {
      where.push("status = ?");
      args.push(opts.status);
    }
    if (opts.query) {
      where.push("(name LIKE ? OR model LIKE ?)");
      args.push(`%${opts.query}%`, `%${opts.query}%`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM traces ${clause}`).get(...args) as { n: number }
    ).n;
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const rows = this.db
      .prepare(`SELECT * FROM traces ${clause} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
      .all(...args, limit, offset) as TraceRow[];
    return { traces: rows.map((r) => this.rowToTrace(r)), total };
  }

  deleteTrace(id: string): number {
    this.db.prepare("DELETE FROM spans WHERE trace_id = ?").run(id);
    const res = this.db.prepare("DELETE FROM traces WHERE id = ?").run(id);
    return Number(res.changes);
  }

  clearAll(): void {
    this.db.exec("DELETE FROM spans; DELETE FROM traces;");
  }

  traceCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM traces").get() as { n: number }).n;
  }

  // ---- mappers ----

  private rowToTrace(r: TraceRow): Trace {
    return {
      id: r.id as string,
      name: r.name as string,
      source: r.source as Trace["source"],
      status: r.status as TraceStatus,
      model: (r.model as string) ?? null,
      startedAt: r.started_at as number,
      endedAt: (r.ended_at as number) ?? null,
      durationMs: (r.duration_ms as number) ?? null,
      spanCount: r.span_count as number,
      toolCount: r.tool_count as number,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
      tokensCache: r.tokens_cache as number,
      costUsd: r.cost_usd as number,
      error: (r.error as string) ?? null,
      meta: fromJson(r.meta),
    };
  }

  private rowToSpan(r: SpanRow): Span {
    return {
      id: r.id as string,
      traceId: r.trace_id as string,
      parentId: (r.parent_id as string) ?? null,
      type: r.type as Span["type"],
      name: r.name as string,
      status: r.status as SpanStatus,
      model: (r.model as string) ?? null,
      startedAt: r.started_at as number,
      endedAt: (r.ended_at as number) ?? null,
      durationMs: (r.duration_ms as number) ?? null,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
      tokensCache: r.tokens_cache as number,
      costUsd: r.cost_usd as number,
      input: fromJson(r.input),
      output: fromJson(r.output),
      error: (r.error as string) ?? null,
      meta: fromJson(r.meta),
    };
  }
}
