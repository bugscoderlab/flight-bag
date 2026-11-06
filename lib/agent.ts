// Background agent — the behind-the-scenes planner.
// Modes: morning-brief | nightly-replan | weekly-retro | expand-next | manual-full
// Auto-applies everything; every run is snapshotted to AgentRun for rollback.

import { prisma } from "./db";
import { planProject, estimateTasks } from "./planner";
import { scheduleAll } from "./scheduler";
import { chatText } from "./llm";

const mockMode = () => process.env.PLANNER_MOCK === "1";

export type AgentMode = "morning-brief" | "nightly-replan" | "weekly-retro" | "expand-next" | "manual-full";

const DAY = 24 * 60 * 60 * 1000;

async function snapshotState() {
  const todos = await prisma.todo.findMany({
    include: { tasks: true, assumptions: true, dumps: true },
    orderBy: { sortOrder: "asc" },
  });
  const runs = await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  return { todos, recentRuns: runs, generatedAt: new Date().toISOString() };
}

async function briefLines(): Promise<string[]> {
  const [todos, capacities] = await Promise.all([
    prisma.todo.findMany({ include: { tasks: true }, orderBy: { sortOrder: "asc" } }),
    prisma.weeklyCapacity.findMany(),
  ]);
  const today = new Date();
  const cap = capacities.find((c) => c.weekday === today.getDay())?.hours ?? 0;
  const todaysTasks = todos.flatMap((t) =>
    t.tasks.filter((k) => k.status !== "done" && k.startDate && k.startDate <= today && k.endDate && k.endDate >= today),
  );
  const hours = todaysTasks.reduce((s, t) => s + (t.aiAdjustedHours ?? 0), 0);
  const late = todos.filter((t) => t.etaDate && t.dueDate && t.etaDate > t.dueDate);
  const lines = [
    `Capacity today: ${cap}h. Scheduled: ${todaysTasks.length} legs, ${hours.toFixed(1)}h.`,
    ...todaysTasks.map((t) => `· ${t.title} (${t.aiAdjustedHours?.toFixed(1)}h)`),
    ...todos
      .filter((t) => t.etaDate)
      .map((t) => `· ${t.title}: ETA ${t.etaDate!.toISOString().slice(0, 10)}`),
    ...late.map(
      (t) =>
        `⚠ ${t.title}: past due (ETA ${t.etaDate!.toISOString().slice(0, 10)} · due ${t.dueDate!.toISOString().slice(0, 10)}) — drag it up or move the date`,
    ),
  ];
  return lines;
}

async function llmSummary(system: string, payload: unknown): Promise<string> {
  if (mockMode()) return "(mock) Agent reviewed the manifest. All expeditions on track.";
  try {
    return await chatText(system, JSON.stringify(payload, null, 2));
  } catch (err) {
    return (
      "(LLM unavailable: " + (err instanceof Error ? err.message : String(err)) + ")\n" +
      (await briefLines()).join("\n")
    );
  }
}

/** Expand the next pending task of the highest-priority active todo
 *  into finer sub-steps. Auto-applies: inserts new tasks after it. */
async function expandNext(): Promise<string> {
  const todos = await prisma.todo.findMany({
    where: { status: { in: ["planned", "doing"] }, paused: false },
    orderBy: { sortOrder: "asc" },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  const todo = todos[0];
  if (!todo) return "No active expeditions.";
  const next = todo.tasks.find((t) => t.status === "pending");
  if (!next) return `“${todo.title}” has no pending legs to expand.`;

  const dump = (await prisma.thoughtDump.findFirst({ where: { todoId: todo.id }, orderBy: { createdAt: "desc" } }))?.content ?? "";
  const sub = await planProject(`${todo.title} — sub-task: ${next.title}`, [
    { content: dump + `\n\nFocus ONLY on breaking this task into 2-6 concrete steps: ${next.title}. ${next.why ?? ""}` },
  ]);

  const startAt = next.sortOrder;
  await prisma.$transaction([
    ...sub.tasks.map((t, i) =>
      prisma.task.create({
        data: { todoId: todo.id, title: t.title, why: t.why, sortOrder: startAt + 1 + i },
      }),
    ),
    prisma.task.update({ where: { id: next.id }, data: { status: "done", execResult: "Expanded into sub-tasks by agent." } }),
  ]);
  await scheduleAll();
  return `Expanded “${next.title}” into ${sub.tasks.length} steps.`;
}

export async function runAgent(mode: AgentMode): Promise<{ summary: string; runId: string }> {
  const before = await snapshotState();
  let summary = "";

  switch (mode) {
    case "morning-brief":
      summary = await llmSummary(
        "You are the morning briefing officer. Given the user's project manifest, today's scheduled legs, and recent agent activity, write a tight 6-line morning brief: what departs today, total hours vs capacity, any ETA that moved, one risk. Plain text, no fluff.",
        { ...(await snapshotState()), todayLines: await briefLines() },
      );
      break;

    case "nightly-replan": {
      const { etas } = await scheduleAll();
      const etaLines = [...etas].map(([id, eta]) => {
        const t = before.todos.find((x) => x.id === id);
        return `· ${t?.title ?? id}: ETA ${eta.toISOString().slice(0, 10)}`;
      });
      summary = await llmSummary(
        "You are the night dispatch officer. The schedule was just re-computed. Summarize what changed in 4 lines max. Plain text.",
        { etaLines, todos: before.todos.map((t) => ({ title: t.title, status: t.status, eta: t.etaDate })) },
      );
      break;
    }

    case "weekly-retro": {
      const weekAgo = new Date(Date.now() - 7 * DAY);
      const done = before.todos.flatMap((t) => t.tasks.filter((k) => k.status === "done"));
      const slipped = before.todos.flatMap((t) => t.tasks.filter((k) => k.status !== "done" && k.endDate && k.endDate < new Date()));
      summary = await llmSummary(
        "You are the weekly review officer. Given this week's completed and slipped work plus the current queue order, write: wins (1 line), slips (1 line), and a recommended re-ordering of the top 3 projects with one reason each. Plain text.",
        { doneCount: done.length, done: done.map((t) => t.title), slipped: slipped.map((t) => t.title), queue: before.todos.map((t) => t.title) },
      );
      break;
    }

    case "expand-next":
      summary = await expandNext();
      break;

    case "manual-full":
      summary = [
        await expandNext(),
        (await scheduleAll(), "Schedule re-computed."),
        await llmSummary("You are the dispatch officer. Given the full manifest, write a 5-line status report. Plain text.", await snapshotState()),
      ].join("\n");
      break;
  }

  const after = await snapshotState();
  const run = await prisma.agentRun.create({
    data: {
      mode,
      summary,
      snapshot: JSON.stringify({ before, after }),
    },
  });
  return { summary, runId: run.id };
}
