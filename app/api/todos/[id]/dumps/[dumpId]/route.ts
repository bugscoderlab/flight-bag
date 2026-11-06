import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteAttachmentFile } from "@/lib/attachment";

type Params = { params: Promise<{ id: string; dumpId: string }> };

// PATCH /api/todos/[id]/dumps/[dumpId] — body: { ignored: boolean }.
// Ignored dumps stay in the list but are excluded from the planner's dump.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { dumpId } = await params;
  const { ignored } = await req.json();
  if (typeof ignored !== "boolean")
    return NextResponse.json({ error: "ignored (boolean) required" }, { status: 400 });
  const dump = await prisma.thoughtDump.update({ where: { id: dumpId }, data: { ignored } });
  return NextResponse.json(dump);
}

// DELETE /api/todos/[id]/dumps/[dumpId] — remove a dump entry and its files.
export async function DELETE(_req: Request, { params }: Params) {
  const { dumpId } = await params;
  const atts = await prisma.attachment.findMany({ where: { dumpId }, select: { path: true } });
  await prisma.thoughtDump.delete({ where: { id: dumpId } }); // cascades attachment rows
  await Promise.all(atts.map((a) => deleteAttachmentFile(a.path)));
  return NextResponse.json({ ok: true });
}
