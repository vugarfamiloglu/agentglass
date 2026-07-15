/**
 * Agent-run simulator. Seeds a week of realistic history on first boot and then
 * streams fresh runs live over the hub, so the dashboard is full and moving with
 * zero setup. This is demo data — the recording proxy produces the real thing.
 */
import { costOf, SIM_MODELS } from "./pricing.js";
import type { Store } from "./db.js";
import type { Hub } from "./hub.js";
import type { NewSpan, Trace } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function weightedModel(): string {
  const total = SIM_MODELS.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of SIM_MODELS) {
    r -= m.weight;
    if (r <= 0) return m.model;
  }
  return SIM_MODELS[0]!.model;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MODULES = ["auth", "billing", "search", "notifications", "payments", "onboarding", "dashboard"];

interface Scenario {
  name: string;
  tools: string[];
}

const SCENARIOS: Scenario[] = [
  { name: "Fix failing test in auth.spec.ts", tools: ["read_file", "grep", "edit_file", "run_tests"] },
  { name: "Answer support ticket #{n}", tools: ["search_kb", "fetch_order", "send_reply"] },
  { name: "Research competitor pricing", tools: ["web_search", "fetch_url", "fetch_url"] },
  { name: "Summarize PR #{n}", tools: ["git_diff", "read_file"] },
  { name: "Refactor the {mod} module", tools: ["list_files", "read_file", "edit_file", "edit_file", "run_tests"] },
  { name: "Draft release notes for v{v}", tools: ["git_log", "read_file"] },
  { name: "Triage error spike in production", tools: ["query_logs", "read_file", "web_search"] },
  { name: "Generate the weekly analytics report", tools: ["describe_schema", "run_query"] },
  { name: "Review dependency updates", tools: ["read_file", "web_search", "run_tests"] },
  { name: "Classify and route inbound leads", tools: ["fetch_crm", "run_query"] },
];

const RISKY = new Set(["run_tests", "fetch_url", "run_query", "web_search", "send_reply"]);

function toolIO(name: string): { args: unknown; result: unknown; error: string } {
  switch (name) {
    case "read_file":
      return { args: { path: `src/${pick(MODULES)}/service.ts` }, result: { bytes: randInt(800, 9000) }, error: "ENOENT: no such file" };
    case "edit_file":
      return { args: { path: `src/${pick(MODULES)}/service.ts`, hunks: randInt(1, 4) }, result: { applied: true }, error: "patch did not apply cleanly" };
    case "run_tests":
      return { args: { suite: "unit" }, result: { passed: randInt(40, 220), failed: 0 }, error: "3 tests failed" };
    case "web_search":
      return { args: { q: "agent observability pricing" }, result: { hits: randInt(4, 12) }, error: "search provider timed out" };
    case "fetch_url":
      return { args: { url: "https://example.com/pricing" }, result: { status: 200, kb: randInt(12, 140) }, error: "HTTP 429 rate limited" };
    case "run_query":
      return { args: { sql: "SELECT count(*) FROM events WHERE ..." }, result: { rows: randInt(1, 5000) }, error: "syntax error near GROUP" };
    case "git_diff":
      return { args: { ref: "HEAD~1" }, result: { files: randInt(1, 18), additions: randInt(10, 400) }, error: "not a git repository" };
    default:
      return { args: { op: name }, result: { ok: true }, error: `${name} failed` };
  }
}

