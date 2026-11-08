import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeTags, parseInlineTags } from "@/lib/tags";

export async function GET() {
  const todos = await prisma.todo.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { assumptions: { where: { status: "pending_review" } }, tasks: true, dumps: true } },
    },
  });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const { title: rawTitle, tags } = await req.json();
  // Title and tags share one box: "#project" tokens in the title become tags.
  const parsed = parseInlineTags(String(rawTitle ?? ""));
  const extra = normalizeTags(tags);
  const title = parsed.title;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const max = await prisma.todo.aggregate({ _max: { sortOrder: true } });
  const todo = await prisma.todo.create({
    data: {
      title,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      tags: JSON.stringify(normalizeTags([...parsed.tags, ...extra])),
    },
  });
  return NextResponse.json(todo, { status: 201 });
}
