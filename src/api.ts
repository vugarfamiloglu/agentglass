/**
 * REST surface. Consistent envelope: `{ ok: true, data }` on success,
 * `{ ok: false, error }` on failure. Read paths for now; the proxy and
 * settings routes mount here in later phases.
 */
import { Hono } from "hono";

import type { Store } from "./db.js";
import type { Hub } from "./hub.js";

export function apiRoutes(store: Store, hub: Hub, version: string): Hono {
  const api = new Hono();

  api.get("/health", (c) =>
    c.json({
      ok: true,
      data: {
        service: "agentglass",
        version,
        traces: store.traceCount(),
        clients: hub.size,
      },
    }),
  );

  api.get("/stats", (c) => {
    const hours = Number.parseInt(c.req.query("hours") ?? "", 10);
    const since = Number.isFinite(hours) && hours > 0 ? Date.now() - hours * 3_600_000 : 0;
    return c.json({ ok: true, data: store.stats(since) });
  });

  api.get("/series", (c) => {
    const hours = Number.parseInt(c.req.query("hours") ?? "24", 10);
    return c.json({ ok: true, data: store.spendSeries(Number.isFinite(hours) ? hours : 24) });
  });

  api.get("/analytics", (c) => {
    const hours = Number.parseInt(c.req.query("hours") ?? "24", 10);
    return c.json({
      ok: true,
      data: {
        series: store.spendSeries(Number.isFinite(hours) ? hours : 24),
        models: store.byModel(),
        tools: store.byTool(),
        activity: store.activity(),
      },
    });
  });

  api.get("/export/traces.csv", (c) => {
    const traces = store.listAllTraces();
    const esc = (s: unknown) => `"${String(s).replace(/"/g, '""')}"`;
    const header =
      "id,name,source,model,status,tokens_in,tokens_out,cost_usd,duration_ms,started_at";
    const lines = traces.map((t) =>
      [
        t.id,
        esc(t.name),
        t.source,
        t.model ?? "",
        t.status,
        t.tokensIn,
        t.tokensOut,
        t.costUsd.toFixed(6),
        t.durationMs ?? "",
        new Date(t.startedAt).toISOString(),
      ].join(","),
    );
    return c.body([header, ...lines].join("\n"), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="agentglass-traces.csv"',
    });
  });

  api.get("/traces", (c) => {
    const q = c.req.query();
    const toInt = (v: string | undefined) => (v ? Number.parseInt(v, 10) : undefined);
    const result = store.listTraces({
      source: q.source,
      status: q.status,
      query: q.q,
      limit: toInt(q.limit),
      offset: toInt(q.offset),
    });
    return c.json({ ok: true, data: result });
  });

  api.get("/traces/:id", (c) => {
    const trace = store.getTrace(c.req.param("id"));
    if (!trace) return c.json({ ok: false, error: "trace not found" }, 404);
    return c.json({ ok: true, data: trace });
  });

  api.get("/traces/:id/spans", (c) => {
    const trace = store.getTrace(c.req.param("id"));
    if (!trace) return c.json({ ok: false, error: "trace not found" }, 404);
    return c.json({ ok: true, data: { trace, spans: store.getSpans(trace.id) } });
  });

  api.delete("/traces/:id", (c) => {
    const deleted = store.deleteTrace(c.req.param("id"));
    if (!deleted) return c.json({ ok: false, error: "trace not found" }, 404);
    return c.json({ ok: true, data: { deleted: true } });
  });

  return api;
}
