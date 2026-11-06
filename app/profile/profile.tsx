"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Profile } from "./scaletrue";

type DayCol = { key: string; label: string; cap: number; total: number; isToday: boolean };
type Flight = {
  id: string;
  title: string;
  status: string;
  paused: boolean;
  eta: string | null;
  due: string | null;
  late: boolean;
  cells: Record<string, number>;
  bars: {
    id: string;
    title: string;
    todoTitle: string;
    hours: number;
    offsetHours: number;
    status: string;
    late: boolean;
    dueOffsetHours: number | null;
  }[];
};

export function Grid({
  days,
  flights,
  totalHours,
  dayBounds,
}: {
  days: DayCol[];
  flights: Flight[];
  totalHours: number;
  dayBounds: { label: string; offsetHours: number }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const router = useRouter();
  const cols = `170px repeat(${days.length}, minmax(42px, 1fr))`;

  // Re-spread the queue without the agent (no AI, no plan change) and reload
  // the grid, so the bars always match the stored schedule.
  async function recompute() {
    setRecomputing(true);
    const res = await fetch("/api/schedule", { method: "POST" });
    setRecomputing(false);
    if (res.ok) toast.success("Schedule recomputed — ETAs and profile updated");
    else toast.error("Recompute failed");
    router.refresh();
  }

  if (!flights.length)
    return <div className="card deep muted">Nothing scheduled — plan a flight from the manifest.</div>;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="caps muted">Stored schedule — recompute to re-spread pending legs</span>
        <button className="ghost" onClick={recompute} disabled={recomputing}>
          {recomputing ? "Recomputing…" : "↻ Recompute schedule"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 170 + days.length * 42 }}>
        {/* Capacity strip */}
        <div className="grid-row" style={{ gridTemplateColumns: cols, background: "var(--paper-deep)" }}>
          <div className="grid-name caps">capacity</div>
          {days.map((d) => (
            <div
              key={d.key}
              className={`grid-cell caps ${d.isToday ? "today" : ""} ${d.cap > 0 && d.total > d.cap ? "overload" : ""}`}
              title={`${d.label}: ${d.total}h scheduled / ${d.cap}h capacity`}
            >
              <span className="grid-total">{d.total > 0 ? d.total : ""}</span>
              <span className="grid-cap">{d.cap}h</span>
            </div>
          ))}
        </div>

        {/* Day headers */}
        <div className="grid-row" style={{ gridTemplateColumns: cols, borderBottom: "1px solid var(--hairline)" }}>
          <div className="grid-name caps">flight</div>
          {days.map((d) => (
            <div key={d.key} className={`grid-cell caps daylbl ${d.isToday ? "today" : ""}`}>
              {d.label}
            </div>
          ))}
        </div>

        {/* Flight rows */}
        {flights.map((f) => (
          <div key={f.id}>
            <div
              className={`grid-row flight-row ${f.paused ? "paused" : ""}`}
              style={{ gridTemplateColumns: cols }}
              onClick={() => setOpen(open === f.id ? null : f.id)}
              title="Click for scale-true route"
            >
              <div className="grid-name">
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.title}
                </div>
                <div className="muted" style={{ fontSize: 10 }}>
                  {f.late ? <span className="due-late">LATE </span> : null}
                  {f.eta ? `ETA ${f.eta.slice(5)}` : ""}
                  {f.due ? ` · DUE ${f.due.slice(5)}` : ""}
                </div>
              </div>
              {days.map((d) => {
                const h = f.cells[d.key];
                const isDue = f.due === d.key;
                const frac = d.cap > 0 && h ? Math.min(h / d.cap, 1) : 0;
                return (
                  <div
                    key={d.key}
                    className={`grid-cell ${d.isToday ? "today" : ""} ${isDue ? "duecell" : ""} ${h ? "filled" : ""}`}
                    style={h ? { background: `rgba(29, 95, 168, ${0.12 + frac * 0.65})` } : undefined}
                    title={h ? `${d.label}: ${h.toFixed(1)}h` : undefined}
                  >
                    {h ? h.toFixed(1) : ""}
                  </div>
                );
              })}
            </div>
            {open === f.id && f.bars.length > 0 && (
              <div style={{ padding: "12px 8px 16px 170px" }}>
                <Profile bars={f.bars} totalHours={totalHours} dayBounds={dayBounds} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
