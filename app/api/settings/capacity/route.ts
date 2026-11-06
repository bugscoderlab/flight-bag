import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleAll } from "@/lib/scheduler";

export async function GET() {
  return NextResponse.json(await prisma.weeklyCapacity.findMany({ orderBy: { weekday: "asc" } }));
}

export async function PUT(req: NextRequest) {
  const { weekday, hours } = await req.json();
  if (typeof weekday !== "number" || weekday < 0 || weekday > 6)
    return NextResponse.json({ error: "weekday 0-6" }, { status: 400 });
  const row = await prisma.weeklyCapacity.upsert({
    where: { weekday },
    create: { weekday, hours: Number(hours) || 0 },
    update: { hours: Number(hours) || 0 },
  });
  // Capacity changed → recompute every ETA and the route profile.
  await scheduleAll();
  return NextResponse.json(row);
}
