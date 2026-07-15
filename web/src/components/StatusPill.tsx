import type { TraceStatus } from "../lib/types";

export function StatusPill({ status }: { status: TraceStatus | string }) {
  const tone = status === "error" ? "error" : status === "running" ? "running" : "ok";
  const label = status === "ok" ? "ok" : status;
  return <span className={`spill spill-${tone} mono`}>{label}</span>;
}
