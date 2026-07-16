# AgentGlass — technical improvement backlog

Concrete, prioritized tasks. Each has a **goal**, **why**, an **approach** (files
+ technical direction), and **acceptance** criteria.

Legend: **P0** = biggest product/launch impact · **P1** = polish · **P2** = depth.

## Done

- **Tool spans from proxy traffic.** Tool calls are parsed out of every response
  (Anthropic `tool_use`, OpenAI `tool_calls`, JSON and streamed) and closed when
  their results arrive on the next request, so a real capture now shows the same
  `llm → tool → llm` waterfall the simulator does. Wire formats moved to
  `src/providers.ts`; the proxy is format-blind.
- **Model catalog.** ~90 models across ten providers, longest-prefix matched,
  with cache reads and writes priced separately. `GET /api/models` feeds the UI.
- **Retention & data management.** Configurable window swept on boot and every
  six hours, database-size readout, clear-all — behind a `ConfirmModal`.
- **Streaming assistant.** `POST /api/assistant/stream` (SSE); `ask()` is now a
  collector over `askStream()`, so there's one code path.

---

## P0 — Launch

### 1. Animated demo GIF in the README
**Goal:** A ~12s screencast at the top of the README.
**Why:** The single biggest virality asset — a moving demo sells the tool in two
seconds. Static screenshots are good; a GIF is better.
**Approach:** Record the live dashboard (runs streaming) → open a trace (waterfall
+ context chart) → ask the assistant. Capture with a screen recorder, optimize
with `gifski`/`ffmpeg` to a tight loop. Embed as `docs/demo.gif`.
**Acceptance:** `docs/demo.gif` renders at the top of the README.

### 2. Publish `npx agentglass` + a container image
**Goal:** `npx agentglass` runs it with no clone; `docker pull ghcr.io/…/agentglass`.
**Why:** Frictionless "try" = adoption. `npx agentglass` is a killer install line.
**Approach:** `prepublishOnly: npm run build`; `files` already set; confirm the npm
name is free (flip if not). GH Actions to build + push the Docker image to GHCR on
tag. (The Docker build is verified-by-equivalence today; actually build it once the
Docker daemon is up.)
**Acceptance:** `npx agentglass@latest` starts the server; image pullable.

### 3. Hosted read-only demo
**Goal:** A public URL running the simulator (proxy disabled) so people try
without installing.
**Why:** HN/Twitter visitors click a link, not `git clone`. Huge top-of-funnel.
**Approach:** Deploy to Fly/Render/a small VPS with `AGENTGLASS_SIMULATE=1` and the
`/v1/*` proxy routes disabled (read-only). Link from the README.
**Acceptance:** A live demo URL that mirrors local, using seeded data.

### 4. CI (GitHub Actions)
**Goal:** typecheck + test + build on every push / PR.
**Approach:** `.github/workflows/ci.yml` — Node 24: `npm ci`, `npm --prefix web
ci`, `npm run typecheck`, `npm test`, `npm run build`.
**Acceptance:** A green check on commits; red on breakage.

---

## P1 — Polish

### 5. Re-shoot the screenshots
**Goal:** The 11 README screenshots predate the model catalog, so they show
`sonnet-4` / `opus-4` / `4o` where a new user now sees `claude-sonnet-4-6`,
`claude-opus-4-8`, `gpt-5`, `grok-4`, `deepseek-chat`. The Models and Overview
shots are the most visibly dated.
**Approach:** Clear traces, restart to reseed, re-capture at the same viewport.
**Acceptance:** Screenshots match what a fresh install shows.

### 6. Light theme + toggle
**Goal:** A light "field manual" theme alongside the dark one, toggled from the
top bar.
**Why:** House rule (ship both themes, both intentional); broader appeal.
**Approach:** Add a `ThemeCtx` (provider + `localStorage`), a `.theme-light` token
override block in `index.css`, and a topbar toggle. Both themes must feel
deliberate, not an auto-invert.
**Files:** `web/src/lib/theme.tsx` (new), `web/src/index.css`, `Topbar.tsx`,
`main.tsx`.
**Acceptance:** Toggle flips both themes; light mode is intentional.

### 7. ⌘K command palette + toasts
**Goal:** ⌘K to jump to any page or recent trace; toasts for actions.
**Why:** House patterns; pro-grade UX. Settings currently reports outcomes in an
inline line of text that a toast would carry better.
**Approach:** A palette component (fuzzy over nav items + `/api/traces`); a tiny
toast pubsub (`success`/`error`) shown on save-key, export, clear, retention.
**Files:** `web/src/components/CommandPalette.tsx`, `web/src/components/Toaster.tsx`.
**Acceptance:** ⌘K opens/searches; actions toast.

### 8. Provider chips on the Models page
**Goal:** Show which vendor each model belongs to now that ten are covered.
**Approach:** `providerOf()` already exists in `src/pricing.ts`; annotate
`byModel()` rows with it and render a tinted chip per provider.
**Acceptance:** The Models table reads as multi-provider at a glance.

---

## P2 — Depth & quality

### 9. User-editable pricing
**Goal:** Override any catalog rate, and add models the catalog doesn't know.
**Why:** List prices drift and providers ship faster than a table in a repo. The
catalog is honest about being approximate; this is what makes that acceptable.
**Approach:** Persist overrides to `settings`, load at boot, merge ahead of
`CATALOG` in `lookup()` (the matcher already takes a list — feed it
`[...overrides, ...CATALOG]`). Settings gets an editable grid seeded from
`GET /api/models`.
**Acceptance:** A custom price applies to new spans; a custom key prices a model
the catalog has never seen.

### 10. Native Gemini in the proxy
**Goal:** Record `generativelanguage.googleapis.com` traffic directly.
**Why:** Gemini already records through the OpenAI-compatible route, so this is
about the native API, not about coverage.
**Approach:** A third `Provider` in `src/providers.ts`. Note the differences: the
model is in the path (`/v1beta/models/{model}:generateContent`), usage is
`usageMetadata` (and `promptTokenCount` includes `cachedContentTokenCount` —
subtract, as with OpenAI), streaming is `?alt=sse`, and **`functionCall` has no
id**, so `ToolTracker` would need a name-keyed fallback.
**Acceptance:** A native Gemini tool-using run records with tool spans.

### 11. OTLP / SDK ingest endpoint
**Goal:** `POST /api/ingest/spans` (or OTel `/v1/traces`) accepts pushed spans so
SDK-instrumented apps can report without the proxy.
**Why:** Broadens compatibility beyond base-URL swapping.
**Approach:** JSON body → `store.createTrace` + `addSpan` + broadcast. Optional: a
tiny TS/Python helper that sets `x-agentglass-session` and posts spans.
**Acceptance:** A posted span batch shows as a trace.

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

## Suggested order

1. **The launch trio** (#1 GIF, #2 npx/Docker, #3 hosted demo) + **#4 CI** —
   the product is ready; this is reach.
2. **#5 screenshots** — cheap, and they're the first thing a visitor reads.
3. Then polish (#6 light theme, #7 ⌘K, #8 provider chips) and depth as time allows.

Once the launch trio is done it's ready for **Show HN + r/selfhosted +
r/LocalLLaMA** (Tue–Thu, 8–10 AM PT).
