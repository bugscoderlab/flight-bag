"use client";

type Bar = {
  id: string;
  title: string;
  todoTitle: string;
  hours: number;
  offsetHours: number;
  status: string;
  late: boolean;
  dueOffsetHours: number | null;
};

/** Scale-true single-flight route (detail expansion under a grid row). */
export function Profile({
  bars,
  totalHours,
  dayBounds,
}: {
  bars: Bar[];
  totalHours: number;
  dayBounds: { label: string; offsetHours: number }[];
}) {
  const W = 100;
  const rowH = 24;
  const rows = [...new Set(bars.map((b) => b.todoTitle))];
  const pct = (h: number) => (totalHours > 0 ? (h / totalHours) * W : 0);
  const left = (h: number) => `${pct(h) * 0.92}%`;
  const width = (h: number) => `${Math.max(pct(h) * 0.92, 0.8)}%`;

  const dues = new Map<string, number>();
  for (const b of bars) {
    if (b.dueOffsetHours != null && !dues.has(b.todoTitle)) dues.set(b.todoTitle, b.dueOffsetHours);
  }

  return (
    <div className="profile-wrap" style={{ height: rows.length * rowH + 34 }}>
      {dayBounds.map((d) => (
        <div key={d.label} className="day-tick" style={{ left: left(d.offsetHours), height: rows.length * rowH + 10 }}>
          <span className="lbl">{d.label}</span>
        </div>
      ))}
      {[...dues].map(([todoTitle, offset]) => (
        <div key={`due-${todoTitle}`} className="due-marker" style={{ left: left(offset), height: rows.length * rowH + 10 }}>
          <span className="tip">DUE</span>
        </div>
      ))}
      {rows.map((todoTitle, row) => (
        <div key={todoTitle}>
          {bars
            .filter((b) => b.todoTitle === todoTitle)
            .map((b) => (
              <div
                key={b.id}
                className={`leg-bar ${b.status === "done" ? "done" : ""} ${b.late ? "late" : ""}`}
                style={{ left: left(b.offsetHours), width: width(b.hours), top: 10 + row * rowH }}
              >
                <span className="tip">
                  {b.title} · {b.hours}h{b.late ? " · LATE" : ""}
                </span>
              </div>
            ))}
        </div>
      ))}
      <div className="profile-axis" />
    </div>
  );
}
