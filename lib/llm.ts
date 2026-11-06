// LLM layer — OpenRouter (OpenAI-compatible chat completions, raw fetch).
//
// Config resolution order (first wins):
//   1. Values keyed in on the Settings page → SQLite (AppSetting table)
//   2. Environment variables in .env
//   3. Built-in defaults below
//
// Keys (AppSetting.key): llm.apiKey · llm.model · llm.baseUrl

import { prisma } from "./db";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface LlmConfig {
  apiKey: string | null;
  model: string;
  baseUrl: string;
  source: "settings" | "env" | "default";
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["llm.apiKey", "llm.model", "llm.baseUrl"] } },
  });
  const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const apiKey = db["llm.apiKey"] || process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || null;
  const model = db["llm.model"] || process.env.LLM_MODEL || DEFAULT_MODEL;
  const baseUrl = db["llm.baseUrl"] || process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const source = db["llm.apiKey"] ? "settings" : apiKey ? "env" : "default";
  return { apiKey, model, baseUrl, source };
}

export function requireApiKey(config: LlmConfig): string {
  if (!config.apiKey)
    throw new Error(
      "No LLM API key configured. Add OPENROUTER_API_KEY to .env or key it in on the Settings page.",
    );
  return config.apiKey;
}

// ── Transport ────────────────────────────────────────────────────────

type Message = { role: "system" | "user" | "assistant"; content: string };

async function post(body: Record<string, unknown>): Promise<unknown> {
  const config = await getLlmConfig();
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey(config)}`,
      "Content-Type": "application/json",
      "X-Title": "Flight Bag",
    },
    body: JSON.stringify({ model: config.model, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

function textOf(data: unknown): string {
  const d = data as { choices?: { message?: { content?: string | null } }[] };
  return d.choices?.[0]?.message?.content ?? "";
}

function toolArgsOf(data: unknown): unknown {
  const d = data as {
    choices?: { message?: { tool_calls?: { function: { arguments: string } }[] } }[];
  };
  const args = d.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("LLM returned no tool call");
  return JSON.parse(args);
}

/** Plain text completion (briefings, summaries). */
export async function chatText(system: string, user: string): Promise<string> {
  const data = await post({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ] satisfies Message[],
  });
  return textOf(data);
}

/** Forced tool call: the model MUST answer through the named tool, whose
 *  arguments are JSON matching the given JSON Schema. */
export async function callLlmTool(opts: {
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
}): Promise<unknown> {
  const data = await post({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ] satisfies Message[],
    tools: [
      {
        type: "function",
        function: {
          name: opts.toolName,
          description: opts.description,
          parameters: opts.schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: opts.toolName } },
  });
  return toolArgsOf(data);
}
