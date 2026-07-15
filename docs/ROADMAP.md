# AgentGlass — technical improvement backlog

The product is feature-complete across the original 7 phases. This is the next
iteration: concrete, prioritized tasks. Each has a **goal**, **why**, an
**approach** (files + technical direction), and **acceptance** criteria.

Legend: **P0** = biggest product/launch impact · **P1** = launch assets + polish
· **P2** = depth & quality.

---

## P0 — Close the gap between real captures and the simulator

### 1. Reconstruct tool spans from proxy traffic
**Goal:** When a real agent runs through the proxy, show the full tool-call tree
in the inspector — not just LLM spans.
**Why:** `src/proxy.ts` currently records exactly one `llm` span per call. The
simulator produces rich `llm`+`tool` waterfalls; real captures are flat, so the
inspector's best feature (the loop, the waterfall) only shines on demo data. This
is the #1 thing that makes AgentGlass actually deliver on its promise for real
agents.
**Approach:**
- In `proxy.ts`, parse tool calls out of the provider response and tool results
  out of the *next* request, keyed by tool id:
  - **Anthropic:** response `content[]` → `{type:"tool_use", id, name, input}`.
    Next request messages → `{role:"user", content:[{type:"tool_result",
    tool_use_id, content}]}`.
  - **OpenAI:** response `choices[0].message.tool_calls[]`. Next request →
    `{role:"tool", tool_call_id, content}`.
- Keep a per-trace `Map<toolUseId, {name, input, startedAt}>` (extend
  `Correlator` or a sibling). When the result arrives in the next call, emit a
  `tool` span (start = after the previous LLM span, end = when the next request
  arrives) with input+output, `broadcast` it, and roll it up.
- Order spans by time so the waterfall reads correctly.
**Files:** `src/proxy.ts`, maybe `src/types.ts`.
**Acceptance:** A real (or mock) Claude Code / OpenAI tool-using run through the
proxy shows `tool` spans interleaved with `llm` spans in the inspector.

### 2. Retention & data management (+ a ConfirmModal)
**Goal:** Clear traces, auto-retention, and a visible DB size.
**Why:** Traces grow unbounded today; there's no prune. A real user needs "clear"
and a retention policy.
**Approach:**
- Store: `deleteOlderThan(ms)`, `dbSizeBytes()` (`PRAGMA page_count * page_size`),
  reuse `clearAll()`.
- API: `DELETE /api/traces` (all), `GET/PUT /api/settings/retention`; run a
  retention sweep on boot + daily.
- Settings page: "Clear all traces" (**must** use a `ConfirmModal` per house
  rules — the app has none yet, build `web/src/components/ConfirmModal.tsx`),
  retention select (7 / 30 / 90 / never), DB-size readout.
**Files:** `src/db.ts`, `src/api.ts`, `web/src/pages/Settings.tsx`, new
`web/src/components/ConfirmModal.tsx`.
**Acceptance:** Can clear (with confirmation), set retention, see DB size; old
traces are swept.

### 3. Streaming assistant (SSE)
**Goal:** Assistant answers stream token-by-token in LLM mode.
**Why:** Better chat UX; matches the reference dashboards.
**Approach:** `POST /api/assistant/stream` returns SSE; `callLLM` with
`stream:true`, forward deltas. Rail consumes the stream and appends. Local answers
can appear instantly (or type out).
**Files:** `src/assistant.ts`, `src/api.ts`, `web/src/components/AssistantRail.tsx`.
**Acceptance:** With a key configured, answers stream in live.

---

## P1 — Launch assets & polish

### 4. Animated demo GIF in the README
**Goal:** A ~12s screencast at the top of the README.
**Why:** The single biggest virality asset — a moving demo sells the tool in two
seconds. Static screenshots are good; a GIF is better.
**Approach:** Record the live dashboard (runs streaming) → open a trace (waterfall
+ context chart) → ask the assistant. Capture with a screen recorder, optimize
with `gifski`/`ffmpeg` to a tight loop. Embed as `docs/demo.gif`.
**Acceptance:** `docs/demo.gif` renders at the top of the README.

### 5. Publish `npx agentglass` + a container image
**Goal:** `npx agentglass` runs it with no clone; `docker pull ghcr.io/…/agentglass`.
**Why:** Frictionless "try" = adoption. `npx agentglass` is a killer install line.
**Approach:** `prepublishOnly: npm run build`; `files` already set; confirm the npm
name is free (flip if not). GH Actions to build + push the Docker image to GHCR on
tag. (Docker image build itself is verified-by-equivalence today; actually build it
once the Docker daemon is up.)
**Acceptance:** `npx agentglass@latest` starts the server; image pullable.

