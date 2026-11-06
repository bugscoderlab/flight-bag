// Plan history — superseded live plans are snapshotted here (versioning).
import { prisma } from "./db";
import { parseSolution } from "./solution";

export interface PlanVersion {
  createdAt: string;
  tasks: { title: string; why: string; aiAdjustedHours: number | null; effortHours: number | null }[];
  assumptions: { question: string; answer: string; override: string | null }[];
  solution: { sections: { heading: string; body: string }[] } | null;
}

const CAP = 10;

export function parseHistory(json: string | null): PlanVersion[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Snapshot the todo's CURRENT live plan (tasks + assumptions + solution)
 * onto the history stack. Call BEFORE replacing the live plan. */
export async function snapshotPlan(todoId: string): Promise<void> {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { tasks: { orderBy: { sortOrder: "asc" } }, assumptions: true },
  });
  if (!todo || todo.tasks.length === 0) return; // nothing live to keep
  const solution = parseSolution(todo.solution);
  const version: PlanVersion = {
    createdAt: new Date().toISOString(),
    tasks: todo.tasks.map((t) => ({
      title: t.title,
      why: t.why ?? "",
      aiAdjustedHours: t.aiAdjustedHours,
      effortHours: t.effortHours,
    })),
    assumptions: todo.assumptions.map((a) => ({
      question: a.question,
      answer: a.answer,
      override: a.override,
    })),
    solution: solution ? { sections: solution.sections } : null,
  };
  const history = [version, ...parseHistory(todo.planHistory)].slice(0, CAP);
  await prisma.todo.update({ where: { id: todoId }, data: { planHistory: JSON.stringify(history) } });
}
