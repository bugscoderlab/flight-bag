import { prisma } from "@/lib/db";
import { Briefs } from "./briefs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, mode: true, summary: true, createdAt: true },
  });
  return (
    <div className="stack">
      <div>
        <div className="caps mb">Briefs — background agent</div>
        <h1 style={{ margin: 0 }}>What the dispatcher did</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Timed runs: morning brief 07:30 · nightly re-plan 23:00 · weekly retro Sunday 18:00.
          Everything auto-applies; every run is snapshotted for rollback.
        </p>
      </div>
      <Briefs runs={runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </div>
  );
}
