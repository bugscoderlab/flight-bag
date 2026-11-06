import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  const max = await prisma.todo.aggregate({ _max: { sortOrder: true } });
  const todo = await prisma.todo.create({
    data: { title: title.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  return NextResponse.json(todo, { status: 201 });
}
