import { NextResponse } from "next/server";
import { getLlmConfig } from "@/lib/llm";

// Curated fallback when the live model list can't be fetched.
const FALLBACK = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5" },
  { id: "moonshotai/kimi-k2", name: "Kimi K2" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B" },
];

// GET /api/settings/llm/models — live OpenRouter model list (keyed-in or
// env key is used server-side); curated fallback on any failure.
export async function GET() {
  const config = await getLlmConfig();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { data?: { id: string; name?: string }[] };
    const models = (data.data ?? [])
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!models.length) throw new Error("empty");
    return NextResponse.json({ models, live: true });
  } catch {
    return NextResponse.json({ models: FALLBACK, live: false });
  }
}
