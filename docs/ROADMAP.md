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
- **Assistant providers.** Thirteen plus a custom endpoint (`src/llm.ts`), keys
  stored per provider, keyless local Ollama / LM Studio, and "Load models" that
  asks the provider what it serves instead of trusting a hardcoded list.
- **Retention & data management.** Configurable window swept on boot and every
  six hours, database-size readout, clear-all — behind a `ConfirmModal`.
- **Streaming assistant.** `POST /api/assistant/stream` (SSE); `ask()` is now a
  collector over `askStream()`, so there's one code path.
- **Demo GIF.** `docs/demo.gif` at the top of the README; `scripts/record-demo.mjs`
  re-cuts it (Playwright → webm → ffmpeg palettegen).
- **Read-only mode.** `AGENTGLASS_READONLY=1` for a public demo: no proxy, no
  writes, no model-discovery (it fetches a caller-supplied URL). The dashboard
  reads the flag and drops the controls that would 403.
- **Packaging & CI.** `prepublishOnly` + repository metadata; `.github/workflows/`
  checks every push and publishes a multi-arch GHCR image on tag; `deploy/fly.toml`
  for the demo.

---

## P0 — Launch (all blocked on an account, not on code)

Everything below is prepared and verified locally. What's left needs credentials
this repo shouldn't hold.

### 1. Unblock GitHub Actions
**Status:** The CI workflow is committed and correct, but the first run never
started: *"the job was not started because your account is locked due to a
billing issue"*. The whole sequence — `npm ci` (both lockfiles), typecheck, 12
tests, build, and the health smoke-check — passes locally on a clean install.
**Do:** Sort out GitHub billing, then re-run the workflow.

### 2. `npm publish`
**Status:** The name `agentglass` is free. The tarball (140 kB, `dist/` +
`web/dist/`) was packed, installed into a clean project, and the bin ran: it
boots, serves the dashboard out of the package, and the proxy forwards upstream.
**Do:** `npm login && npm publish` — `prepublishOnly` builds first.

### 3. Deploy the demo
**Status:** `deploy/fly.toml` is read-only + simulator + no volume, so every cold
start seeds a fresh week and it can't grow. Read-only mode is verified: writes
403, the SSRF vector is closed, `/v1/*` explains itself, and the assistant still
answers for free.
**Do:** `fly deploy --config deploy/fly.toml`, then link it from the README.

### 4. Push the container image
**Status:** `release.yml` builds multi-arch to GHCR on tag and smoke-tests the
published image. Never built locally — the Docker daemon was down all session.
**Do:** Tag a release once Actions runs (`git tag v0.1.0 && git push --tags`).

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

1. **Unblock the account** (#1), then #2 publish, #3 deploy, #4 tag. These are
   minutes of work each once the credentials are there.
2. **#5 screenshots** — cheap, and they're the first thing a visitor reads.
3. Then polish (#6 light theme, #7 ⌘K, #8 provider chips) and depth as time allows.

Once #1–#4 land it's ready for **Show HN + r/selfhosted + r/LocalLLaMA**
(Tue–Thu, 8–10 AM PT).
