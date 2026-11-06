import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteAttachmentFile, readAttachmentFile } from "@/lib/attachment";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

// GET /api/todos/[id]/attachments/[attachmentId] — stream the file from disk.
export async function GET(_req: NextRequest, { params }: Params) {
  const { attachmentId } = await params;
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readAttachmentFile(a.path);
  } catch {
    return NextResponse.json({ error: "file missing on disk" }, { status: 410 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": a.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
    },
  });
}

// PATCH /api/todos/[id]/attachments/[attachmentId] — body: { ignored }.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { attachmentId } = await params;
  const { ignored } = await req.json();
  if (typeof ignored !== "boolean")
    return NextResponse.json({ error: "ignored (boolean) required" }, { status: 400 });
  const a = await prisma.attachment.update({ where: { id: attachmentId }, data: { ignored } });
  return NextResponse.json({ id: a.id, ignored: a.ignored });
}

// DELETE /api/todos/[id]/attachments/[attachmentId] — drop the row and its file.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { attachmentId } = await params;
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) return NextResponse.json({ ok: true });
  await prisma.attachment.delete({ where: { id: attachmentId } });
  await deleteAttachmentFile(a.path);
  return NextResponse.json({ ok: true });
}
