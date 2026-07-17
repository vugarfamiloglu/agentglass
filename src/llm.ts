/**
 * The LLM providers the assistant can talk to.
 *
 * Not to be confused with `providers.ts`, which parses the traffic flowing
 * *through* the proxy. This is the other direction: the clients AgentGlass
 * calls out to when you've given the assistant a key.
 *
 * Nearly every vendor now serves an OpenAI-compatible /v1/chat/completions
 * endpoint, so supporting one is a base URL and a default model rather than a
 * whole new client. Anthropic's native Messages API is the exception worth
 * keeping — it's the key most AgentGlass users already have.
 *
 * Default models are a starting point, not a claim: model names churn, and
 * "Load models" in Settings asks the provider what it actually serves today.
 */
import type { Store } from "./db.js";
import type { Vault } from "./vault.js";

export interface LlmProvider {
  id: string;
  label: string;
  /** Which wire shape it speaks. */
  kind: "anthropic" | "openai";
  /** Prefix up to and including /v1. Empty means the user supplies it. */
  baseUrl: string;
  defaultModel: string;
  /** Local runtimes serve without auth. */
  keyless?: boolean;
  /** Shown under the key field — where to get one, or why you don't need one. */
  hint: string;
  /**
   * Which field caps the response.
   *
   * `max_completion_tokens` is OpenAI's newer name and the only one their
   * reasoning models accept. Almost every other OpenAI-compatible server still
   * speaks `max_tokens` — and ignores the newer name in silence rather than
   * rejecting it, which is the worse failure: asked for a cap of 20, a local
   * Ollama returned 692 tokens and reported `finish_reason: "stop"`, as though
   * it had simply finished. The caller believes it has a cap and has none.
   */
  tokenParam?: "max_tokens" | "max_completion_tokens";
}

export const LLM_PROVIDERS: readonly LlmProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-opus-4-8",
    hint: "console.anthropic.com → API keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    // GPT-5 spends its budget on reasoning tokens and can return nothing under
    // a small cap, so the default is the flagship that streams predictably.
    defaultModel: "gpt-4.1",
    hint: "platform.openai.com → API keys",
    // The only provider that needs the newer name — those same reasoning models
    // reject max_tokens outright.
    tokenParam: "max_completion_tokens",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    hint: "aistudio.google.com → Get API key",
  },
  {
    id: "xai",
    label: "xAI Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    hint: "console.x.ai → API keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    hint: "platform.deepseek.com → API keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    hint: "console.mistral.ai → API keys",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "",
    hint: "console.groq.com → API keys",
  },
  {
    id: "together",
    label: "Together",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "",
    hint: "api.together.ai → API keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    hint: "openrouter.ai/keys — one key, most models",
  },
  {
    id: "cohere",
    label: "Cohere",
    kind: "openai",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    defaultModel: "",
    hint: "dashboard.cohere.com → API keys",
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    kind: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    hint: "dashscope.console.aliyun.com → API keys",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "",
    keyless: true,
    hint: "runs on your machine — no key, no cost, nothing leaves it",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    keyless: true,
    hint: "runs on your machine — start the local server first",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    baseUrl: "",
    defaultModel: "",
    hint: "any /v1/chat/completions endpoint — vLLM, LiteLLM, Azure, a gateway…",
  },
];

export function providerById(id: string): LlmProvider {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0]!;
}

export interface LlmTarget {
  provider: LlmProvider;
  baseUrl: string;
  key: string;
  model: string;
}

export type Target =
  | { status: "ready"; llm: LlmTarget }
  | { status: "unconfigured" }
  | { status: "broken"; message: string };

export interface TargetOverrides {
  provider?: string;
  key?: string;
  baseUrl?: string;
  model?: string;
}

/** Keys are per provider, so switching back and forth doesn't lose them. */
const keySetting = (provider: string): string => `assistant_key:${provider}`;

export function storedKey(store: Store, vault: Vault, provider: string): string | null {
  let sealed = store.getSetting(keySetting(provider));
  // Fall back to the single-key layout this replaced.
  if (!sealed && store.getSetting("assistant_provider") === provider) {
    sealed = store.getSetting("assistant_key");
  }
  if (!sealed) return null;
  return vault.open(sealed);
}

export function saveKey(store: Store, vault: Vault, provider: string, key: string): void {
  store.setSetting(keySetting(provider), vault.seal(key));
}

export function forgetKey(store: Store, provider: string): void {
  store.setSetting(keySetting(provider), "");
  if (store.getSetting("assistant_provider") === provider) store.setSetting("assistant_key", "");
}

