import { z } from "zod";
import { callLlmTool } from "./llm";
import { formatDumps, type DumpEntry } from "./dumpformat";

// ── Shared LLM plumbing ──────────────────────────────────────────────

const mockMode = () => process.env.PLANNER_MOCK === "1";

async function callTool<T>(
  system: string,
  user: string,
  toolName: string,
  schema: Record<string, unknown>,
): Promise<T> {
  if (mockMode()) return mockResponse(toolName) as T;
  return (await callLlmTool({
    toolName,
    description: "Submit the structured result",
    schema,
    system,
    user,
  })) as T;
}

function mockResponse(toolName: string): unknown {
  if (toolName === "submit_plan" || toolName === "revise_plan") {
    return {
      requests: ["Plan the slide content", "Plan the hours with breaks and activities"],
      assumptions: [
        { question: "What is the deadline?", answer: "No deadline mentioned — assumed within 2 weeks", stream: "Plan the slide content", confidence: "medium" },
        { question: "Solo or with help?", answer: "Assumed solo", stream: "Plan the hours with breaks and activities", confidence: "high" },
      ],
      tasks: [
        { title: "Sketch the approach", why: "Establish direction before building", stream: "Plan the slide content", dependsOn: null },
        { title: "Build the first version", why: "Deliver the core value", stream: "Plan the slide content", dependsOn: "Sketch the approach" },
        { title: "Draft the timed schedule", why: "Divide hours with breaks and mini activities", stream: "Plan the hours with breaks and activities", dependsOn: null },
      ],
    };
  }
  if (toolName === "submit_estimates") {
    return {
      estimates: [
        { title: "Sketch the approach", effortHours: 3, aiAdjustedHours: 1.5, confidence: "high" },
        { title: "Build the first version", effortHours: 8, aiAdjustedHours: 3, confidence: "medium" },
        { title: "Review and iterate", effortHours: 4, aiAdjustedHours: 1.5, confidence: "medium" },
      ],
    };
  }
  if (toolName === "assess_prior_art") {
    return {
      assessments: [
        { repo: "(mock) example/repo", verdict: "borrow", note: "Mock prior-art result so you can see this section during offline development." },
      ],
    };
  }
  if (toolName === "propose_solution") {
    return {
      sections: [
        { heading: "(mock) Part 1 — Opening", body: "Mock solution content for offline development." },
        { heading: "(mock) Part 2 — Core substance", body: "The main content of the deliverable." },
        { heading: "(mock) Part 3 — Close", body: "Wrap-up, call to action, or next steps." },
      ],
    };
  }
  return {};
}

// ── Schemas ──────────────────────────────────────────────────────────

const planSchema = {
  type: "object",
  properties: {
    requests: {
      type: "array",
      description: "Every distinct request found in the merged dump, in the user's own words",
      items: { type: "string" },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          stream: { type: "string", description: "The request this assumption belongs to" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["question", "answer", "stream", "confidence"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          stream: { type: "string", description: "The request this task serves" },
          dependsOn: { type: ["string", "null"] },
        },
        required: ["title", "why", "stream", "dependsOn"],
      },
    },
  },
  required: ["requests", "assumptions", "tasks"],
};

const estimateSchema = {
  type: "object",
  properties: {
    estimates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          effortHours: { type: "number" },
          aiAdjustedHours: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "effortHours", "aiAdjustedHours", "confidence"],
      },
    },
  },
  required: ["estimates"],
};

export const PlanResult = z.object({
  requests: z.array(z.string()),
  assumptions: z.array(z.object({ question: z.string(), answer: z.string(), stream: z.string(), confidence: z.string() })),
  tasks: z.array(z.object({
    title: z.string(),
    why: z.string(),
    stream: z.string(),
    dependsOn: z.string().nullable(),
  })),
});
export const EstimateResult = z.object({
  estimates: z.array(z.object({
    title: z.string(),
    effortHours: z.number(),
    aiAdjustedHours: z.number(),
    confidence: z.string(),
  })),
});

// ── Planner: the self-interview ──────────────────────────────────────

const PLANNER_SYSTEM = `You are the flight planner for a personal planning tool,
interviewing YOURSELF about the user's project. Your question style follows a
good brainstorm interviewer: questions anchored in specifics, in the user's
own vocabulary, no process jargon. A guess the user could correct is as
good as a question.

The user's dump is ONE merged note (their thoughts, possibly several asks).

1. Extract EVERY open question worth asking. Cover this territory: what
   kind of thing this is; why now and what success looks like; goals,
   non-goals, anti-goals; prior art; current state; details mentioned twice.
2. Answer each question YOURSELF with the most reasonable assumption given
   only what the dump says. State it plainly; flag low-confidence answers.
3. Output "requests": every distinct request in the dump, in the user's own
   words — list them ALL, even small side-asks.
4. Output tasks grouped by request: every task carries "stream" = the
   request it serves, and EVERY request must be served by at least one
   task. Never silently drop a request.
5. Every assumption also carries "stream" = the request it belongs to, so
   the user sees their questions organized the same way as the tasks.

Rules:
- Tasks are concrete, actionable, ordered. dependsOn is the exact title of
  another task in the list, or null. 3-10 tasks per request is typical.
- Every assumption is something the user might want to correct later.
- Do not ask the user anything. You answer your own questions.
- Respond ONLY via the submit_plan tool.`;

export async function planProject(title: string, dumps: DumpEntry[]) {
  return rawPlan(title, dumps);
}

