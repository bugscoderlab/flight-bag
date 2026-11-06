# Executor tools — what the backend knows about Herdr and OpenCode

The backend dispatches tasks to coding agents through the **CLIs installed on
this machine** (or, for SSH targets, installed on the remote host). It never
invents commands; the installed binary's `--help` is the authority.

## SSH targets

A flight's todo can carry an `sshTarget` (`user@host`, picked from the
machine list on the Settings page, stored in `AppSetting ssh.machines`). When
set, the opencode strategy runs the same `opencode run …` command on the
remote host instead of locally:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=10 user@host 'cd <workDir> && opencode run …'
```

- `BatchMode` makes auth failures fast instead of hanging on a prompt —
  key auth must already work from the machine running the Next server.
- The todo's `workDir` is a path **on the remote host**; `opencode` must be
  installed there.
- The herdr strategy always runs locally (it splits panes on this machine).

## OpenCode (v2, `opencode`)

Client-server architecture. `opencode run` sends one message headlessly and
exits — that is the backend's primary interface.

```sh
opencode run "message" --agent build --auto --format json \
  [--session ID | --continue] [--model provider/model] [--file path]
```

- `--agent build` — the full-permission build agent; other agents exist.
- `--auto` — approve permissions not explicitly denied (unattended runs).
- `--session ID` — continue a session; a fresh ID starts a named session the
  backend can poll later.
- `opencode api get /api/info` / `opencode api post <path> --data '{...}'` —
  HTTP API against the background service (sessions, history).
- `opencode service status|restart` — the shared background service.
- Exit and output are captured by the backend; result truncated to 4000 chars.

## Herdr (`herdr`) — terminal multiplexer for coding agents

Organizes workspaces (`w1`), tabs (`w1:t1`), panes (`w1:p1`). Recognizes
coding agents inside panes and classifies lifecycle: `idle`, `working`,
`blocked` (approval/question UI), `done`, `unknown`.

Requires `HERDR_ENV=1` in the calling process — start `npm run dev` from
inside a Herdr pane for the integrated mode. Without it the backend falls
back to plain `opencode run`.

```sh
# Topology & raw panes
herdr pane split --current --direction right|down --cwd PATH [--no-focus]
herdr pane run <pane_id> "command"
herdr pane wait-output <pane_id> --match "text" [--timeout MS]
herdr pane read <pane_id> --source recent-unwrapped --lines 200

# Agents (a pane must be an available shell; kind opencode is supported)
herdr agent start <name> --kind opencode --pane <pane_id> [-- <agent-args>]
herdr agent prompt <name> "text" --wait [--timeout MS]
herdr agent wait <name> [--until blocked] [--timeout MS]
herdr agent read <name> --source recent-unwrapped --lines 200
herdr agent send-keys <name> esc|ctrl+c
```

Control commands return JSON on stdout (read IDs from responses, never
predict them); errors are JSON on stderr with exit 1; syntax errors exit 2.

## How the backend uses them

`lib/executor.ts` → `dispatchTask(taskId)`:

1. Load task + its todo. Strategy = `task.execStrategy`, defaulting to
   `herdr` when `HERDR_ENV=1`, else `opencode`.
2. Build the prompt: project title, todo.workDir, task title + why, and a
   request for a 5-line change summary.
3. Run it (`execOpencode` headless child process, or `execHerdr`: split a
   `--no-focus` sibling pane, `agent start --kind opencode`, `agent prompt
   --wait`, `agent read` back).
4. Persist `execStatus` (`running → succeeded|failed`) and a truncated
   `execResult` on the task. Herdr panes are left open for inspection; only
   the agent name is released.
