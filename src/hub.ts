/**
 * Live event fan-out. Every connected dashboard registers a sink here; the
 * proxy and simulator call `broadcast` as traces and spans arrive, and each
 * client receives the JSON-encoded event over its WebSocket.
 */
import type { LiveEvent } from "./types.js";

export interface Sink {
  send(data: string): void;
}

export class Hub {
  private clients = new Set<Sink>();

  add(sink: Sink): void {
    this.clients.add(sink);
  }

  remove(sink: Sink): void {
    this.clients.delete(sink);
  }

  get size(): number {
    return this.clients.size;
  }

  broadcast(event: LiveEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        client.send(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
