import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { estimateTasks, planProject } from "@/lib/planner";
import { applyPlan, buildProposal, gatherPriorArt } from "@/lib/proposal";
import { snapshotPlan } from "@/lib/planhistory";
import { generateAndStoreSolution } from "@/lib/solution";
import { formatDumps } from "@/lib/dumpformat";

type Params = { params: Promise<{ id: string }> };

// POST /api/todos/[id]/plan — run the self-interviewing planner over the
// todo's latest dump and APPLY it immediately: assumptions filed as
// pending-review NOTAMs, dispatch release live, schedule re-run. The
// previous live plan (if any) is kept in plan history for reference.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const todo = await prisma.todo.findUnique({
    where: { id },
    include: { dumps: { include: { attachments: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dump = formatDumps(todo.dumps);
  if (!dump.trim()) return NextResponse.json({ error: "dump some thoughts first" }, { status: 400 });

  // LLM work first — any failure leaves the DB untouched and the real
  // reason goes back to the client (not a generic 500).
  let plan, estimates, priorArt;
  try {
    plan = await planProject(todo.title, todo.dumps);
    estimates = await estimateTasks(
      todo.title,
      plan.tasks.map((t) => ({ title: t.title, why: t.why })),
    );
    priorArt = await gatherPriorArt(
      todo.title,
      plan.tasks.map((t) => t.title),
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Planning failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const proposal = buildProposal(plan, estimates, priorArt);
  await snapshotPlan(id); // keep the previous plan as a version
  await applyPlan(id, proposal);
  await generateAndStoreSolution(id); // solution: adopted if first, else candidate
  const fresh = await prisma.todo.findUnique({
    where: { id },
    include: { tasks: { orderBy: { sortOrder: "asc" } }, assumptions: true },
  });
  return NextResponse.json(fresh);
}
