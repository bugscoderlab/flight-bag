"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Config = {
  configured: boolean;
  keyPreview: string | null;
  model: string;
  baseUrl: string;
  source: "settings" | "env" | "default";
  defaults: { model: string; baseUrl: string };
};

export function Settings() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLive, setModelsLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/llm")
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c);
        setModel(c.model);
        setBaseUrl(c.baseUrl);
      });
    fetch("/api/settings/llm/models")
      .then((r) => r.json())
      .then((d: { models: { id: string; name: string }[]; live: boolean }) => {
        setModels(d.models);
        setModelsLive(d.live);
      })
      .catch(() => setModelsLive(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body: Record<string, string> = {};
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    if (model.trim()) body.model = model.trim();
    if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
    const res = await fetch("/api/settings/llm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const updated = await res.json();
    setConfig(updated);
    setApiKey("");
    setBusy(false);
    setMessage(
      apiKey.trim()
        ? `Key saved (${updated.keyPreview}). Planner, estimator, and the background agent will use it on their next run.`
        : "Settings saved.",
    );
    router.refresh();
  }

  async function clearKey() {
    setBusy(true);
    const res = await fetch("/api/settings/llm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "" }),
    });
    setConfig(await res.json());
    setBusy(false);
    setMessage("Stored key cleared.");
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      {message && <div className="card deep">{message}</div>}

      <section className="card stack">
        <div className="caps">LLM provider — openrouter</div>
        <p className="muted" style={{ margin: 0 }}>
          The planner, estimator, and background agent call this provider. Get a
          key at <b>openrouter.ai/keys</b>. Stored locally in this app&apos;s
          database; the key field always shows blank — we never display it back.
        </p>

        <div className="row">
          <span className="caps">Status</span>
          <span style={{ marginLeft: "auto" }}>
            {config?.configured ? (
              <span className="stamp doing">
                configured{config.keyPreview ? ` · ${config.keyPreview}` : ""}
                {config.source === "env" ? " (from .env)" : ""}
              </span>
            ) : (
              <span className="stamp dumping">no key — planning disabled</span>
            )}
          </span>
        </div>

        <form onSubmit={save} className="stack">
          <div>
            <div className="caps mb">API key</div>
            <input
              type="password"
              autoComplete="off"
              placeholder={config?.configured ? "•••••••• (saved — enter to replace)" : "sk-or-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div>
            <div className="caps mb">Model</div>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {!models.some((m) => m.id === model) && (
                <option value={model}>{model} (current)</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {!modelsLive && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Curated list — could not reach OpenRouter. Any model id still works if
                typed into .env as LLM_MODEL.
              </div>
            )}
          </div>
          <div>
            <div className="caps mb">Base URL</div>
            <input
              type="text"
              placeholder={config?.defaults.baseUrl}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
            {config?.source === "settings" && (
              <button type="button" className="ghost" onClick={clearKey} disabled={busy}>
                Clear stored key
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card stack">
        <div className="caps">Weekly capacity — hours available per day</div>
        <CapacityEditor />
      </section>

      <section className="card stack">
        <div className="caps">SSH machines — remote dispatch targets</div>
        <p className="muted" style={{ margin: 0 }}>
          Flights can dispatch legs to any machine in this list over SSH. Key auth
          must already work from this machine (<span className="mono">ssh user@host</span>
          with no password); the agent CLI (<span className="mono">opencode</span>) must
          be installed on the remote host, and the flight&apos;s working directory is a
          path on that host.
        </p>
        <SshMachinesEditor />
      </section>
    </div>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SshMachine = { name: string; host: string };

function SshMachinesEditor() {
  const [machines, setMachines] = useState<SshMachine[]>([]);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ssh")
      .then((r) => r.json())
      .then((d: { machines?: SshMachine[] }) => setMachines(d.machines ?? []));
  }, []);

  async function saveList(list: SshMachine[]) {
    setMachines(list);
    await fetch("/api/settings/ssh", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machines: list }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    await saveList([...machines, { name: name.trim() || host.trim(), host: host.trim() }]);
    setName("");
    setHost("");
  }

  async function remove(index: number) {
    await saveList(machines.filter((_, j) => j !== index));
  }

  return (
    <div className="stack">
      {machines.length === 0 && (
        <div className="card deep muted">No machines yet — add one below.</div>
      )}
      {machines.map((m, i) => (
        <div key={m.host} className="row" style={{ gap: 8 }}>
          <b style={{ minWidth: 120 }}>{m.name}</b>
          <span className="mono muted" style={{ flex: 1 }}>{m.host}</span>
          <button className="icon-btn" title="Remove this machine" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <form onSubmit={add} className="row" style={{ gap: 8 }}>
        <input
          type="text"
          placeholder="Label (e.g. gpu box)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          type="text"
          placeholder="user@host"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="ghost">Add machine</button>
        {saved && <span className="muted" style={{ fontSize: 11 }}>saved</span>}
      </form>
    </div>
  );
}

function CapacityEditor() {
  const [rows, setRows] = useState<{ weekday: number; hours: number }[]>([]);
  useEffect(() => {
    fetch("/api/settings/capacity").then((r) => r.json()).then(setRows);
  }, []);
  async function set(weekday: number, hours: number) {
    setRows((rs) => rs.map((r) => (r.weekday === weekday ? { ...r, hours } : r)));
    await fetch("/api/settings/capacity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday, hours }),
    });
  }
  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.weekday} className="row">
          <span style={{ width: 110 }}>{DAYS[r.weekday]}</span>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={r.hours}
            onChange={(e) => set(r.weekday, Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="caps mono" style={{ width: 60, textAlign: "right" }}>
            {r.hours}h
          </span>
        </div>
      ))}
    </div>
  );
}
