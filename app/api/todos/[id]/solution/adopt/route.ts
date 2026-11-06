import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snapshotPlan } from "@/lib/planhistory";
import type { Solution, SolutionCandidate } from "@/lib/solution";

type Params = { params: Promise<{ id: string }> };

// POST /api/todos/[id]/solution/adopt — decide the solution candidate.
// body: { decision: "adopt", sections? } | { decision: "discard" }
//   adopt   — candidate becomes the flight's current solution (display only;
//             legs/scheduling/dispatch unaffected). Edited sections win.
//   discard — drop the candidate, current solution stays.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const todo = await prisma.todo.findUnique({ where: { id } });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.decision === "discard") {
    await prisma.todo.update({ where: { id }, data: { solutionCandidate: null } });
    return NextResponse.json({ ok: true, decision: "discard" });
  }

  if (body.decision === "adopt") {
    if (!todo.solutionCandidate)
      return NextResponse.json({ error: "no candidate to adopt" }, { status: 400 });
    const candidate = JSON.parse(todo.solutionCandidate) as SolutionCandidate;
    const sections = body.sections ?? candidate.sections; // inline edits win
    const solution: Solution = { sections, createdAt: new Date().toISOString() };
    await prisma.todo.update({
      where: { id },
      data: { solution: JSON.stringify(solution), solutionCandidate: null, solutionComment: null },
    });
    // The adopted state joins plan history instantly — newest on top.
    await snapshotPlan(id);
    return NextResponse.json({ ok: true, decision: "adopt" });
  }

  return NextResponse.json({ error: "decision must be adopt | discard" }, { status: 400 });
}
