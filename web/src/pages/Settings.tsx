import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";
import { bytes, compact } from "../lib/format";
import { ConfirmModal } from "../components/ConfirmModal";
import { PasswordInput } from "../components/PasswordInput";

/** Matches the server's default when the model field is left blank. */
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4.1",
};

const RETENTION = [
  { days: 0, label: "Keep everything" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

type Pending = "clear" | "removeKey";

const CONFIRM: Record<Pending, { title: string; body: string; confirmLabel: string }> = {
  clear: {
    title: "Clear all traces?",
    body: "Every recorded run, span, and cost figure goes, and the dashboard resets to zero. There's no undo.",
    confirmLabel: "Clear everything",
  },
  removeKey: {
    title: "Remove the assistant key?",
    body: "The key is deleted from the vault. The assistant keeps answering from your trace data, but open-ended questions stop working until you add one again.",
    confirmLabel: "Remove key",
  },
};

export function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const models = useQuery({ queryKey: ["models"], queryFn: api.models, staleTime: Infinity });

  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [retention, setRetention] = useState(0);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  // Adopt the stored values once, then leave the fields alone — a background
  // refetch shouldn't overwrite something half-typed.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !settings.data) return;
    adopted.current = true;
    setProvider(settings.data.provider);
    setModel(settings.data.model);
    setRetention(settings.data.retentionDays);
  }, [settings.data]);

  const configured = settings.data?.assistantConfigured ?? false;
  const choices = (models.data ?? []).filter((m) => !m.family && m.provider === provider);

  const saveKey = async () => {
    if (!key.trim()) {
      setMsg("Enter an API key first.");
      return;
    }
    await api.setAssistant(key.trim(), provider, model.trim());
    setKey("");
    setMsg("Saved — the assistant will use your LLM for open-ended questions.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveRetention = async (days: number) => {
    setRetention(days);
    const res = await api.setRetention(days);
    setMsg(
      res.removed
        ? `Retention set — ${res.removed} run${res.removed === 1 ? "" : "s"} past the window pruned.`
        : days
          ? "Retention set. Nothing was old enough to prune."
          : "Retention off — runs are kept until you clear them.",
    );
    qc.invalidateQueries();
  };

  const confirm = async () => {
    if (pending === "clear") {
      const { removed } = await api.clearTraces();
      setMsg(`Cleared ${removed} run${removed === 1 ? "" : "s"}.`);
    } else if (pending === "removeKey") {
      await api.clearAssistant();
      setMsg("Key removed. The assistant answers from your data only.");
    }
    setPending(null);
    qc.invalidateQueries();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="panel set-panel">
        <div className="panel-head">
          <div className="panel-title">Assistant LLM</div>
          <span className={`live-pill${configured ? " is-live" : ""}`}>
            <span className="live-dot" />
            <span className="mono">{configured ? "key configured" : "local only"}</span>
          </span>
        </div>
        <p className="set-note">
          The assistant answers spend, error, latency, model, and tool questions locally with no key
          at all. Add an Anthropic or OpenAI key to unlock open-ended analysis. It's sealed with
          AES-256-GCM in <code className="md-code">data/.vault-key</code> and never leaves this
          machine.
        </p>

        <div className="set-form">
          <label className="set-field">
            <span className="set-label mono">PROVIDER</span>
            <select
              className="diff-select mono"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="set-field set-field-wide">
            <span className="set-label mono">API KEY</span>
            <PasswordInput
              value={key}
              onChange={setKey}
              placeholder={configured ? "•••• stored — enter a new key to replace" : "sk-…"}
            />
          </label>
          <label className="set-field set-field-wide">
            <span className="set-label mono">MODEL — {choices.length} AVAILABLE</span>
            <input
              className="input mono"
              list="model-choices"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL[provider] ?? ""}
            />
            <datalist id="model-choices">
              {choices.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} — ${m.input}/${m.output} per 1M
                </option>
              ))}
            </datalist>
          </label>
        </div>

        <div className="set-actions">
          <button className="btn-primary" onClick={saveKey}>
            Save key
          </button>
          {configured && (
            <button className="btn-ghost" onClick={() => setPending("removeKey")}>
              Remove key
            </button>
          )}
        </div>
      </section>

      <section className="panel set-panel">
        <div className="panel-head">
          <div className="panel-title">Data</div>
          <span className="mono set-stat">
            {compact(settings.data?.traces ?? 0)} runs · {bytes(settings.data?.dbSizeBytes ?? 0)}
          </span>
        </div>
        <p className="set-note">
          Traces live in a single SQLite file under <code className="md-code">data/</code>. They're
          kept until you say otherwise; pick a window and anything older is pruned on boot and every
          few hours after.
        </p>

        <div className="set-form">
          <label className="set-field">
            <span className="set-label mono">RETENTION</span>
            <select
              className="diff-select mono"
              value={retention}
              onChange={(e) => void saveRetention(Number(e.target.value))}
            >
              {RETENTION.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="set-actions">
          <button className="btn-ghost is-danger" onClick={() => setPending("clear")}>
            Clear all traces
          </button>
        </div>
      </section>

      {msg && <div className="set-msg mono">{msg}</div>}

      {pending && (
        <ConfirmModal
          tone="danger"
          title={CONFIRM[pending].title}
          confirmLabel={CONFIRM[pending].confirmLabel}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          {CONFIRM[pending].body}
        </ConfirmModal>
      )}
    </div>
  );
}
