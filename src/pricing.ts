/**
 * Model catalog and pricing. Every rate is USD per 1M tokens.
 *
 * `key` is matched as a substring against whatever model name the provider
 * reports, and the longest match wins — so `claude-opus-4-8-20260101` resolves
 * to the `claude-opus-4-8` row rather than the generic `claude-opus` family
 * fallback, and `anthropic.claude-sonnet-5` (Bedrock's prefixed id) still
 * lands on `claude-sonnet-5`. Unmatched models get DEFAULT, so an unrecognised
 * name still produces a plausible cost rather than zero.
 *
 * These are list prices and they drift: providers cut rates and ship models
 * faster than a table in a repo can track. Check them against your provider's
 * pricing page before treating a dollar figure here as authoritative.
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "deepseek"
  | "meta"
  | "mistral"
  | "qwen"
  | "cohere"
  | "amazon";

export interface Price {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M tokens read back from the prompt cache. */
  cache: number;
  /** USD per 1M tokens written to the prompt cache. */
  cacheWrite: number;
}

export interface CatalogEntry extends Price {
  key: string;
  label: string;
  provider: ProviderId;
  /** Family fallbacks price unmatched versions; they aren't ids you'd call. */
  family?: boolean;
}

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Anthropic bills cache reads at 0.1x input and 5-minute cache writes at 1.25x. */
function claude(key: string, label: string, input: number, output: number): CatalogEntry {
  return {
    key,
    label,
    provider: "anthropic",
    input,
    output,
    cache: round(input * 0.1),
    cacheWrite: round(input * 1.25),
  };
}

/**
 * Everyone else discounts cached input by `cacheDiscount` and doesn't bill for
 * writing the cache. A discount of 0 means the provider has no cache tier, in
 * which case cached tokens simply cost full price.
 */
function entry(
  provider: ProviderId,
  key: string,
  label: string,
  input: number,
  output: number,
  cacheDiscount = 0,
): CatalogEntry {
  return {
    key,
    label,
    provider,
    input,
    output,
    cache: round(input * (1 - cacheDiscount)),
    cacheWrite: 0,
  };
}

