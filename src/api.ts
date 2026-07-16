/**
 * REST surface. Consistent envelope: `{ ok: true, data }` on success,
 * `{ ok: false, error }` on failure. Read paths for now; the proxy and
 * settings routes mount here in later phases.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { ask, askStream } from "./assistant.js";
import {
  configuredProviders,
  forgetKey,
  listModels,
  LLM_PROVIDERS,
  providerById,
  resolveTarget,
  saveKey,
} from "./llm.js";
import { CATALOG } from "./pricing.js";
import { retentionDays, setRetentionDays, sweepRetention } from "./retention.js";
import type { Store } from "./db.js";
import type { Hub } from "./hub.js";
import type { Vault } from "./vault.js";

export function apiRoutes(store: Store, hub: Hub, vault: Vault, version: string): Hono {
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

  api.delete("/traces", (c) => {
    const removed = store.traceCount();
    store.clearAll();
    return c.json({ ok: true, data: { removed } });
  });

  api.delete("/traces/:id", (c) => {
    const deleted = store.deleteTrace(c.req.param("id"));
    if (!deleted) return c.json({ ok: false, error: "trace not found" }, 404);
    return c.json({ ok: true, data: { deleted: true } });
  });

  // ---- models, assistant & settings ----

  /** The pricing catalog, so the UI can name models and show what they cost. */
  api.get("/models", (c) => c.json({ ok: true, data: CATALOG }));

  /** Every LLM the assistant can be pointed at. Never carries a key. */
  api.get("/assistant/providers", (c) => c.json({ ok: true, data: LLM_PROVIDERS }));

  /**
   * Ask a provider what it actually serves today. Accepts an unsaved key so
   * you can browse before committing one, and falls back to the stored key.
   */
  api.post("/assistant/models", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const pick = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
    const target = resolveTarget(store, vault, {
      provider: pick("provider"),
      key: pick("key") || undefined,
      baseUrl: pick("baseUrl") || undefined,
    });
    if (target.status !== "ready") {
      const why = target.status === "broken" ? target.message : "connect a provider first";
      return c.json({ ok: false, error: why }, 400);
    }
    try {
      return c.json({ ok: true, data: { models: await listModels(target.llm) } });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "could not reach the provider" },
        502,
      );
    }
  });

  api.get("/settings", (c) => {
    const provider = store.getSetting("assistant_provider") ?? "anthropic";
    const target = resolveTarget(store, vault);
    return c.json({
      ok: true,
      data: {
        assistantConfigured: target.status === "ready",
        provider,
        model: store.getSetting("assistant_model") ?? "",
        baseUrl: store.getSetting(`assistant_base_url:${provider}`) ?? "",
        // So the UI can mark which providers already hold a key.
        configuredProviders: configuredProviders(store, vault),
        retentionDays: retentionDays(store),
        dbSizeBytes: store.dbSizeBytes(),
        traces: store.traceCount(),
      },
    });
  });

  api.put("/settings/retention", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { days?: unknown };
    const days = Number(body.days);
    const saved = setRetentionDays(store, Number.isFinite(days) ? days : 0);
    // Apply the new window straight away rather than waiting for the next sweep.
    const removed = sweepRetention(store);
    return c.json({ ok: true, data: { retentionDays: saved, removed } });
  });

  api.post("/settings/assistant", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const pick = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
    const provider = providerById(pick("provider") || "anthropic");
    const key = pick("key");
    const baseUrl = pick("baseUrl");

    if (key) saveKey(store, vault, provider.id, key);
    store.setSetting("assistant_provider", provider.id);
    store.setSetting("assistant_model", pick("model"));
    store.setSetting(`assistant_base_url:${provider.id}`, baseUrl);

    // Report what's still missing rather than saving and going quiet about it.
    const target = resolveTarget(store, vault);
    if (target.status === "broken") return c.json({ ok: false, error: target.message }, 400);
    if (target.status === "unconfigured") {
      return c.json({ ok: false, error: `${provider.label} needs an API key.` }, 400);
    }
    return c.json({ ok: true, data: { configured: true, model: target.llm.model } });
  });

  api.delete("/settings/assistant", (c) => {
    forgetKey(store, store.getSetting("assistant_provider") ?? "anthropic");
    return c.json({ ok: true, data: { configured: false } });
  });

  api.post("/assistant", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: unknown; traceId?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const traceId = typeof body.traceId === "string" ? body.traceId : undefined;
    if (!message) return c.json({ ok: false, error: "message is required" }, 400);
    const reply = await ask(store, vault, message, traceId);
    return c.json({ ok: true, data: reply });
  });

  /** Same answer as POST /assistant, delivered as it's written. */
  api.post("/assistant/stream", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: unknown; traceId?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const traceId = typeof body.traceId === "string" ? body.traceId : undefined;
    if (!message) return c.json({ ok: false, error: "message is required" }, 400);
    return streamSSE(c, async (stream) => {
      const send = (chunk: unknown) => stream.writeSSE({ data: JSON.stringify(chunk) });
      try {
        await askStream(store, vault, message, traceId, send);
      } catch (err) {
        await send({ type: "error", message: err instanceof Error ? err.message : "assistant failed" });
        await send({ type: "done", source: "local" });
      }
    });
  });

  return api;
}
