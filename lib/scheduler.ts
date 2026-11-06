// Deterministic scheduler — no AI here.
// The user's attention is the serial resource: one task at a time, in
// drag-to-order (sortOrder) priority, dependencies first, allocated onto
// per-weekday capacity. A task's duration is its aiAdjustedHours.

import { prisma } from "./db";

export interface ScheduledSpan {
  taskId: string;
  startDate: Date;
  endDate: Date;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextDay(d: Date): Date {
  return new Date(d.getTime() + DAY);
}

/** Walk forward day by day from `from`, consuming `hours` of capacity.
 *  Returns {end: date the work finishes, cursor: next free instant, hoursBeforeStart} */
function allocate(
  hours: number,
  from: Date,
  capacityFor: (date: Date) => number,
  dayCursor: Map<number, number>, // dayStart ts -> hours already consumed that day
): { start: Date; end: Date; nextCursor: Date } {
  let cursor = startOfDay(from).getTime() === from.getTime() ? from : nextDay(startOfDay(from));
  let remaining = hours;
  let firstStart: Date | null = null;

  // If starting mid-day (today), respect already-consumed capacity.
  for (;;) {
    const dayStart = startOfDay(cursor);
    const key = dayStart.getTime();
    const cap = capacityFor(cursor);
    if (cap > 0) {
      const used = dayCursor.get(key) ?? (cursor.getTime() > dayStart.getTime() ? cap : 0);
      const avail = cap - used;
      if (avail > 0) {
        const take = Math.min(avail, remaining);
        if (!firstStart) firstStart = cursor;
        dayCursor.set(key, used + take);
        remaining -= take;
        if (remaining <= 1e-9) {
          // Fraction of the day consumed → end timestamp within that day
          const frac = (used + take) / cap;
          const end = new Date(dayStart.getTime() + frac * DAY);
          return { start: firstStart, end, nextCursor: end };
        }
        cursor = nextDay(dayStart);
        continue;
      }
    }
    cursor = nextDay(dayStart);
  }
}

/** Schedule every pending task across every active todo.
 *  Returns the spans and each todo's ETA (latest task endDate). */
export async function scheduleAll(): Promise<{
  spans: ScheduledSpan[];
  etas: Map<string, Date>;
}> {
  const [todos, capacities] = await Promise.all([
    prisma.todo.findMany({
      where: { status: { in: ["planned", "doing"] }, paused: false },
      orderBy: { sortOrder: "asc" },
      include: { tasks: true },
    }),
    prisma.weeklyCapacity.findMany(),
  ]);
  const capFor = (d: Date) => capacities.find((c) => c.weekday === d.getDay())?.hours ?? 0;

  const spans: ScheduledSpan[] = [];
  const etas = new Map<string, Date>();
  let globalCursor = new Date();
  const dayCursor = new Map<number, number>();

  for (const todo of todos) {
    const pending = todo.tasks.filter((t) => t.status !== "done" && t.aiAdjustedHours != null);
    // Topological order: dependencies before dependents
    const visited = new Set<string>();
    const order: typeof pending = [];
    const visit = (t: (typeof pending)[number], guard: Set<string>) => {
      if (visited.has(t.id) || guard.has(t.id)) return;
      guard.add(t.id);
      if (t.dependsOnId) {
        const d = pending.find((p) => p.id === t.dependsOnId);
        if (d) visit(d, guard);
      }
      visited.add(t.id);
      order.push(t);
    };
    for (const t of pending) visit(t, new Set());

    let eta: Date | null = null;
    for (const task of order) {
      // Dependents can't start before their dependency finished
      const depSpan = task.dependsOnId ? spans.find((s) => s.taskId === task.dependsOnId) : null;
      const earliest = depSpan ? depSpan.endDate : globalCursor;
      const from = earliest > globalCursor ? earliest : globalCursor;
      const { start, end } = allocate(task.aiAdjustedHours!, from, capFor, dayCursor);
      spans.push({ taskId: task.id, startDate: start, endDate: end });
      globalCursor = end > globalCursor ? end : globalCursor;
      if (!eta || end > eta) eta = end;
    }
    if (eta) etas.set(todo.id, eta);
  }

  // Persist
  await prisma.$transaction([
    ...spans.map((s) =>
      prisma.task.update({ where: { id: s.taskId }, data: { startDate: s.startDate, endDate: s.endDate } }),
    ),
    ...[...etas].map(([todoId, eta]) => prisma.todo.update({ where: { id: todoId }, data: { etaDate: eta } })),
  ]);

  return { spans, etas };
}
