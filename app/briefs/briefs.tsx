"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const MODES = [
  { mode: "morning-brief", label: "Morning brief" },
  { mode: "expand-next", label: "Expand next leg" },
  { mode: "nightly-replan", label: "Nightly re-plan" },
  { mode: "weekly-retro", label: "Weekly retro" },
  { mode: "manual-full", label: "Full pass" },
];

export function Briefs({ runs }: { runs: { id: string; mode: string; summary: string; createdAt: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(mode: string) {
    setBusy(mode);
    const res = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Agent run failed");
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row">
        {MODES.map((m) => (
          <button key={m.mode} className="ghost" onClick={() => run(m.mode)} disabled={busy !== null}>
            {busy === m.mode ? "Running…" : m.label}
          </button>
        ))}
      </div>
      {runs.length === 0 && <div className="card deep muted">No briefs filed yet. Trigger one above.</div>}
      {runs.map((r) => (
        <div key={r.id} className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="caps">{r.mode.replace(/-/g, " ")}</span>
            <span className="caps mono" style={{ marginLeft: "auto" }}>{r.createdAt.slice(0, 16).replace("T", " ")}</span>
          </div>
          <div className="brief-body">{r.summary}</div>
        </div>
      ))}
    </div>
  );
}
