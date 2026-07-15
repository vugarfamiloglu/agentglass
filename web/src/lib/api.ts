/** Typed client for the AgentGlass API. Every response uses the `{ ok, data }`
 *  / `{ ok, error }` envelope, which these helpers unwrap. */

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  const env = (await res.json()) as Envelope<T>;
  if (!env.ok || env.data === undefined) {
    throw new Error(env.error ?? `request failed (${res.status})`);
  }
  return env.data;
}

export async function getJson<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path));
}

export async function delJson<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path, { method: "DELETE" }));
}

export interface Health {
  service: string;
  version: string;
  traces: number;
  clients: number;
}

export const api = {
  health: () => getJson<Health>("/api/health"),
};
