/**
 * Trace retention. Keeping everything forever is the right default for a tool
 * you point at your own agents — but an install that runs for months wants a
 * ceiling, so Settings can pick a window and this prunes down to it on boot and
 * periodically after that.
 */
import type { Store } from "./db.js";

const DAY = 86_400_000;
const SWEEP_MS = 6 * 60 * 60 * 1000;
const MAX_DAYS = 3650;

/** Presets the Settings page offers. 0 means keep everything. */
export const RETENTION_CHOICES = [0, 7, 30, 90] as const;

/** Days of history to keep; 0 means forever. */
export function retentionDays(store: Store): number {
  const raw = Number.parseInt(store.getSetting("retention_days") ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DAYS) : 0;
}

/** Store a retention window, clamped to something sane. Returns what stuck. */
export function setRetentionDays(store: Store, days: number): number {
  const clean = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), MAX_DAYS) : 0;
  store.setSetting("retention_days", String(clean));
  return clean;
}

/** Prune traces older than the configured window. Returns how many went. */
export function sweepRetention(store: Store): number {
  const days = retentionDays(store);
  if (!days) return 0;
  return store.deleteOlderThan(Date.now() - days * DAY);
}

/** Sweep now, then keep sweeping for as long as the process lives. */
export function startRetention(store: Store): () => void {
  sweepRetention(store);
  const timer = setInterval(() => sweepRetention(store), SWEEP_MS);
  return () => clearInterval(timer);
}
