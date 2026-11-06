import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, mode: true, summary: true, createdAt: true },
  });
  return NextResponse.json(runs);
}
