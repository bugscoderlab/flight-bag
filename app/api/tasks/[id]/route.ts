import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleAll } from "@/lib/scheduler";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/tasks/[id] — toggle status, set execStrategy
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.execStrategy) data.execStrategy = body.execStrategy;
  const task = await prisma.task.update({ where: { id }, data });
  // Completing/reopening a leg frees or consumes capacity — re-spread the
  // queue so ETAs and the route profile reflect it immediately.
  if (body.status) await scheduleAll();
  return NextResponse.json(task);
}