async function rawPlan(title: string, dumps: DumpEntry[]) {
  const raw = await callTool(
    PLANNER_SYSTEM,
    `Project title: ${title}\n\nMerged dump:\n${formatDumps(dumps)}`,
    "submit_plan",
    planSchema,
  );
  return PlanResult.parse(raw);
}

export async function revisePlan(
  title: string,
  dumps: DumpEntry[],
  currentTasks: { title: string; why: string }[],
  overrides: { question: string; override: string }[],
) {
  const raw = await callTool(
    PLANNER_SYSTEM +
      `\n\nYou are REVISING an existing plan. The user overrode some assumptions.
Regenerate the task breakdown to respect these overrides. Keep tasks that
are unaffected unchanged. Tasks and assumptions must still carry their
stream (the request they serve), and every request must keep at least one
task.`,
    `Project title: ${title}\n\nMerged dump:\n${formatDumps(dumps)}\n\nCurrent tasks:\n${currentTasks
      .map((t) => `- ${t.title}: ${t.why}`)
      .join("\n")}\n\nOverridden assumptions (user's corrections):\n${overrides
      .map((o) => `- Q: ${o.question}\n  Corrected answer: ${o.override}`)
      .join("\n")}`,
    "revise_plan",
    planSchema,
  );
  return PlanResult.parse(raw);
}

// ── Estimator ────────────────────────────────────────────────────────

const ESTIMATOR_SYSTEM = `You estimate task effort for a solo builder who uses
AI assistance heavily. For each task give:
- effortHours: realistic hours for the user ALONE
- aiAdjustedHours: hours with AI help (typically 30-60% of effortHours;
  be honest, not optimistic)
- confidence: your confidence in the estimate
Respond ONLY via the submit_estimates tool.`;

export async function estimateTasks(
  projectTitle: string,
  tasks: { title: string; why: string }[],
) {
  const raw = await callTool(
    ESTIMATOR_SYSTEM,
    `Project: ${projectTitle}\n\nTasks:\n${tasks.map((t) => `- ${t.title}: ${t.why}`).join("\n")}`,
    "submit_estimates",
    estimateSchema,
  );
  return EstimateResult.parse(raw);
}

// ── Prior art: does an open-source project already do this? ──────────

const PRIOR_ART_SYSTEM = `You are assessing open-source repositories as PRIOR ART
for a project someone is about to build. For each repository, give a verdict:
- "use": this project already does the job — building from scratch may be a
  waste; note what it covers and what (if anything) would still be missing.
- "borrow": it does part of the job or solves a key sub-problem; note what to
  reuse or learn from it.
- "skip": it only superficially matches; say nothing beyond one short line.
Be honest and specific. Never recommend a repo you would not actually use.
Respond ONLY via the assess_prior_art tool.`;

const assessSchema = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          repo: { type: "string" },
          verdict: { type: "string", enum: ["use", "borrow", "skip"] },
          note: { type: "string" },
        },
        required: ["repo", "verdict", "note"],
      },
    },
  },
  required: ["assessments"],
};

export const PriorArtResult = z.object({
  assessments: z.array(
    z.object({ repo: z.string(), verdict: z.string(), note: z.string() }),
  ),
});

export async function assessPriorArt(
  projectTitle: string,
  taskTitles: string[],
  repos: { name: string; description: string; stars: number; language: string | null }[],
) {
  const raw = await callTool(
    PRIOR_ART_SYSTEM,
    `Project: ${projectTitle}\nPlanned tasks:\n${taskTitles.map((t) => `- ${t}`).join("\n")}\n\nCandidate repositories:\n${repos
      .map((r) => `- ${r.name} (${r.stars}★, ${r.language ?? "?"}) — ${r.description}`)
      .join("\n")}`,
    "assess_prior_art",
    assessSchema,
  );
  return PriorArtResult.parse(raw);
}

// ── Solution: what the deliverable actually contains ─────────────────

const SOLUTION_SYSTEM = `You propose the SOLUTION — the actual content of the
deliverable, not tasks. First infer WHAT the deliverable is from the project
and the raw thoughts (slide deck, document, app, website, event, business
case, lesson, process, trip plan — anything). Then write what the finished
thing contains, shaped the way that artifact is naturally structured:
- deck → one section per slide
- document/report → one section per section
- app/site/tool → one section per screen, page, or module
- event → one section per session, phase, or logistics block
- anything else → whatever structure the thing itself has
Rules:
- Sections are concrete: a reader could build the artifact from them alone.
- 4-12 sections. Bodies are tight — phrases and bullets, not essays.
- Headings read like the artifact's own labels (e.g. slide titles).
- Respect the assumption answers; they define scope and constraints.
- Respond ONLY via the propose_solution tool.`;

const solutionSchema = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
        required: ["heading", "body"],
      },
    },
  },
  required: ["sections"],
};

export const SolutionResult = z.object({
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

export async function proposeSolution(
  title: string,
  dump: string,
  taskTitles: string[],
  answers: { question: string; answer: string }[],
  feedback?: string,
) {
  const raw = await callTool(
    SOLUTION_SYSTEM,
    `Project: ${title}\n\nRaw thoughts:\n${dump}\n\nPlan legs:\n${taskTitles
      .map((t) => `- ${t}`)
      .join("\n")}\n\nAssumption answers:\n${answers
      .map((a) => `- ${a.question} → ${a.answer}`)
      .join("\n")}${
      feedback?.trim()
        ? `\n\nUser's feedback on the solution (steer the revision toward this):\n${feedback.trim()}`
        : ""
    }`,
    "propose_solution",
    solutionSchema,
  );
  return SolutionResult.parse(raw);
}
