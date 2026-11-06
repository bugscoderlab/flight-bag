import { NextRequest, NextResponse } from "next/server";
import { runAgent, type AgentMode } from "@/lib/agent";

const MODES: AgentMode[] = ["morning-brief", "nightly-replan", "weekly-retro", "expand-next", "manual-full"];

export async function POST(req: NextRequest) {
  const { mode } = await req.json();
  if (!MODES.includes(mode)) return NextResponse.json({ error: `mode must be one of ${MODES.join(", ")}` }, { status: 400 });
  try {
    const result = await runAgent(mode);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