const MODELS: readonly CatalogEntry[] = [
  // ---- Anthropic ----
  claude("claude-fable-5", "Claude Fable 5", 10, 50),
  claude("claude-mythos-5", "Claude Mythos 5", 10, 50),
  claude("claude-opus-4-8", "Claude Opus 4.8", 5, 25),
  claude("claude-opus-4-7", "Claude Opus 4.7", 5, 25),
  claude("claude-opus-4-6", "Claude Opus 4.6", 5, 25),
  claude("claude-opus-4-5", "Claude Opus 4.5", 5, 25),
  claude("claude-opus-4-1", "Claude Opus 4.1", 15, 75),
  claude("claude-opus-4", "Claude Opus 4", 15, 75),
  claude("claude-3-opus", "Claude Opus 3", 15, 75),
  // Sonnet 5 runs a $2/$10 introductory rate through 2026-08-31; this is the list price.
  claude("claude-sonnet-5", "Claude Sonnet 5", 3, 15),
  claude("claude-sonnet-4-6", "Claude Sonnet 4.6", 3, 15),
  claude("claude-sonnet-4-5", "Claude Sonnet 4.5", 3, 15),
  claude("claude-sonnet-4", "Claude Sonnet 4", 3, 15),
  claude("claude-3-7-sonnet", "Claude Sonnet 3.7", 3, 15),
  claude("claude-3-5-sonnet", "Claude Sonnet 3.5", 3, 15),
  claude("claude-haiku-4-5", "Claude Haiku 4.5", 1, 5),
  claude("claude-3-5-haiku", "Claude Haiku 3.5", 0.8, 4),
  claude("claude-3-haiku", "Claude Haiku 3", 0.25, 1.25),

  // ---- OpenAI ----
  entry("openai", "gpt-5.1", "GPT-5.1", 1.25, 10, 0.9),
  entry("openai", "gpt-5-mini", "GPT-5 mini", 0.25, 2, 0.9),
  entry("openai", "gpt-5-nano", "GPT-5 nano", 0.05, 0.4, 0.9),
  entry("openai", "gpt-5", "GPT-5", 1.25, 10, 0.9),
  entry("openai", "gpt-4.1-mini", "GPT-4.1 mini", 0.4, 1.6, 0.75),
  entry("openai", "gpt-4.1-nano", "GPT-4.1 nano", 0.1, 0.4, 0.75),
  entry("openai", "gpt-4.1", "GPT-4.1", 2, 8, 0.75),
  entry("openai", "gpt-4o-mini", "GPT-4o mini", 0.15, 0.6, 0.5),
  entry("openai", "gpt-4o", "GPT-4o", 2.5, 10, 0.5),
  entry("openai", "o4-mini", "o4-mini", 1.1, 4.4, 0.75),
  entry("openai", "o3-pro", "o3-pro", 20, 80),
  entry("openai", "o3-mini", "o3-mini", 1.1, 4.4, 0.5),
  entry("openai", "o3", "o3", 2, 8, 0.75),
  entry("openai", "o1-mini", "o1-mini", 1.1, 4.4, 0.5),
  entry("openai", "o1", "o1", 15, 60, 0.5),

  // ---- Google ----
  entry("google", "gemini-3-pro", "Gemini 3 Pro", 2, 12, 0.75),
  entry("google", "gemini-2.5-pro", "Gemini 2.5 Pro", 1.25, 10, 0.75),
  entry("google", "gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", 0.1, 0.4, 0.75),
  entry("google", "gemini-2.5-flash", "Gemini 2.5 Flash", 0.3, 2.5, 0.75),
  entry("google", "gemini-2.0-flash-lite", "Gemini 2.0 Flash-Lite", 0.075, 0.3, 0.75),
  entry("google", "gemini-2.0-flash", "Gemini 2.0 Flash", 0.1, 0.4, 0.75),
  entry("google", "gemini-1.5-pro", "Gemini 1.5 Pro", 1.25, 5, 0.75),
  entry("google", "gemini-1.5-flash", "Gemini 1.5 Flash", 0.075, 0.3, 0.75),

  // ---- xAI ----
  entry("xai", "grok-4-fast", "Grok 4 Fast", 0.2, 0.5, 0.75),
  entry("xai", "grok-4", "Grok 4", 3, 15, 0.75),
  entry("xai", "grok-code-fast", "Grok Code Fast", 0.2, 1.5, 0.75),
  entry("xai", "grok-3-mini", "Grok 3 Mini", 0.3, 0.5, 0.75),
  entry("xai", "grok-3", "Grok 3", 3, 15, 0.75),
  entry("xai", "grok-2", "Grok 2", 2, 10),

  // ---- DeepSeek ----
  entry("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", 0.55, 2.19, 0.75),
  entry("deepseek", "deepseek-chat", "DeepSeek Chat", 0.27, 1.1, 0.74),
  entry("deepseek", "deepseek-coder", "DeepSeek Coder", 0.27, 1.1, 0.74),
  entry("deepseek", "deepseek-r1", "DeepSeek R1", 0.55, 2.19, 0.75),
  entry("deepseek", "deepseek-v3", "DeepSeek V3", 0.27, 1.1, 0.74),

  // ---- Meta (open weights — the real rate depends on who hosts them) ----
  entry("meta", "llama-4-maverick", "Llama 4 Maverick", 0.27, 0.85),
  entry("meta", "llama-4-scout", "Llama 4 Scout", 0.18, 0.59),
  entry("meta", "llama-3.3-70b", "Llama 3.3 70B", 0.59, 0.79),
  entry("meta", "llama-3.1-405b", "Llama 3.1 405B", 3.5, 3.5),
  entry("meta", "llama-3.1-70b", "Llama 3.1 70B", 0.59, 0.79),
  entry("meta", "llama-3.1-8b", "Llama 3.1 8B", 0.18, 0.18),

  // ---- Mistral ----
  entry("mistral", "mistral-large", "Mistral Large", 2, 6),
  entry("mistral", "mistral-medium", "Mistral Medium", 0.4, 2),
  entry("mistral", "mistral-small", "Mistral Small", 0.1, 0.3),
  entry("mistral", "magistral-medium", "Magistral Medium", 2, 5),
  entry("mistral", "ministral-8b", "Ministral 8B", 0.1, 0.1),
  entry("mistral", "ministral-3b", "Ministral 3B", 0.04, 0.04),
  entry("mistral", "pixtral-large", "Pixtral Large", 2, 6),
  entry("mistral", "codestral", "Codestral", 0.3, 0.9),

  // ---- Qwen ----
  entry("qwen", "qwen3-coder", "Qwen3 Coder", 1, 5),
  entry("qwen", "qwen-max", "Qwen Max", 1.6, 6.4),
  entry("qwen", "qwen-plus", "Qwen Plus", 0.4, 1.2),
  entry("qwen", "qwen-turbo", "Qwen Turbo", 0.05, 0.2),

  // ---- Cohere ----
  entry("cohere", "command-r-plus", "Command R+", 2.5, 10),
  entry("cohere", "command-r7b", "Command R7B", 0.0375, 0.15),
  entry("cohere", "command-r", "Command R", 0.15, 0.6),
  entry("cohere", "command-a", "Command A", 2.5, 10),

  // ---- Amazon ----
  entry("amazon", "nova-premier", "Nova Premier", 2.5, 12.5),
  entry("amazon", "nova-pro", "Nova Pro", 0.8, 3.2),
  entry("amazon", "nova-lite", "Nova Lite", 0.06, 0.24),
  entry("amazon", "nova-micro", "Nova Micro", 0.035, 0.14),
];

