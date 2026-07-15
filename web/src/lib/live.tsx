import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { LiveEvent, Trace } from "./types";

interface LiveState {
  connected: boolean;
  /** Most recent runs seen live (running + just-finished), newest first. */
  traces: Trace[];
}

const LiveContext = createContext<LiveState>({ connected: false, traces: [] });

export function useLive(): LiveState {
  return useContext(LiveContext);
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [traces, setTraces] = useState<Trace[]>([]);
  const lastInvalidate = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const invalidate = () => {
      const now = Date.now();
      if (now - lastInvalidate.current < 1500) return;
      lastInvalidate.current = now;
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["series"] });
      qc.invalidateQueries({ queryKey: ["traces"] });
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.onopen = () => setConnected(true);
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 1500);
      };
      ws.onmessage = (e) => {
        let evt: LiveEvent;
        try {
          evt = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (evt.type === "trace.start") {
          setTraces((cur) => [evt.trace, ...cur.filter((t) => t.id !== evt.trace.id)].slice(0, 40));
        } else if (evt.type === "trace.update" || evt.type === "trace.end") {
          setTraces((cur) => cur.map((t) => (t.id === evt.trace.id ? evt.trace : t)));
          if (evt.type === "trace.end") invalidate();
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [qc]);

  return <LiveContext.Provider value={{ connected, traces }}>{children}</LiveContext.Provider>;
}
