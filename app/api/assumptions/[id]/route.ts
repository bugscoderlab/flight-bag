import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/assumptions/[id]
//   { status: "accepted" | "pending_review" }           — review disposition
//   { answer: "...", status?: "accepted" }              — replace the default
//                                                         answer with yours
//   { override: "..." }                                  — correct the answer;
//                                                         marked overridden,
//                                                         no LLM involved
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status && ["accepted", "pending_review"].includes(body.status))
    data.status = body.status;
  if (typeof body.answer === "string" && body.answer.trim()) {
    data.answer = body.answer.trim();
    data.override = null; // the default IS your answer now
    if (!body.status) data.status = "accepted";
  }
  if (typeof body.override === "string" && body.override.trim()) {
    data.override = body.override.trim(); // AI's original answer is kept
    if (!body.status) data.status = "overridden";
  }
  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const assumption = await prisma.assumption.update({ where: { id }, data });
  return NextResponse.json(assumption);
}
