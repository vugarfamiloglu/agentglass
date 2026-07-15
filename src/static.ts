/**
 * Minimal static file server for the built dashboard, with SPA fallback. Kept
 * dependency-free and cwd-independent so the single `agentglass` binary serves
 * its bundled UI no matter where it is launched from.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Context } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

function send(c: Context, file: string): Response {
  const body = readFileSync(file);
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  return c.body(body, 200, { "Content-Type": type });
}

export function serveDist(webDist: string) {
  return async (c: Context, next: () => Promise<void>) => {
    if (c.req.path.startsWith("/api")) return next();

    const rel = normalize(decodeURIComponent(c.req.path)).replace(/^([/\\]|\.\.[/\\])+/, "");
    const file = join(webDist, rel);
    if (file.startsWith(webDist) && existsSync(file) && statSync(file).isFile()) {
      return send(c, file);
    }

    const index = join(webDist, "index.html");
    if (existsSync(index)) return send(c, index);

    return c.text(
      "AgentGlass dashboard is not built. Run `npm run build`, or use the Vite dev server during development.",
      200,
    );
  };
}