/** Which providers currently hold a usable key (or don't need one). */
export function configuredProviders(store: Store, vault: Vault): string[] {
  return LLM_PROVIDERS.filter((p) => p.keyless || storedKey(store, vault, p.id)).map((p) => p.id);
}

/**
 * Work out where the assistant should send a question. `over` lets a caller
 * try settings that haven't been saved yet, which is how "Load models" works
 * before you commit a key.
 */
export function resolveTarget(store: Store, vault: Vault, over: TargetOverrides = {}): Target {
  const id = over.provider ?? store.getSetting("assistant_provider") ?? "anthropic";
  const provider = providerById(id);

  const key = over.key ?? storedKey(store, vault, provider.id) ?? "";
  if (!key && !provider.keyless) {
    // Distinguish "nothing stored" from "stored but unreadable" — one is the
    // normal local-only state, the other means a tampered vault.
    const sealed = store.getSetting(keySetting(provider.id)) || store.getSetting("assistant_key");
    if (sealed) {
      return { status: "broken", message: "The stored key could not be read. Re-add it in **Settings**." };
    }
    return { status: "unconfigured" };
  }

  const rawBase = over.baseUrl ?? store.getSetting(`assistant_base_url:${provider.id}`) ?? "";
  const baseUrl = (rawBase || provider.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) {
    return { status: "broken", message: `${provider.label} needs a base URL. Add one in **Settings**.` };
  }

  const model = over.model ?? store.getSetting("assistant_model") ?? "";
  return { status: "ready", llm: { provider, baseUrl, key, model: model || provider.defaultModel } };
}

function authHeaders(llm: LlmTarget): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (llm.provider.kind === "anthropic") {
    headers["x-api-key"] = llm.key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (llm.key) {
    headers.authorization = `Bearer ${llm.key}`;
  }
  return headers;
}

/** Pull something readable out of a non-2xx provider response. */
async function apiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string };
    const err = j.error;
    if (typeof err === "string" && err) return err;
    if (err && typeof err === "object" && err.message) return err.message;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.trim().slice(0, 200) || `the provider returned ${res.status}`;
}

/** Read `data: {...}` events off a live SSE body as they arrive. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        /* non-JSON event — ignore */
      }
    }
  }
}

/** Ask the provider what it serves. Every OpenAI-compatible host has this. */
export async function listModels(llm: LlmTarget): Promise<string[]> {
  const res = await fetch(`${llm.baseUrl}/models`, { headers: authHeaders(llm) });
  if (!res.ok) throw new Error(await apiError(res));
  const json = (await res.json()) as { data?: { id?: unknown }[] };
  return (json.data ?? [])
    .map((m) => String(m.id ?? ""))
    .filter(Boolean)
    .sort();
}

/** Long enough for an answer about a trace, short enough not to ramble. */
const ANSWER_TOKENS = 1200;

export async function streamLLM(
  llm: LlmTarget,
  system: string,
  question: string,
  onText: (text: string) => Promise<void>,
): Promise<void> {
  const anthropic = llm.provider.kind === "anthropic";
  const res = await fetch(`${llm.baseUrl}/${anthropic ? "messages" : "chat/completions"}`, {
    method: "POST",
    headers: authHeaders(llm),
    body: JSON.stringify(
      anthropic
        ? {
            model: llm.model,
            stream: true,
            // Anthropic's own name for it, and required rather than optional.
            max_tokens: ANSWER_TOKENS,
            system,
            messages: [{ role: "user", content: question }],
          }
        : {
            model: llm.model,
            stream: true,
            // Default to max_tokens: it's what compat servers understand, and
            // one that doesn't will reject it loudly rather than ignore it.
            [llm.provider.tokenParam ?? "max_tokens"]: ANSWER_TOKENS,
            messages: [
              { role: "system", content: system },
              { role: "user", content: question },
            ],
          },
    ),
  });
  if (!res.ok || !res.body) throw new Error(await apiError(res));

  for await (const evt of sseEvents(res.body)) {
    if (!anthropic) {
      const choices = evt.choices;
      const first = Array.isArray(choices) ? (choices[0] as { delta?: { content?: unknown } }) : null;
      const text = first?.delta?.content;
      if (typeof text === "string" && text) await onText(text);
      continue;
    }
    if (evt.type === "content_block_delta") {
      // Thinking deltas stream through here too; only text reaches the user.
      const delta = evt.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === "text_delta" && delta.text) await onText(delta.text);
    } else if (evt.type === "error") {
      const err = evt.error as { message?: string } | undefined;
      throw new Error(err?.message ?? "the provider ended the stream");
    }
  }
}