### 6. Hosted read-only demo
**Goal:** A public URL running the simulator (proxy disabled) so people try
without installing.
**Why:** HN/Twitter visitors click a link, not `git clone`. Huge top-of-funnel.
**Approach:** Deploy to Fly/Render/a small VPS with `AGENTGLASS_SIMULATE=1` and the
`/v1/*` proxy routes disabled (read-only). Link from the README.
**Acceptance:** A live demo URL that mirrors local, using seeded data.

### 7. Light theme + toggle
**Goal:** A light "field manual" theme alongside the dark one, toggled from the
top bar.
**Why:** House rule (ship both themes, both intentional); broader appeal.
**Approach:** Add a `ThemeCtx` (provider + `localStorage`), a `.theme-light` token
override block in `index.css`, and a topbar toggle. Both themes must feel
deliberate, not an auto-invert.
**Files:** `web/src/lib/theme.tsx` (new), `web/src/index.css`, `Topbar.tsx`,
`main.tsx`.
**Acceptance:** Toggle flips both themes; light mode is intentional.

### 8. ⌘K command palette + toasts
**Goal:** ⌘K to jump to any page or recent trace; toasts for actions.
**Why:** House patterns; pro-grade UX.
**Approach:** A palette component (fuzzy over nav items + `/api/traces`); a tiny
toast pubsub (`success`/`error`) shown on save-key, export, clear, etc.
**Files:** `web/src/components/CommandPalette.tsx`, `web/src/components/Toaster.tsx`.
**Acceptance:** ⌘K opens/searches; actions toast.

---

## P2 — Depth & quality

### 9. OTLP / SDK ingest endpoint
**Goal:** `POST /api/ingest/spans` (or OTel `/v1/traces`) accepts pushed spans so
SDK-instrumented apps can report without the proxy.
**Why:** Broadens compatibility beyond base-URL swapping.
**Approach:** JSON body → `store.createTrace` + `addSpan` + broadcast. Optional: a
tiny TS/Python helper that sets `x-agentglass-session` and posts spans.
**Acceptance:** A posted span batch shows as a trace.

### 10. More providers + editable pricing
**Goal:** Gemini in the proxy + pricing; user-editable pricing table.
**Approach:** Add Gemini upstream + pricing rows; Settings gets an editable
pricing grid persisted to `settings`; `costOf` reads overrides first.
**Acceptance:** Gemini calls record with cost; custom prices apply.

### 11. CI (GitHub Actions)
**Goal:** typecheck + test + build on every push / PR.
**Approach:** `.github/workflows/ci.yml` — Node 24: `npm ci`, `npm --prefix web
ci`, `npm run typecheck`, `npm test`, `npm run build`.
**Acceptance:** A green check on commits; red on breakage.

### 12. Errors view, latency percentiles, full-text search
- **Errors page:** grouped failed runs (by tool / error message).
- **Percentiles:** p50/p95/p99 latency in `stats()` and on the Overview.
- **Search:** full-text over span input/output (SQLite FTS5) so you can find
  "which run mentioned X".

### 13. Playwright E2E smoke test
**Goal:** One deterministic end-to-end test.
**Approach:** Load the dashboard, open a trace, expand a span, ask the assistant —
assert each renders. Add to CI.

### 14. Guard against DB bloat from huge payloads
**Goal:** Don't store multi-MB prompts verbatim.
**Approach:** In `addSpan` (or the proxy `record`), truncate `input`/`output` to
the first ~32 KB with a `"truncated": true` marker.
**Acceptance:** A giant prompt run stays small in the DB; the inspector shows a
"truncated" note.

---

## Suggested order for tomorrow

1. **#1 tool spans from the proxy** — the biggest product win; makes real captures
   as rich as the sim.
2. **#4 demo GIF** + **#5 npx/Docker publish** + **#6 hosted demo** — the launch
   trio; cheap, huge reach.
3. **#2 retention + ConfirmModal** and **#11 CI** — production hygiene.
4. Then polish (#3 streaming, #7 light theme, #8 ⌘K) as time allows.

Once #1 and the launch trio are done, it's ready for **Show HN + r/selfhosted +
r/LocalLLaMA** (Tue–Thu, 8–10 AM PT).
