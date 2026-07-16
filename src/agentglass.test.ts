import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Vault } from "./vault.js";
import { costOf, priceFor, providerOf } from "./pricing.js";
import { ANTHROPIC, OPENAI } from "./providers.js";
import { ToolTracker } from "./proxy.js";
import { setRetentionDays, sweepRetention } from "./retention.js";
import { configuredProviders, resolveTarget, saveKey, type LlmTarget, type Target } from "./llm.js";
import { Store } from "./db.js";
import { ask, askStream, type AssistantChunk } from "./assistant.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ag-test-"));
}

/** Assert a target resolved and hand back the LLM it points at. */
function ready(target: Target): LlmTarget {
  assert.equal(target.status, "ready");
  return (target as Extract<Target, { status: "ready" }>).llm;
}

const DAY = 86_400_000;

test("vault seals and opens a secret, rejects tampering", () => {
  const v = new Vault(tmp());
  const sealed = v.seal("sk-super-secret");
  assert.notEqual(sealed, "sk-super-secret");
  assert.equal(v.open(sealed), "sk-super-secret");
  assert.equal(v.open("not-a-real-payload"), null);
});

test("pricing computes USD from tokens", () => {
  // claude-sonnet: input $3 / output $15 per 1M tokens.
  const expected = (1000 * 3 + 1000 * 15) / 1_000_000;
  assert.ok(Math.abs(costOf("claude-sonnet-4", 1000, 1000, 0) - expected) < 1e-9);
  // unknown models fall back to a positive default price.
  assert.ok(priceFor("some-unknown-model").input > 0);
});

test("pricing resolves the most specific catalog row", () => {
  // A dated id must land on its own row, not the family fallback — Opus 4.8 is
  // $5/$25 while Opus 4.1 is still $15/$75.
  assert.equal(priceFor("claude-opus-4-8-20260101").input, 5);
  assert.equal(priceFor("claude-opus-4-1-20250805").input, 15);
  assert.equal(priceFor("claude-3-opus-20240229").input, 15);
  // Bedrock prefixes the vendor onto the id.
  assert.equal(priceFor("anthropic.claude-sonnet-5").input, 3);
  assert.equal(providerOf("anthropic.claude-sonnet-5"), "anthropic");
  // Longer keys win over the ones they contain.
  assert.equal(priceFor("gpt-4o-mini").input, 0.15);
  assert.equal(priceFor("gpt-4o").input, 2.5);
  assert.equal(providerOf("gemini-2.5-flash-lite"), "google");
  assert.equal(providerOf("nothing-we-know-about"), null);
});

test("pricing bills cache reads and writes at their own rates", () => {
  // Anthropic reads back at 0.1x input and writes at 1.25x, so a cached run
  // costs materially less than the same tokens at full price.
  const p = priceFor("claude-sonnet-4-6");
  assert.equal(p.cache, 0.3);
  assert.equal(p.cacheWrite, 3.75);
  const expected = (1000 * 3 + 1000 * 15 + 1000 * 0.3 + 1000 * 3.75) / 1_000_000;
  assert.ok(Math.abs(costOf("claude-sonnet-4-6", 1000, 1000, 1000, 1000) - expected) < 1e-9);
});

test("anthropic adapter reads usage, tool calls, and tool results", () => {
  const json = {
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 50,
    },
    content: [
      { type: "text", text: "let me look" },
      { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } },
    ],
  };

  const usage = ANTHROPIC.usageFromJson(json);
  assert.equal(usage.tokensIn, 100);
  assert.equal(usage.tokensCacheRead, 900);
  assert.equal(usage.tokensCacheWrite, 50);

  assert.deepEqual(ANTHROPIC.toolCallsFromJson(json), [
    { id: "toolu_1", name: "read_file", input: { path: "a.ts" } },
  ]);

  assert.deepEqual(
    ANTHROPIC.toolResultsFromRequest({
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1" }] },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ENOENT", is_error: true }],
        },
      ],
    }),
    [{ id: "toolu_1", output: "ENOENT", isError: true }],
  );
});

