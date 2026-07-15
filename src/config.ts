/**
 * Runtime configuration, read once from the environment at boot.
 *
 * Glasswing runs as a single local process: it serves the dashboard SPA, the
 * REST/WS API, and the recording proxy — all on one port.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface Config {
  /** Dashboard + API + proxy port. */
  port: number;
  /** Directory for the SQLite trace store and vault key. */
  dataDir: string;
  /** Built dashboard assets (served in production). */
  webDist: string;
  /** When true, the trace simulator seeds and streams synthetic agent runs. */
  simulate: boolean;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function loadConfig(): Config {
  return {
    port: envInt("GLASSWING_PORT", 4319),
    dataDir: process.env.GLASSWING_DATA ?? resolve(process.cwd(), "data"),
    // dist/index.js -> ../web/dist
    webDist: process.env.GLASSWING_WEB ?? resolve(HERE, "..", "web", "dist"),
    simulate: envBool("GLASSWING_SIMULATE", true),
  };
}
