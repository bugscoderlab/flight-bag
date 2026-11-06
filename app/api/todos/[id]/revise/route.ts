import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { estimateTasks, revisePlan } from "@/lib/planner";
import { applyPlan, buildProposal } from "@/lib/proposal";
import { snapshotPlan } from "@/lib/planhistory";
import { generateAndStoreSolution } from "@/lib/solution";
import type { PriorArt } from "@/lib/priorart";

type Params = { params: Promise<{ id: string }> };

// POST /api/todos/[id]/revise — body: { overrides: [{ assumptionId, override }] }
// Records the vetoes on the current plan, regenerates, and APPLIES the new
// plan immediately (previous plan kept in history). Order matters: the LLM
// work happens FIRST — nothing is persisted unless regeneration succeeds.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { overrides } = (await req.json()) as {
    overrides: { assumptionId: string; override: string }[];
  };
  if (!overrides?.length) return NextResponse.json({ error: "overrides required" }, { status: 400 });

  const todo = await prisma.todo.findUnique({
    where: { id },
    include: {
      dumps: { include: { attachments: true }, orderBy: { createdAt: "desc" } },
      tasks: true,
      assumptions: true,
    },
  });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pairs = overrides.map((o) => {
    const a = todo.assumptions.find((x) => x.id === o.assumptionId);
    return { question: a?.question ?? "", override: o.override };
  });

  // 1) Regenerate with the LLM. Any failure here leaves the DB untouched.
  let proposal;
  try {
    const revised = await revisePlan(
      todo.title,
      todo.dumps,
      todo.tasks.map((t) => ({ title: t.title, why: t.why ?? "" })),
      pairs,
    );
    const estimates = await estimateTasks(
      todo.title,
      revised.tasks.map((t) => ({ title: t.title, why: t.why })),
    );
    const priorArt: PriorArt[] = [];
    proposal = buildProposal(revised, estimates, priorArt);
  } catch (err) {
    return NextResponse.json(
      { error: `Regeneration failed: ${err instanceof Error ? err.message : String(err)}. Nothing was changed — your edit is kept, try again.` },
      { status: 502 },
    );
  }

  // 2) Persist: mark vetoes, version the old plan, apply the new one.
  for (const o of overrides) {
    await prisma.assumption.update({
      where: { id: o.assumptionId },
      data: { status: "overridden", override: o.override },
    });
  }
  await snapshotPlan(id);
  await applyPlan(id, proposal);
  await generateAndStoreSolution(id);

  const fresh = await prisma.todo.findUnique({
    where: { id },
    include: { tasks: { orderBy: { sortOrder: "asc" } }, assumptions: true },
  });
  return NextResponse.json(fresh);
}
