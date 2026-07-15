import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";
import { PasswordInput } from "../components/PasswordInput";

export function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState("");

  const configured = settings.data?.assistantConfigured ?? false;

  const save = async () => {
    if (!key.trim()) {
      setMsg("Enter an API key first.");
      return;
    }
    await api.setAssistant(key.trim(), provider, model.trim());
    setKey("");
    setMsg("Saved — the assistant will now use your LLM for open-ended questions.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const clear = async () => {
    await api.clearAssistant();
    setMsg("Key removed. The assistant answers locally from your data only.");
    qc.invalidateQueries({ queryKey: ["settings"] });
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
            <select className="diff-select mono" value={provider} onChange={(e) => setProvider(e.target.value)}>
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
            <span className="set-label mono">MODEL (optional)</span>
            <input
              className="input mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001"}
            />
          </label>
        </div>

        <div className="set-actions">
          <button className="btn-primary" onClick={save}>
            Save key
          </button>
          {configured && (
            <button className="btn-ghost" onClick={clear}>
              Remove key
            </button>
          )}
        </div>
        {msg && <div className="set-msg mono">{msg}</div>}
      </section>
    </div>
  );
}