/** Catch-all rows so a version we've never heard of still prices sensibly. */
const FAMILIES: readonly CatalogEntry[] = [
  claude("claude-opus", "Claude Opus", 5, 25),
  claude("claude-sonnet", "Claude Sonnet", 3, 15),
  claude("claude-haiku", "Claude Haiku", 1, 5),
  entry("google", "gemini", "Gemini", 1.25, 10, 0.75),
  entry("xai", "grok", "Grok", 3, 15, 0.75),
  entry("deepseek", "deepseek", "DeepSeek", 0.27, 1.1, 0.74),
  entry("meta", "llama", "Llama", 0.59, 0.79),
  entry("mistral", "mistral", "Mistral", 2, 6),
  entry("qwen", "qwen", "Qwen", 0.4, 1.2),
  entry("cohere", "command", "Command", 2.5, 10),
].map((e) => ({ ...e, family: true }));

export const CATALOG: readonly CatalogEntry[] = [...MODELS, ...FAMILIES];

const DEFAULT: Price = { input: 3, output: 15, cache: 0.3, cacheWrite: 0 };

/** The catalog row for a model name, or null when nothing matches. */
export function lookup(model: string): CatalogEntry | null {
  const m = model.toLowerCase();
  let best: CatalogEntry | null = null;
  for (const e of CATALOG) {
    if (m.includes(e.key) && e.key.length > (best?.key.length ?? 0)) best = e;
  }
  return best;
}

export function priceFor(model: string): Price {
  const hit = lookup(model);
  if (!hit) return DEFAULT;
  return { input: hit.input, output: hit.output, cache: hit.cache, cacheWrite: hit.cacheWrite };
}

/** Which vendor a model name belongs to, or null when we can't tell. */
export function providerOf(model: string): ProviderId | null {
  return lookup(model)?.provider ?? null;
}

export function costOf(
  model: string,
  tokensIn: number,
  tokensOut: number,
  tokensCacheRead = 0,
  tokensCacheWrite = 0,
): number {
  const p = priceFor(model);
  return (
    (tokensIn * p.input +
      tokensOut * p.output +
      tokensCacheRead * p.cache +
      tokensCacheWrite * p.cacheWrite) /
    1_000_000
  );
}

/** Models the simulator draws from, with rough usage weights. */
export const SIM_MODELS: { model: string; weight: number }[] = [
  { model: "claude-sonnet-4-6", weight: 24 },
  { model: "claude-opus-4-8", weight: 10 },
  { model: "claude-haiku-4-5", weight: 12 },
  { model: "gpt-5", weight: 12 },
  { model: "gpt-5-mini", weight: 8 },
  { model: "gpt-4.1", weight: 6 },
  { model: "gpt-4o-mini", weight: 6 },
  { model: "gemini-2.5-pro", weight: 6 },
  { model: "gemini-2.5-flash", weight: 5 },
  { model: "grok-4", weight: 4 },
  { model: "deepseek-chat", weight: 4 },
  { model: "llama-3.3-70b", weight: 3 },
];
