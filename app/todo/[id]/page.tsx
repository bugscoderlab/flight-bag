import { prisma } from "@/lib/db";
import { parseCandidate, parseSolution } from "@/lib/solution";
import { parseHistory } from "@/lib/planhistory";
import { Detail } from "./detail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const todo = await prisma.todo.findUnique({
    where: { id },
    include: {
      dumps: {
        orderBy: { createdAt: "desc" },
        include: {
          attachments: { select: { id: true, filename: true, mimeType: true, size: true, ignored: true, text: true } },
          edits: { orderBy: { createdAt: "desc" }, select: { id: true, oldContent: true, newContent: true, createdAt: true } },
        },
      },
      tasks: { orderBy: { sortOrder: "asc" } },
      assumptions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!todo) return <div className="card">Not found.</div>;

  return (
    <Detail
      todo={{
        id: todo.id,
        title: todo.title,
        status: todo.status,
        etaDate: todo.etaDate?.toISOString() ?? null,
        dueDate: todo.dueDate?.toISOString().slice(0, 10) ?? null,
        workDir: todo.workDir,
        sshTarget: todo.sshTarget,
        solution: parseSolution(todo.solution),
        solutionCandidate: parseCandidate(todo.solutionCandidate),
        solutionComment: todo.solutionComment,
        latestDumpAt: todo.dumps.find((d) => !d.ignored)?.createdAt.toISOString() ?? null,
        planHistory: parseHistory(todo.planHistory),
        dumps: todo.dumps.map((d) => ({
          id: d.id,
          content: d.content,
          createdAt: d.createdAt.toISOString(),
          ignored: d.ignored,
          edits: d.edits.map((e) => ({
            id: e.id,
            oldContent: e.oldContent,
            newContent: e.newContent,
            createdAt: e.createdAt.toISOString(),
          })),
          attachments: d.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            ignored: a.ignored,
            hasText: Boolean(a.text),
          })),
        })),
        tasks: todo.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          why: t.why,
          stream: t.stream,
          status: t.status,
          effortHours: t.effortHours,
          aiAdjustedHours: t.aiAdjustedHours,
          execStrategy: t.execStrategy,
          execStatus: t.execStatus,
          execResult: t.execResult,
        })),
        assumptions: todo.assumptions.map((a) => ({
          id: a.id,
          question: a.question,
          answer: a.answer,
          stream: a.stream,
          status: a.status,
          override: a.override,
        })),
      }}
    />
  );
}

