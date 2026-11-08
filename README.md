# Flight Bag — dispatch planner

Dump thoughts. AI files the flight plan. Built to the Flight Planning world
(`PRODUCT.md`, `DESIGN.md`, `.impeccable/briefs/app-shell.md`).

## Run

```sh
npm install
npx prisma db push          # sqlite at prisma/dev.db
npm run dev
```

Open http://localhost:3000 → **Settings** → paste your OpenRouter key
(openrouter.ai/keys). File a flight (title only) → open it → dump
thoughts → **File flight plan**. The planner interrogates itself: every open
question is answered with a stated assumption, filed as a NOTAM you can
veto; overriding re-files the plan (instant — corrections are saved
as overrides first; the LLM only runs when you hit **Re-file flight plan**).

## What's inside

- **Planner** (`lib/planner.ts`) — self-interviewing AI: `planProject`,
  `revisePlan`, `estimateTasks` (solo vs AI-assisted hours). Strict JSON via
  forced tool calls. Provider config lives in `lib/llm.ts` — OpenRouter
  (OpenAI-compatible) by default; the key/model/base URL are keyed in on the
  **Settings** page (stored in SQLite) with `.env` vars as fallback.
  `PLANNER_MOCK=1` for offline development.
- **Thought dumps** — every non-ignored dump (and the extracted text of its
  non-ignored attachments) merges into one note for the planner; ignores are
  reversible and never delete anything. Dumps are editable (✎ on the detail
  page); every edit is stored as a before/after `DumpEdit` row shown as an
  expandable trail on the dump. Attachment bytes are written to disk
  under `data/attachments/<id>` (gitignored) and the `Attachment` row points at
  them with `path`; text-like files feed the planner, other files are stored
  for download only. Deleting a file, dump, or flight removes the backing file.
- **Solution** — `lib/solution.ts` + the `/solution/propose` · `/solution/adopt`
  routes: the deliverable's actual contents, proposed from the dump, the live
  release, and the assumption answers. The Solution panel takes an optional
  comment that steers the next proposal; adopting clears it.
- **Scheduler** (`lib/scheduler.ts`) — deterministic: topological order,
  drag-priority, one-task-at-a-time, allocated onto per-weekday capacity
  (seeded 4h weekdays / 0 weekends; change via the API or prisma studio).
  Re-runs on plan/re-plan, manifest reorder, scrap, checking a leg done,
  and capacity changes; **↻ Recompute schedule** on the Route Profile page
  (or `POST /api/schedule`) forces a no-AI recompute on demand.
- **Background agent** (`lib/agent.ts` + `lib/cron.ts`) — morning brief
  07:30, nightly re-plan 23:00, weekly retro Sun 18:00, all auto-applied and
  snapshotted to `AgentRun` for rollback. Manual triggers on the Briefs page.
- **Executor** (`lib/executor.ts`, `docs/executor-tools.md`) — dispatch any
  leg to a coding agent via the installed CLIs: headless `opencode run`, or a
  Herdr pane hosting an opencode agent (start `npm run dev` inside a Herdr
  pane; the backend detects `HERDR_ENV=1`). Set a todo's working directory
  on its detail page first. Any flight can instead target an SSH machine
  (managed on the Settings page): opencode dispatches run there over
  `ssh user@host`, with the working directory interpreted on the remote host
  (passwordless key auth required).

## API sketch

`POST /api/todos` · `POST /api/todos/:id/dumps` · `POST /api/todos/:id/plan` ·
`POST /api/todos/:id/revise` · `POST /api/tasks/:id/dispatch` ·
`POST /api/agent/run` · `GET /api/agent/runs` · `PUT /api/settings/capacity` ·
`GET|PUT /api/settings/ssh`
