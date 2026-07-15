import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Vault } from "./vault.js";
import { costOf, priceFor } from "./pricing.js";
import { Store } from "./db.js";
import { ask } from "./assistant.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ag-test-"));
}

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
});
