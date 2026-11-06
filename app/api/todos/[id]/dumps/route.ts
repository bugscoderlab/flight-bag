import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { extractText, saveAttachmentFile } from "@/lib/attachment";

type Params = { params: Promise<{ id: string }> };

// POST /api/todos/[id]/dumps — append a thought dump, optionally with
// file attachments. Accepts either:
//   JSON  { content }                       (text only, legacy)
//   FormData  content + files (one or more) (upload with attachments)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let content = "";
  let files: File[] = [];
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    content = String(form.get("content") ?? "");
    files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    const body = await req.json().catch(() => ({}));
    content = String(body.content ?? "");
  }

  if (!content.trim() && files.length === 0)
    return NextResponse.json({ error: "content or a file required" }, { status: 400 });

  const dump = await prisma.thoughtDump.create({
    data: { todoId: id, content: content.trim() },
  });

  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const text = await extractText(f);
    // File first (named by the row id), then the row that points at it.
    const id = randomUUID();
    const storedPath = await saveAttachmentFile(id, buf);
    await prisma.attachment.create({
      data: {
        id,
        dumpId: dump.id,
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        size: buf.length,
        path: storedPath,
        text,
      },
    });
  }

  const full = await prisma.thoughtDump.findUnique({
    where: { id: dump.id },
    include: { attachments: { select: { id: true, filename: true, mimeType: true, size: true, ignored: true, text: true } } },
  });
  return NextResponse.json(
    full && {
      ...full,
      attachments: full.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        ignored: a.ignored,
        hasText: Boolean(a.text),
      })),
    },
    { status: 201 },
  );
}
