/**
 * Model pricing — USD per 1M tokens. Used to turn token usage into a dollar
 * figure for every span (by the simulator now, by the recording proxy later).
 * Prices are approximate list prices; adjust in Settings once that lands.
 */

export interface Price {
  input: number;
  output: number;
  cache: number;
}

// Keyed by a substring matched against the model name (longest match wins).
const TABLE: Record<string, Price> = {
  "claude-opus": { input: 15, output: 75, cache: 1.5 },
  "claude-sonnet": { input: 3, output: 15, cache: 0.3 },
  "claude-haiku": { input: 0.8, output: 4, cache: 0.08 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cache: 0.075 },
  "gpt-4o": { input: 2.5, output: 10, cache: 1.25 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cache: 0.1 },
  "gpt-4.1": { input: 2, output: 8, cache: 0.5 },
  "o3": { input: 10, output: 40, cache: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cache: 0.31 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cache: 0.075 },
};

const DEFAULT: Price = { input: 3, output: 15, cache: 0.3 };

export function priceFor(model: string): Price {
  const m = model.toLowerCase();
  let best: Price | null = null;
  let bestLen = 0;
  for (const [key, price] of Object.entries(TABLE)) {
    if (m.includes(key) && key.length > bestLen) {
      best = price;
      bestLen = key.length;
    }
  }
  return best ?? DEFAULT;
}

export function costOf(model: string, tokensIn: number, tokensOut: number, tokensCache = 0): number {
  const p = priceFor(model);
  return (tokensIn * p.input + tokensOut * p.output + tokensCache * p.cache) / 1_000_000;
}

/** Models the simulator draws from, with rough usage weights. */
export const SIM_MODELS: { model: string; weight: number }[] = [
  { model: "claude-sonnet-4", weight: 40 },
  { model: "claude-opus-4", weight: 12 },
  { model: "claude-haiku-4", weight: 14 },
  { model: "gpt-4o", weight: 16 },
  { model: "gpt-4o-mini", weight: 10 },
  { model: "gpt-4.1", weight: 8 },
];
