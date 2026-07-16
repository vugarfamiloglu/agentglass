import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { askStream } from "../lib/api";
import { useAssistant } from "../lib/assistant";
import { BrandMark } from "./BrandMark";

interface Msg {
  role: "user" | "assistant";
  text: string;
  source?: "local" | "llm";
}

const SUGGESTED = [
  "How much have I spent?",
  "What's my error rate?",
  "Which models cost the most?",
  "Summarize my tool usage",
];

// ---- tiny, safe markdown (no innerHTML) ----

function inline(text: string, keyBase: string): ReactNode[] {
  // Split on **bold** and `code`, keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.filter(Boolean).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={`${keyBase}-${i}`}>{p.slice(2, -2)}</b>;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code className="md-code" key={`${keyBase}-${i}`}>
          {p.slice(1, -1)}
        </code>
      );
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = (k: string) => {
    if (list.length) {
      out.push(
        <ul className="md-list" key={`ul-${k}`}>
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("- ")) {
      list.push(<li key={`li-${i}`}>{inline(t.slice(2), `li-${i}`)}</li>);
    } else {
      flush(String(i));
      if (t) out.push(<p key={`p-${i}`}>{inline(t, `p-${i}`)}</p>);
    }
  });
  flush("end");
  return <>{out}</>;
}

export function AssistantRail() {
  const { open } = useAssistant();
  const { pathname } = useLocation();
  const traceId = pathname.startsWith("/traces/") ? pathname.split("/")[2] : undefined;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    // The empty assistant bubble is the one the answer streams into.
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setInput("");
    setBusy(true);

    const patchLast = (fn: (msg: Msg) => Msg) =>
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? fn(msg) : msg)));

    try {
      await askStream(q, traceId, (chunk) => {
        if (chunk.type === "delta") patchLast((msg) => ({ ...msg, text: msg.text + chunk.text }));
        else if (chunk.type === "error")
          patchLast((msg) => ({ ...msg, text: `${msg.text}\n\n${chunk.message}` }));
        else patchLast((msg) => ({ ...msg, source: chunk.source }));
      });
    } catch {
      patchLast((msg) => ({ ...msg, text: "Something went wrong reaching the assistant." }));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="rail-mark">
          <BrandMark size={18} />
        </span>
        <span className="rail-title">Assistant</span>
        {traceId && <span className="rail-scope mono">this run</span>}
      </div>

      <div className="rail-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="rail-empty">
            <div className="rail-empty-title">Ask about your runs</div>
            <div className="rail-empty-note">
              I read your traces — spend, errors, latency, models, and tools. Add an LLM key in
              Settings for open-ended analysis.
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1;
          if (m.role === "user") {
            return (
              <div className="msg msg-user" key={i}>
                <div className="msg-body">{m.text}</div>
              </div>
            );
          }
          return (
            <div className="msg msg-assistant" key={i}>
              {m.text ? (
                <div className={`msg-body${streaming ? " is-streaming" : ""}`}>
                  <Markdown text={m.text} />
                </div>
              ) : (
                <div className="msg-body typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {m.source === "local" && <div className="msg-tag mono">computed from your data</div>}
            </div>
          );
        })}
      </div>

      <div className="rail-suggest">
        {SUGGESTED.map((s) => (
          <button key={s} className="chip-btn" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="rail-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          ↑
        </button>
      </form>
    </aside>
  );
}
