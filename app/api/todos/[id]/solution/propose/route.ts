import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { proposeSolution } from "@/lib/planner";
import { formatDumps } from "@/lib/dumpformat";
import type { SolutionCandidate } from "@/lib/solution";

type Params = { params: Promise<{ id: string }> };

// POST /api/todos/[id]/solution/propose — generate a solution candidate
// from the dump + live plan + assumption answers. body:
//   { answers?: [{ question, answer }] }  — edited answers steer it;
//   omitted/empty → use the live NOTAM answers (AI's own, or overrides).
// The live release and current solution are untouched until adopt.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    answers?: { question: string; answer: string }[];
    sections?: { heading: string; body: string }[];
    comment?: string;
  };
  const todo = await prisma.todo.findUnique({
    where: { id },
    include: {
      dumps: { include: { attachments: true }, orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { sortOrder: "asc" } },
      assumptions: true,
    },
  });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!todo.dumps.some((d) => !d.ignored) || !todo.tasks.length)
    return NextResponse.json({ error: "plan first — a solution needs a live release" }, { status: 400 });

  const dump = formatDumps(todo.dumps);
  const liveAnswers = todo.assumptions.map((a) => ({
    question: a.question,
    answer: a.override ?? a.answer,
  }));
  const edited = (body.answers ?? []).filter((a) => a.answer.trim());
  const merged = liveAnswers.map((la) => {
    const e = edited.find((x) => x.question === la.question);
    return e ? { question: la.question, answer: e.answer } : la;
  });
  // Brand-new questions typed by the user (not in live NOTAMs) count too.
  for (const e of edited) {
    if (!merged.some((m) => m.question === e.question)) merged.push(e);
  }

  const comment = (body.comment ?? todo.solutionComment ?? "").trim();

  let result;
  try {
    result = await proposeSolution(
      todo.title,
      dump,
      todo.tasks.map((t) => t.title),
      merged,
      comment || undefined,
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Propose failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const candidate: SolutionCandidate = {
    sections: result.sections,
    answers: merged,
    comment: comment || undefined,
    createdAt: new Date().toISOString(),
  };
  await prisma.todo.update({
    where: { id },
    data: { solutionCandidate: JSON.stringify(candidate), solutionComment: comment || null },
  });
  return NextResponse.json({ candidate });
}