test("anthropic adapter rebuilds streamed tool calls from json deltas", () => {
  const sse = [
    `data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_9","name":"grep","input":{}}}`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"q\\":"}}`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"todo\\"}"}}`,
    `data: {"type":"message_delta","usage":{"output_tokens":31}}`,
  ].join("\n");

  assert.deepEqual(ANTHROPIC.toolCallsFromStream(sse), [
    { id: "toolu_9", name: "grep", input: { q: "todo" } },
  ]);
  const usage = ANTHROPIC.usageFromStream(sse);
  assert.equal(usage.tokensIn, 12);
  assert.equal(usage.tokensOut, 31);
});

test("openai adapter separates cached tokens and rebuilds streamed tool calls", () => {
  // prompt_tokens already counts the cached ones — billing both double-charges.
  const usage = OPENAI.usageFromJson({
    usage: { prompt_tokens: 1000, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 768 } },
  });
  assert.equal(usage.tokensIn, 232);
  assert.equal(usage.tokensCacheRead, 768);

  const sse = [
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"run_tests","arguments":""}}]}}]}`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"suite\\":\\"unit\\"}"}}]}}]}`,
    `data: [DONE]`,
  ].join("\n");
  assert.deepEqual(OPENAI.toolCallsFromStream(sse), [
    { id: "call_1", name: "run_tests", input: { suite: "unit" } },
  ]);

  assert.deepEqual(
    OPENAI.toolResultsFromRequest({
      messages: [{ role: "tool", tool_call_id: "call_1", content: "3 passed" }],
    }),
    [{ id: "call_1", output: "3 passed", isError: false }],
  );
});

test("tool tracker pairs a call with the result on the next request", () => {
  const tracker = new ToolTracker();
  tracker.open("sess", "tr_1", [{ id: "toolu_1", name: "read_file", input: { path: "a.ts" } }], 1000);

  // A result whose call we never saw is ignored, not invented.
  assert.equal(tracker.close("sess", [{ id: "toolu_x", output: "x", isError: false }]).length, 0);
  // Neither is one from a different agent session.
  assert.equal(tracker.close("other", [{ id: "toolu_1", output: "x", isError: false }]).length, 0);

  const done = tracker.close("sess", [{ id: "toolu_1", output: "contents", isError: false }]);
  assert.equal(done.length, 1);
  assert.equal(done[0]?.traceId, "tr_1");
  assert.equal(done[0]?.name, "read_file");
  assert.equal(done[0]?.startedAt, 1000);

  // Agents resend their whole history every turn — that must not re-record.
  assert.equal(tracker.close("sess", [{ id: "toolu_1", output: "contents", isError: false }]).length, 0);
});

test("llm targets resolve per provider and keys never cross between them", () => {
  const db = new Store(tmp());
  const v = new Vault(tmp());

  // Nothing connected is the normal local-only state, not a failure.
  assert.equal(resolveTarget(db, v).status, "unconfigured");

  // A local runtime is usable with no key at all.
  db.setSetting("assistant_provider", "ollama");
  const local = ready(resolveTarget(db, v));
  assert.equal(local.baseUrl, "http://localhost:11434/v1");
  assert.equal(local.key, "");

  saveKey(db, v, "openai", "sk-openai");
  db.setSetting("assistant_provider", "openai");
  const openai = ready(resolveTarget(db, v));
  assert.equal(openai.key, "sk-openai");
  assert.equal(openai.model, "gpt-4.1"); // the provider's default, unasked

  // Switching provider must not hand OpenAI's key to Anthropic.
  db.setSetting("assistant_provider", "anthropic");
  assert.equal(resolveTarget(db, v).status, "unconfigured");
  // ...and switching back finds it again.
  db.setSetting("assistant_provider", "openai");
  assert.equal(ready(resolveTarget(db, v)).key, "sk-openai");

  // An unsaved key can be tried before it's committed — this is "Load models".
  assert.equal(ready(resolveTarget(db, v, { provider: "groq", key: "gsk-probe" })).key, "gsk-probe");

  // A custom endpoint is unreachable until it's told where to go.
  saveKey(db, v, "custom", "sk-x");
  db.setSetting("assistant_provider", "custom");
  assert.equal(resolveTarget(db, v).status, "broken");
  assert.equal(ready(resolveTarget(db, v, { baseUrl: "http://localhost:8000/v1/" })).baseUrl,
    "http://localhost:8000/v1"); // trailing slash trimmed

  const ok = configuredProviders(db, v);
  assert.ok(ok.includes("openai"));
  assert.ok(ok.includes("ollama")); // keyless providers are always ready
  assert.ok(!ok.includes("anthropic"));
});

