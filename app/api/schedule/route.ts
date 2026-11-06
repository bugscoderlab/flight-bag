import { NextResponse } from "next/server";
import { scheduleAll } from "@/lib/scheduler";

// POST /api/schedule — recompute the whole queue on demand.
// No AI, no plan change: just re-spread pending legs across weekly capacity,
// rewriting task start/end dates and every flight's ETA.
export async function POST() {
  const { etas } = await scheduleAll();
  return NextResponse.json({
    ok: true,
    etas: Object.fromEntries([...etas].map(([id, date]) => [id, date.toISOString()])),
  });
}
