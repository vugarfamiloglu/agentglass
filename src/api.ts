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
