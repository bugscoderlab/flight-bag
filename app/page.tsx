import { prisma } from "@/lib/db";
import { Manifest } from "./board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const todos = await prisma.todo.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          assumptions: { where: { status: "pending_review" } },
          dumps: true,
        },
      },
      tasks: { where: { status: { not: "done" } }, select: { id: true } },
    },
  });
  return (
    <div className="stack">
      <div>
        <div className="caps mb">Manifest — all expeditions</div>
        <h1 style={{ margin: 0 }}>What are we flying today?</h1>
      </div>
      <Manifest
        todos={todos.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          sortOrder: t.sortOrder,
          etaDate: t.etaDate?.toISOString() ?? null,
          dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
          openLegs: t.tasks.length,
          notams: t._count.assumptions,
          dumps: t._count.dumps,
          hasDumps: t._count.dumps > 0,
          paused: t.paused,
          hidden: t.hidden,
        }))}
      />
    </div>
  );
}
