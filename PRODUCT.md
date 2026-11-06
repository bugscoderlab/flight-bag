# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js (App Router) + TypeScript + Prisma/SQLite + OpenRouter
(OpenAI-compatible; provider/key configured on the in-app Settings page,
config layer in lib/llm.ts)

## Users

Solo user: a builder running multiple personal projects at once, on their
own laptop, daily. No other audiences.

## Product Purpose

A todo app where the user creates a todo by title alone, dumps unstructured
thoughts into it, and AI turns the mess into an estimated, scheduled plan —
then keeps re-planning behind the scenes. Success = the user never writes
a task list by hand, and always knows what to do next and when projects land.

## Positioning

The AI interviews *itself*: it extracts open questions from the raw dump,
answers each with a stated assumption, and presents a finished plan plus an
assumption list the user can veto — instead of interrogating the user.
A background agent then re-plans, expands upcoming tasks, and runs weekly
retrospectives automatically.

## Operating Context

Local-first, single machine (macOS). Runs via npm while the user works.
Morning brief + nightly re-plan are timed runs; manual trigger also exists.

## Capabilities and Constraints

- Todos: title-only creation; append-only thought dumps; dumps accept file
  attachments (stored on disk under data/attachments/, pointed to by the DB;
  text-like files are extracted and fed to the planner), and either a dump or
  one of its files can be *ignored* — kept in the log for reference, excluded
  from the merged dump the AI reads
- Planner: self-interview → plan + assumptions; overrides trigger revise()
- Solution: the deliverable's contents, proposed from dump + release +
  assumption answers; an optional free-text comment steers the next proposal
- Manifest: finished flights are hidden (kept, not deleted) via the same
  checkbox bulk actions as Pause/Re-plan, grouped into a collapsible
  "Hidden (N)" fold and brought back with Unhide
- Estimator: effortHours + aiAdjustedHours + confidence per task
- Scheduler: deterministic, topological + greedy onto per-weekday capacity,
  drag-to-order priority, one-task-at-a-time (user attention is serial)
- Background agent: auto-applies everything; every run snapshotted to
  AgentRun history for rollback
- Agent modes: morning-brief, nightly-replan, weekly-retro, expand-next, manual-full

## Product Principles

1. The user dumps; the AI structures. Never the reverse.
2. Estimates are always shown as "alone → with AI" pairs.
3. The scheduler tells the truth about one-at-a-time.
4. The agent acts autonomously but every change is in an auditable history.

## Accessibility & Inclusion

Single user, no confirmed requirements beyond standard web a11y.
