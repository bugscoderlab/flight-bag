import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, getLlmConfig } from "@/lib/llm";

const KEYS = { apiKey: "llm.apiKey", model: "llm.model", baseUrl: "llm.baseUrl" } as const;

function preview(key: string | null): string | null {
  if (!key) return null;
  return key.length <= 8 ? "••••" : "••••" + key.slice(-4);
}

// GET /api/settings/llm — current config, key masked
export async function GET() {
  const config = await getLlmConfig();
  return NextResponse.json({
    configured: Boolean(config.apiKey),
    keyPreview: preview(config.apiKey),
    model: config.model,
    baseUrl: config.baseUrl,
    source: config.source,
    defaults: { model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL },
  });
}

// PUT /api/settings/llm — body: { apiKey?, model?, baseUrl? }
// apiKey is only replaced when a non-empty value is sent; send apiKey:""
// explicitly to clear a stored key (falls back to env / none).
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const upserts: Promise<unknown>[] = [];

  if (body.apiKey !== undefined) {
    if (body.apiKey === "") {
      await prisma.appSetting.deleteMany({ where: { key: KEYS.apiKey } });
    } else {
      upserts.push(
        prisma.appSetting.upsert({
          where: { key: KEYS.apiKey },
          create: { key: KEYS.apiKey, value: String(body.apiKey) },
          update: { value: String(body.apiKey) },
        }),
      );
    }
  }
  for (const field of ["model", "baseUrl"] as const) {
    if (body[field] !== undefined && body[field] !== "") {
      upserts.push(
        prisma.appSetting.upsert({
          where: { key: KEYS[field] },
          create: { key: KEYS[field], value: String(body[field]) },
          update: { value: String(body[field]) },
        }),
      );
    }
  }
  await Promise.all(upserts);
  return GET();
}