export class Simulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private alive = false;

  constructor(
    private store: Store,
    private hub: Hub,
  ) {}

  /** Seed backdated history so charts, lists, and heatmaps have depth at boot. */
  seed(days = 7, perDay = 24): void {
    const now = Date.now();
    for (let d = 0; d < days; d++) {
      const count = Math.max(4, perDay + randInt(-5, 6));
      for (let i = 0; i < count; i++) {
        // Bias toward daytime hours for a realistic activity pattern.
        const hour = Math.min(23, Math.max(6, Math.round(randFloat(7, 20) + randFloat(-3, 3))));
        const started = now - d * DAY - (24 - hour) * 60 * 60 * 1000 - randInt(0, 55) * 60 * 1000;
        void this.emit(started, false);
      }
    }
  }

  start(intervalMs = 5000): void {
    this.alive = true;
    this.timer = setInterval(() => {
      if (this.alive) void this.emit(Date.now(), true);
    }, intervalMs);
  }

  stop(): void {
    this.alive = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async emit(startedAt: number, live: boolean): Promise<void> {
    const scenario = pick(SCENARIOS);
    const model = weightedModel();
    const name = scenario.name
      .replace("#{n}", `#${randInt(1000, 9999)}`)
      .replace("{mod}", pick(MODULES))
      .replace("{v}", `2.${randInt(1, 9)}.${randInt(0, 9)}`);

    const trace = this.store.createTrace({ name, source: "sim", model, startedAt });
    if (live) this.hub.broadcast({ type: "trace.start", trace });

    let t = startedAt;
    let ctx = randInt(900, 2600);
    let failed = false;

    // Agent loop: plan → (tool → observe)* → summarize.
    const steps: { kind: "llm" | "tool"; tool?: string; big?: boolean }[] = [{ kind: "llm" }];
    for (const tool of scenario.tools) {
      steps.push({ kind: "tool", tool });
      steps.push({ kind: "llm" });
    }
    steps.push({ kind: "llm", big: true });

    for (const step of steps) {
      if (live && !this.alive) break;
      const spanStart = t;

      if (step.kind === "llm") {
        const cache = spanStart > startedAt ? Math.round((ctx + 1200) * randFloat(0.3, 0.7)) : 0;
        const tokensIn = ctx + 1200 - cache;
        const tokensOut = step.big ? randInt(500, 1600) : randInt(90, 700);
        const latency = Math.min(6500, Math.round(650 + tokensOut * randFloat(1.6, 3.4)));
        const end = spanStart + latency;
        const span: NewSpan = {
          traceId: trace.id,
          type: "llm",
          name: model,
          model,
          status: "ok",
          startedAt: spanStart,
          endedAt: end,
          tokensIn,
          tokensOut,
          tokensCache: cache,
          costUsd: costOf(model, tokensIn, tokensOut, cache),
          input: { messages: randInt(2, 14), system: true },
          output: { stopReason: step.big ? "end_turn" : "tool_use", text_preview: step.big ? "Done — summary ready." : "Calling a tool…" },
        };
        const saved = this.store.addSpan(span);
        ctx += Math.round(tokensOut * 0.85);
        if (live) {
          await sleep(Math.min(latency, 700) + randInt(60, 220));
          this.hub.broadcast({ type: "span.add", span: saved });
          const cur = this.store.getTrace(trace.id);
          if (cur) this.hub.broadcast({ type: "trace.update", trace: cur });
        }
        t = end + randInt(20, 140);
      } else {
        const io = toolIO(step.tool!);
        const latency = randInt(40, 1100);
        const isFail = RISKY.has(step.tool!) && !failed && Math.random() < 0.13;
        const end = spanStart + latency;
        const span: NewSpan = {
          traceId: trace.id,
          type: "tool",
          name: step.tool!,
          status: isFail ? "error" : "ok",
          startedAt: spanStart,
          endedAt: end,
          input: io.args,
          output: isFail ? null : io.result,
          error: isFail ? io.error : null,
        };
        const saved = this.store.addSpan(span);
        ctx += randInt(150, 900);
        if (live) {
          await sleep(Math.min(latency, 600) + randInt(40, 160));
          this.hub.broadcast({ type: "span.add", span: saved });
        }
        t = end + randInt(20, 160);
        if (isFail) {
          failed = true;
          break;
        }
      }
    }

    const finished: Trace | null = this.store.finishTrace(
      trace.id,
      failed ? "error" : "ok",
      t,
      failed ? "A tool call failed; the run was aborted." : null,
    );
    if (live && finished) this.hub.broadcast({ type: "trace.end", trace: finished });
  }
}
