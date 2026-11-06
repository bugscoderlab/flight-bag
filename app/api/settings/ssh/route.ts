import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const KEY = "ssh.machines";

export interface SshMachine {
  name: string; // display label, e.g. "gpu box"
  host: string; // ssh destination, e.g. "z@192.168.1.20"
}

async function getMachines(): Promise<SshMachine[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try {
    const v = JSON.parse(row.value);
    if (!Array.isArray(v)) return [];
    return v
      .filter((m) => typeof m?.host === "string" && m.host.trim().length > 0 && !m.host.trim().startsWith("-"))
      .map((m) => ({
        name: (typeof m.name === "string" && m.name.trim()) || m.host.trim(),
        host: m.host.trim(),
      }));
  } catch {
    return [];
  }
}

// GET /api/settings/ssh — { machines: [{ name, host }] }
export async function GET() {
  return NextResponse.json({ machines: await getMachines() });
}

// PUT /api/settings/ssh — body: { machines: [{ name?, host }] } (full replace)
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { machines?: unknown };
  const machines: SshMachine[] = (Array.isArray(body.machines) ? body.machines : [])
    .filter((m) => typeof m?.host === "string" && m.host.trim().length > 0 && !m.host.trim().startsWith("-"))
    .slice(0, 20)
    .map((m) => ({
      name: (typeof m.name === "string" && m.name.trim()) || m.host.trim(),
      host: m.host.trim(),
    }));
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(machines) },
    update: { value: JSON.stringify(machines) },
  });
  return NextResponse.json({ machines });
}
