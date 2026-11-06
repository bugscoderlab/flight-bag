// Task executor — dispatches a task to a coding agent via the CLIs that
// are installed on this machine. Strategies:
//
// 1. "opencode" — headless `opencode run` against the todo's workDir.
//    Always available; runs in a child process of the Next server. If the
//    todo has an sshTarget (user@host), the same command runs on that host
//    over SSH instead — workDir is then a path on the remote machine and
//    opencode must be installed there. Requires passwordless key auth
//    (BatchMode fails fast instead of prompting).
//
// 2. "herdr" — requires the Next server to be started inside a Herdr
//    pane (HERDR_ENV=1 inherited). Splits a sibling pane, starts an
//    OpenCode agent inside it via `herdr agent start --kind opencode`,
//    prompts it, waits for idle, reads the result back. The work is
//    visible in the user's terminal landscape. Always local.
//
// Tool references the backend understands (docs/executor-tools.md):
//   opencode: https://opencode.ai/v2/docs/cli — `opencode run [message]`
//     --agent --session --continue --format json --auto --file
//     `opencode api <method> <path>` against the background service.
//   herdr: workspaces/tabs/panes; agent lifecycle idle|working|blocked|
//     done|unknown; `herdr pane split/run/wait-output/read`,
//     `herdr agent start/prompt --wait/read/send-keys`.

import { execFile } from "node:child_process";
import { prisma } from "./db";

const MAX_RESULT_CHARS = 4000;

interface TaskInfo {
  id: string;
  title: string;
  why?: string | null;
  todo: { id: string; title: string; workDir?: string | null; sshTarget?: string | null };
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd ?? process.cwd(), timeout: opts.timeoutMs ?? 20 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT")
          return reject(new Error(`${cmd} not found on PATH`));
        resolve({ stdout, stderr });
      },
    );
  });
}

export function herdrAvailable(): boolean {
  return process.env.HERDR_ENV === "1";
}

function buildPrompt(task: TaskInfo): string {
  return [
    `Project: ${task.todo.title}`,
    task.todo.workDir ? `Working directory: ${task.todo.workDir}` : null,
    ``,
    `Task: ${task.title}`,
    task.why ? `Why: ${task.why}` : null,
    ``,
    `Complete this task. Work in the working directory given above.`,
    `When done, reply with a 5-line summary of what changed.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Strategy 1: headless opencode (locally, or over SSH) ─────────────

/** Shell-quote one argument for the remote shell over ssh. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function execOpencode(task: TaskInfo): Promise<string> {
  const args = ["run", buildPrompt(task), "--agent", "build", "--auto", "--format", "json"];
  const target = task.todo.sshTarget?.trim();
  let out: { stdout: string; stderr: string };
  if (target) {
    if (target.startsWith("-")) throw new Error(`invalid ssh target: ${target}`);
    const remote =
      (task.todo.workDir ? `cd ${shq(task.todo.workDir)} && ` : "") + args.map(shq).join(" ");
    // BatchMode: never hang on an interactive password prompt.
    out = await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", target, remote]);
  } else {
    out = await run("opencode", args, { cwd: task.todo.workDir ?? process.cwd() });
  }
  // --format json emits structured events; keep it simple and store the tail
  const text = out.stdout.trim() || out.stderr;
  return text.slice(-MAX_RESULT_CHARS);
}

// ── Strategy 2: herdr pane hosting an opencode agent ─────────────────

async function execHerdr(task: TaskInfo): Promise<string> {
  const cwd = task.todo.workDir ?? process.cwd();
  const safeName = `task-${task.id.slice(-6)}`.toLowerCase().replace(/[^a-z0-9_-]/g, "");

  // Split a sibling pane off the pane that hosts the Next server.
  const split = await run("herdr", [
    "pane", "split", "--current", "--direction", "right",
    "--cwd", cwd, "--no-focus",
  ]);
  const paneId = JSON.parse(split.stdout).result?.pane?.pane_id;
  if (!paneId) throw new Error(`herdr pane split failed: ${split.stdout}${split.stderr}`);

  try {
    await run("herdr", [
      "agent", "start", safeName, "--kind", "opencode", "--pane", paneId, "--",
      "--dir", cwd,
    ]);

    const prompt = await run("herdr", [
      "agent", "prompt", safeName, buildPrompt(task), "--wait", "--timeout", "1200000",
    ]);
    if (prompt.stderr && !prompt.stdout) throw new Error(prompt.stderr);

    const read = await run("herdr", [
      "agent", "read", safeName, "--source", "recent-unwrapped", "--lines", "200",
    ]);
    return (read.stdout || prompt.stdout || "").slice(-MAX_RESULT_CHARS);
  } finally {
    // Leave the pane open for the user to inspect; only release the name.
    await run("herdr", ["agent", "rename", safeName, "--clear"]).catch(() => {});
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────

export async function dispatchTask(taskId: string): Promise<{ strategy: string; result: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { todo: true },
  });
  if (!task) throw new Error("Task not found");
  if (task.execStatus === "running") throw new Error("Task is already running");

  const strategy = task.execStrategy ?? (herdrAvailable() ? "herdr" : "opencode");
  const info: TaskInfo = { id: task.id, title: task.title, why: task.why, todo: task.todo };

  await prisma.task.update({ where: { id: taskId }, data: { execStatus: "running" } });

  try {
    const result = strategy === "herdr" && herdrAvailable() ? await execHerdr(info) : await execOpencode(info);
    await prisma.task.update({
      where: { id: taskId },
      data: { execStatus: "succeeded", execResult: result },
    });
    return { strategy, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.task.update({
      where: { id: taskId },
      data: { execStatus: "failed", execResult: message.slice(0, MAX_RESULT_CHARS) },
    });
    throw err;
  }
}
