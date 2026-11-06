import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleAll } from "@/lib/scheduler";
import { deleteAttachmentFile } from "@/lib/attachment";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const todo = await prisma.todo.findUnique({
    where: { id },
    include: {
      dumps: {
        orderBy: { createdAt: "desc" },
        include: { attachments: { select: { id: true, filename: true, mimeType: true, size: true, ignored: true } } },
      },
      tasks: { orderBy: { sortOrder: "asc" } },
      assumptions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(todo);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.title) data.title = body.title;
  if (body.workDir !== undefined) data.workDir = body.workDir;
  if (body.sshTarget !== undefined) data.sshTarget = body.sshTarget || null;
  if (body.solutionComment !== undefined) data.solutionComment = body.solutionComment || null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (typeof body.paused === "boolean") data.paused = body.paused;
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  const todo = await prisma.todo.update({ where: { id }, data });
  if (typeof body.sortOrder === "number") await scheduleAll();
  return NextResponse.json(todo);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  // Collect file paths before the cascade removes the attachment rows.
  const atts = await prisma.attachment.findMany({
    where: { dump: { todoId: id } },
    select: { path: true },
  });
  await prisma.todo.delete({ where: { id } }); // cascades dumps, tasks, assumptions
  await Promise.all(atts.map((a) => deleteAttachmentFile(a.path)));
  await scheduleAll(); // remaining ETAs shift immediately
  return NextResponse.json({ ok: true });
}
