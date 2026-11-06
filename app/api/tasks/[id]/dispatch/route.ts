import { NextRequest, NextResponse } from "next/server";
import { dispatchTask } from "@/lib/executor";

type Params = { params: Promise<{ id: string }> };

// POST /api/tasks/[id]/dispatch — send this task to a coding agent
// (opencode headless, or a Herdr pane hosting an opencode agent).
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const outcome = await dispatchTask(id);
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
