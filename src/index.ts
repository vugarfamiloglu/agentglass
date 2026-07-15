#!/usr/bin/env node
/**
 * Glasswing — the glass box for your AI agents.
 *
 * One process serves three things on one port: the dashboard SPA, the REST/WS
 * API, and (in later phases) the recording proxy. Point your agent's base URL
 * at Glasswing and every run shows up live in the dashboard.
 */
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";

import { apiRoutes } from "./api.js";
import { loadConfig } from "./config.js";
import { Store } from "./db.js";
import { Hub } from "./hub.js";
import type { Sink } from "./hub.js";
import { serveDist } from "./static.js";

const VERSION = "0.1.0";

const cfg = loadConfig();
const store = new Store(cfg.dataDir);
const hub = new Hub();

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Live event stream — registered before the /api mount so it wins the path.
app.get(
  "/api/ws",
  upgradeWebSocket(() => {
    let sink: Sink | null = null;
    return {
      onOpen(_evt, ws) {
        sink = { send: (data: string) => ws.send(data) };
        hub.add(sink);
        ws.send(JSON.stringify({ type: "hello", clients: hub.size }));
      },
      onClose() {
        if (sink) hub.remove(sink);
      },
    };
  }),
);

app.route("/api", apiRoutes(store, hub, VERSION));

// Dashboard SPA (production build). Vite serves the UI during development.
app.use("/*", serveDist(cfg.webDist));

const server = serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  const url = `http://localhost:${info.port}`;
  process.stdout.write(
    `\n  ✦ Glasswing v${VERSION}\n` +
      `  dashboard   ${url}\n` +
      `  proxy       set ANTHROPIC_BASE_URL / OPENAI_BASE_URL to ${url}\n` +
      `  traces      ${store.traceCount()} stored · ${cfg.simulate ? "simulator on" : "simulator off"}\n\n`,
  );
});

injectWebSocket(server);

export { app, store, hub };