test("store rolls span totals up into the trace and aggregates", () => {
  const db = new Store(tmp());
  const t = db.createTrace({ name: "run", source: "sim", model: "claude-sonnet-4" });
  db.addSpan({
    traceId: t.id,
    type: "llm",
    name: "claude-sonnet-4",
    model: "claude-sonnet-4",
    startedAt: 1,
    endedAt: 2,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.01,
  });
  db.addSpan({
    traceId: t.id,
    type: "tool",
    name: "read_file",
    startedAt: 2,
    endedAt: 3,
    status: "error",
  });

  const got = db.getTrace(t.id);
  assert.ok(got);
  assert.equal(got.spanCount, 2);
  assert.equal(got.toolCount, 1);
  assert.equal(got.tokensIn, 100);
  assert.equal(got.tokensOut, 50);

  const models = db.byModel();
  assert.equal(models[0]?.model, "claude-sonnet-4");
  assert.equal(models[0]?.calls, 1);

  const tools = db.byTool();
  assert.equal(tools[0]?.tool, "read_file");
  assert.equal(tools[0]?.errors, 1);
});

test("retention prunes traces past the configured window", () => {
  const db = new Store(tmp());
  const old = db.createTrace({ name: "old", source: "sim", startedAt: Date.now() - 40 * DAY });
  db.addSpan({ traceId: old.id, type: "llm", name: "m", startedAt: 1, endedAt: 2 });
  db.createTrace({ name: "fresh", source: "sim" });

  // No window configured — nothing is ever deleted behind the user's back.
  assert.equal(sweepRetention(db), 0);
  assert.equal(db.traceCount(), 2);

  assert.equal(setRetentionDays(db, 30), 30);
  assert.equal(sweepRetention(db), 1);
  assert.equal(db.traceCount(), 1);
  assert.equal(db.getSpans(old.id).length, 0);
  assert.ok(db.dbSizeBytes() > 0);
});

test("assistant answers spend questions locally with no key", async () => {
  const db = new Store(tmp());
  const v = new Vault(tmp());
  const t = db.createTrace({ name: "run", source: "sim", model: "gpt-4o" });
  db.addSpan({
    traceId: t.id,
    type: "llm",
    name: "gpt-4o",
    model: "gpt-4o",
    startedAt: 1,
    endedAt: 2,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.02,
  });
  db.finishTrace(t.id, "ok", 3);

  const reply = await ask(db, v, "how much have I spent?");
  assert.equal(reply.source, "local");
  assert.match(reply.answer, /spent/i);

  // The streaming path carries the same answer and ends with one done chunk.
  const chunks: AssistantChunk[] = [];
  await askStream(db, v, "how much have I spent?", undefined, (chunk) => {
    chunks.push(chunk);
  });
  const streamed = chunks.map((c) => (c.type === "delta" ? c.text : "")).join("");
  assert.equal(streamed, reply.answer);
  assert.deepEqual(chunks.at(-1), { type: "done", source: "local" });
});
