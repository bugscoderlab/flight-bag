// Solution — what the deliverable actually contains.
// NOT tasks (that's the dispatch release) — the artifact's content itself:
// per-slide title + content for a deck, section outline for a doc,
// per-screen/feature spec for an app.

import { prisma } from "./db";
import { proposeSolution } from "./planner";
import { formatDumps } from "./dumpformat";

export interface SolutionSection {
  heading: string;
  body: string;
}

export interface Solution {
  sections: SolutionSection[];
  createdAt: string;
}

export interface SolutionCandidate extends Solution {
  /** The assumption answers the solution was generated from (editable next round). */
  answers: { question: string; answer: string }[];
  /** Feedback the user typed to steer this proposal (optional). */
  comment?: string;
}

export function parseSolution(json: string | null): Solution | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Solution;
  } catch {
    return null;
  }
}

export function parseCandidate(json: string | null): SolutionCandidate | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SolutionCandidate;
  } catch {
    return null;
  }
}

// ── Generation + storage ─────────────────────────────────────────────

/** Generate a solution from the todo's dump + live plan + assumption
 * answers, then: adopt it directly if the flight has no current solution,
 * otherwise hold it as a candidate for adopt/discard. */
export async function generateAndStoreSolution(todoId: string): Promise<void> {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: {
      dumps: { include: { attachments: true }, orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { sortOrder: "asc" } },
      assumptions: true,
    },
  });
  if (!todo || !todo.dumps.some((d) => !d.ignored) || !todo.tasks.length) return;

  const dump = formatDumps(todo.dumps);
  const answers = todo.assumptions.map((a) => ({
    question: a.question,
    answer: a.override ?? a.answer,
  }));
  const result = await proposeSolution(
    todo.title,
    dump,
    todo.tasks.map((t) => t.title),
    answers,
    todo.solutionComment ?? undefined,
  );

  if (todo.solution) {
    const candidate: SolutionCandidate = {
      sections: result.sections,
      answers,
      createdAt: new Date().toISOString(),
    };
    await prisma.todo.update({
      where: { id: todoId },
      data: { solutionCandidate: JSON.stringify(candidate) },
    });
  } else {
    await prisma.todo.update({
      where: { id: todoId },
      data: {
        solution: JSON.stringify({ sections: result.sections, createdAt: new Date().toISOString() }),
      },
    });
  }
}
