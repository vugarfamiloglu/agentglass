import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";
import { bytes, compact } from "../lib/format";
import { ConfirmModal } from "../components/ConfirmModal";
import { PasswordInput } from "../components/PasswordInput";

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
    title: "Disconnect this provider?",
    body: "Its key is deleted from the vault. The assistant keeps answering from your trace data, but open-ended questions stop working until you connect a model again.",
    confirmLabel: "Disconnect",
  },
};

export function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const catalog = useQuery({ queryKey: ["models"], queryFn: api.models, staleTime: Infinity });
  const providers = useQuery({
    queryKey: ["assistant-providers"],
    queryFn: api.assistantProviders,
    staleTime: Infinity,
  });

  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [retention, setRetention] = useState(0);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  /** Models the provider itself reported, once asked. */
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Adopt the stored values once, then leave the fields alone — a background
  // refetch shouldn't overwrite something half-typed.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !settings.data) return;
    adopted.current = true;
    setProvider(settings.data.provider);
    setModel(settings.data.model);
    setBaseUrl(settings.data.baseUrl);
    setRetention(settings.data.retentionDays);
  }, [settings.data]);

  const current = providers.data?.find((p) => p.id === provider);
  const ready = settings.data?.configuredProviders ?? [];
  const configured = settings.data?.assistantConfigured ?? false;
  const isCurrent = settings.data?.provider === provider;
  const needsBaseUrl = current ? !current.baseUrl : false;

  // Once a provider has told us its models, trust that over the price catalog.
  const fromCatalog = (catalog.data ?? [])
    .filter((m) => !m.family && m.provider === provider)
    .map((m) => ({ value: m.key, label: `${m.label} — $${m.input}/$${m.output} per 1M` }));
  const choices = discovered ? discovered.map((id) => ({ value: id, label: id })) : fromCatalog;

  const changeProvider = (id: string) => {
    // A model name from one provider means nothing to the next.
    setProvider(id);
    setModel("");
    setBaseUrl("");
    setDiscovered(null);
    setMsg("");
  };

  const loadModels = async () => {
    setLoading(true);
    setMsg("");
    try {
      const { models } = await api.assistantModels({
        provider,
        key: key.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      setDiscovered(models);
      setMsg(
        models.length
          ? `${current?.label} serves ${models.length} model${models.length === 1 ? "" : "s"} — they're in the list now.`
          : "The provider replied, but listed no models.",
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not reach the provider.");
    } finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    try {
      const res = await api.setAssistant({
        provider,
        key: key.trim(),
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      });
      setKey("");
      setMsg(`Connected — open-ended questions now go to ${res.model} on ${current?.label}.`);
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save.");
    }
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
      setMsg("Disconnected. The assistant answers from your data only.");
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
          <div className="panel-title">Assistant model</div>
          <span className={`live-pill${configured ? " is-live" : ""}`}>
            <span className="live-dot" />
            <span className="mono">{configured ? "connected" : "local only"}</span>
          </span>
        </div>
        <p className="set-note">
          The assistant answers spend, error, latency, model, and tool questions locally with
          nothing connected at all. Point it at a model to unlock open-ended analysis — any of the
          providers below, or <strong>Ollama on your own machine</strong>, where nothing leaves it
          and nothing costs anything. Keys are sealed with <strong>AES-256-GCM</strong> in{" "}
          <code className="md-code">data/.vault-key</code>, one per provider.
        </p>

        <div className="set-form">
          <label className="set-field">
            <span className="set-label mono">PROVIDER</span>
            <select
              className="diff-select mono"
              value={provider}
              onChange={(e) => changeProvider(e.target.value)}
            >
              {(providers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {ready.includes(p.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>

          {needsBaseUrl && (
            <label className="set-field set-field-wide">
              <span className="set-label mono">BASE URL</span>
              <input
                className="input mono"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:8000/v1"
              />
            </label>
          )}

          {current && !current.keyless && (
            <label className="set-field set-field-wide">
              <span className="set-label mono">API KEY</span>
              <PasswordInput
                value={key}
                onChange={setKey}
                placeholder={
                  ready.includes(provider) ? "•••• stored — enter a new key to replace" : "sk-…"
                }
              />
            </label>
          )}

          <label className="set-field set-field-wide">
            <span className="set-label mono">
              MODEL{choices.length ? ` — ${choices.length} ${discovered ? "FROM PROVIDER" : "KNOWN"}` : ""}
            </span>
            <div className="set-row">
              <input
                className="input mono"
                list="model-choices"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={current?.defaultModel || "pick or load a model"}
              />
              <button className="btn-ghost" onClick={() => void loadModels()} disabled={loading}>
                {loading ? "Loading…" : "Load models"}
              </button>
            </div>
            <datalist id="model-choices">
              {choices.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </label>

          {current && <div className="set-hint mono">{current.hint}</div>}
        </div>

        <div className="set-actions">
          <button className="btn-primary" onClick={() => void connect()}>
            Connect
          </button>
          {configured && isCurrent && (
            <button className="btn-ghost" onClick={() => setPending("removeKey")}>
              Disconnect
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
