import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteAttachmentFile } from "@/lib/attachment";

type Params = { params: Promise<{ id: string; dumpId: string }> };

// PATCH /api/todos/[id]/dumps/[dumpId] — body: { ignored: boolean } and/or { content: string }.
// Ignored dumps stay in the list but are excluded from the planner's dump.
// Editing content rewrites the dump and logs the before/after to DumpEdit.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { dumpId } = await params;
  const body = await req.json();

  if (body.ignored !== undefined) {
    if (typeof body.ignored !== "boolean")
      return NextResponse.json({ error: "ignored (boolean) required" }, { status: 400 });
    const dump = await prisma.thoughtDump.update({ where: { id: dumpId }, data: { ignored: body.ignored } });
    return NextResponse.json(dump);
  }

  if (body.content !== undefined) {
    if (typeof body.content !== "string" || !body.content.trim())
      return NextResponse.json({ error: "content (non-empty string) required" }, { status: 400 });
    const existing = await prisma.thoughtDump.findUnique({ where: { id: dumpId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [dump] = await prisma.$transaction([
      prisma.thoughtDump.update({ where: { id: dumpId }, data: { content: body.content } }),
      prisma.dumpEdit.create({ data: { dumpId, oldContent: existing.content, newContent: body.content } }),
    ]);
    return NextResponse.json(dump);
  }

  return NextResponse.json({ error: "nothing to update" }, { status: 400 });
}

// DELETE /api/todos/[id]/dumps/[dumpId] — remove a dump entry and its files.
export async function DELETE(_req: Request, { params }: Params) {
  const { dumpId } = await params;
  const atts = await prisma.attachment.findMany({ where: { dumpId }, select: { path: true } });
  await prisma.thoughtDump.delete({ where: { id: dumpId } }); // cascades attachment rows
  await Promise.all(atts.map((a) => deleteAttachmentFile(a.path)));
  return NextResponse.json({ ok: true });
}
