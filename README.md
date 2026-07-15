<div align="center">

# ✦ Glasswing

### The glass box for your AI agents.

**Capture, inspect, and replay every agent run — no SDK, no code changes.**
Point your agent's base URL at Glasswing and see every LLM call, tool
invocation, token, and dollar it spends. Live.

![status](https://img.shields.io/badge/status-alpha-38e1c8?style=for-the-badge)
![license](https://img.shields.io/badge/license-Apache--2.0-2c313d?style=for-the-badge)
![node](https://img.shields.io/badge/node-%E2%89%A522-2c313d?style=for-the-badge&logo=nodedotjs&logoColor=white)
![no native deps](https://img.shields.io/badge/native%20deps-zero-8b7bff?style=for-the-badge)

</div>

---

## The problem

Your agent just made 14 LLM calls, invoked 6 tools, burned 180k tokens, and cost
you \$2.30 — and you have **no idea** what happened inside. Which step blew the
context window? Which tool call failed and got silently retried? Where did the
money go? Agents are black boxes.

**Glasswing makes them glass.** It sits between your agent and the model provider,
records everything, and streams it into a dashboard you can actually read.

```
   your agent  ──▶  Glasswing  ──▶  Anthropic / OpenAI
                        │
                        ▼
                 records + streams
                        │
                        ▼
                 📊 the dashboard
```

## Why it's different

- **Zero instrumentation.** No SDK to install, no wrapper to import. Set one env
  var (`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`) and you're capturing. Works with
  Claude Code, the OpenAI SDK, LangChain, or anything that speaks the wire format.
- **Local-first.** Everything runs on your machine and stays there. One process,
  one SQLite file, no cloud, no account.
- **No native modules.** Built on Node's built-in `node:sqlite` — nothing to
  compile, installs clean on every platform.
- **Reads like an instrument.** A dense, dark, purpose-built UI: tool-call trees,
  per-step token & cost meters, a context-window timeline, and run diffs.

## Features

| | |
|---|---|
| 🛰️ **Recording proxy** | Anthropic- & OpenAI-compatible endpoints that transparently forward and record — streaming preserved. |
| 🌲 **Trace explorer** | Every run as a tree of spans: LLM calls, tool executions, nested agents, events. |
| 💸 **Token & cost accounting** | Per-step and per-run input / output / cache tokens and USD, rolled up automatically. |
| ⚡ **Live stream** | Runs light up in the dashboard as they happen over WebSocket. |
| 🧵 **Context timeline** | See the context window grow call-by-call and spot what blew the budget. |
| 🔀 **Run diff** | Compare two runs side by side — messages, tools, tokens, latency. |
| 📈 **Analytics** | Spend and latency over time, breakdowns by model and tool, an activity heatmap. |
| 🤖 **Ask your runs** | A built-in assistant that answers questions about your traces in plain language. |

> Glasswing is under active, in-the-open development — features land commit by
> commit. See the [roadmap](#roadmap) for what's live and what's next.

## Quickstart

```bash
git clone https://github.com/vugarfamiloglu/glasswing.git
cd glasswing
npm install && npm --prefix web install
npm run dev
```

Open **http://localhost:4318** (dev) — the dashboard is live with simulated agent
runs so you can explore immediately. Then point a real agent at it:

```bash
# Claude / Anthropic SDK
export ANTHROPIC_BASE_URL=http://localhost:4319

# OpenAI SDK
export OPENAI_BASE_URL=http://localhost:4319/v1
```

Run your agent as usual — every call now shows up in Glasswing.

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| ![Node.js](https://img.shields.io/badge/-Node.js%2024-393?logo=nodedotjs&logoColor=white) | Server runtime — one process serves API, WebSocket, proxy, and UI |
| ![Hono](https://img.shields.io/badge/-Hono-e36002?logo=hono&logoColor=white) | Tiny, fast HTTP + WebSocket framework |
| ![SQLite](https://img.shields.io/badge/-node%3Asqlite-003b57?logo=sqlite&logoColor=white) | Built-in trace store (WAL) — no native modules |
| ![React](https://img.shields.io/badge/-React%2019-20232a?logo=react&logoColor=61dafb) | Dashboard SPA |
| ![Vite](https://img.shields.io/badge/-Vite-646cff?logo=vite&logoColor=white) | Frontend build + dev server |
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178c6?logo=typescript&logoColor=white) | End to end |

## Architecture

```
glasswing/
  src/            server (Node + Hono + node:sqlite)
    index.ts        entry — API + WebSocket + proxy + SPA hosting
    db.ts           trace store (traces → spans, WAL, rollups)
    hub.ts          live event fan-out
    api.ts          REST surface
  web/            dashboard (Vite + React 19 + TypeScript)
    src/            shell, pages, hand-rolled SVG telemetry views
```

## Roadmap

- [x] Trace store, live hub, dashboard shell
- [ ] Trace simulator (rich demo data out of the box)
- [ ] Recording proxy (Anthropic + OpenAI)
- [ ] Trace explorer + run inspector (tool tree, token/cost meters)
- [ ] Context-window timeline & run diff
- [ ] Analytics (spend/latency/heatmap) + CSV export
- [ ] Ask-your-runs assistant
- [ ] Single-binary distribution + Docker

## License

[Apache-2.0](LICENSE)
