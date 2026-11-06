import { prisma } from "@/lib/db";
import { Grid } from "./profile";

export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 21;

export default async function Page() {
  const [todos, capacities] = await Promise.all([
    prisma.todo.findMany({
      where: { tasks: { some: { status: { not: "done" } } } },
      orderBy: { sortOrder: "asc" },
      include: { tasks: { where: { status: { not: "done" } }, orderBy: { sortOrder: "asc" } } },
    }),
    prisma.weeklyCapacity.findMany(),
  ]);
  const capFor = (d: Date) => capacities.find((c) => c.weekday === d.getDay())?.hours ?? 0;

  // Window: today → +21 days
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = new Date(windowStart.getTime() + i * DAY);
    return { date: d, key: d.toISOString().slice(0, 10), cap: capFor(d) };
  });
  const todayKey = new Date().toISOString().slice(0, 10);

  // Scale-true hour offsets (for the per-flight detail expansion)
  const totalHours = days.reduce((s, d) => s + d.cap, 0);
  let acc = 0;
  const dayOffsets = days.map((d) => {
    const o = acc;
    acc += d.cap;
    return o;
  });
  const hoursBefore = (when: Date) => {
    let h = 0;
    let cursor = new Date(windowStart);
    while (cursor < when && h < totalHours) {
      h += capFor(cursor);
      cursor = new Date(cursor.getTime() + DAY);
    }
    return Math.min(h, totalHours);
  };

  // Per-flight day cells (hours scheduled per day) + detail bars
  const flights = todos.map((todo) => {
    const cells: Record<string, number> = {};
    const bars = todo.tasks
      .filter((t) => t.startDate && t.endDate && t.aiAdjustedHours != null)
      .map((t) => {
        for (const d of days) {
          const dayStart = d.date.getTime();
          const dayEnd = dayStart + DAY;
          const s = Math.max(t.startDate!.getTime(), dayStart);
          const e = Math.min(t.endDate!.getTime(), dayEnd);
          if (e > s) cells[d.key] = (cells[d.key] ?? 0) + d.cap * ((e - s) / DAY);
        }
        return {
          id: t.id,
          title: t.title,
          todoTitle: todo.title,
          hours: t.aiAdjustedHours!,
          offsetHours: hoursBefore(t.startDate!),
          status: t.status,
          late: Boolean(todo.dueDate && t.endDate! > todo.dueDate),
          dueOffsetHours: todo.dueDate ? hoursBefore(todo.dueDate) : null,
        };
      });
    const eta = todo.etaDate ?? null;
    const due = todo.dueDate ?? null;
    return {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      paused: todo.paused,
      eta: eta ? eta.toISOString().slice(0, 10) : null,
      due: due ? due.toISOString().slice(0, 10) : null,
      late: Boolean(eta && due && eta > due),
      cells,
      bars,
    };
  });

  const dayTotals: Record<string, number> = {};
  for (const f of flights) for (const [k, h] of Object.entries(f.cells)) dayTotals[k] = (dayTotals[k] ?? 0) + h;

  return (
    <div className="stack">
      <div>
        <div className="caps mb">Route profile — day grid</div>
        <h1 style={{ margin: 0 }}>The next {WINDOW_DAYS} days of flying</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Hours scheduled per day, per flight. Red days are over capacity. Click a flight to open
          its scale-true route.
        </p>
      </div>
      <Grid
        days={days.map((d) => ({
          key: d.key,
          label: d.key.slice(5),
          cap: d.cap,
          total: Math.round((dayTotals[d.key] ?? 0) * 10) / 10,
          isToday: d.key === todayKey,
        }))}
        flights={flights}
        totalHours={totalHours}
        dayBounds={days.map((d, i) => ({ label: d.key.slice(5), offsetHours: dayOffsets[i] }))}
      />
    </div>
  );
}
