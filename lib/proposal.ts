import { assessPriorArt, estimateTasks, planProject } from "./planner";
import { searchPriorArt, type PriorArt } from "./priorart";
import { similarity } from "./textmatch";
import { prisma } from "./db";
import { scheduleAll } from "./scheduler";

export interface ProposalTask {
  title: string;
  why: string;
  stream: string;
  dependsOn: string | null;
  effortHours: number | null;
  aiAdjustedHours: number | null;
  confidence: string | null;
}

export interface Proposal {
  requests: string[];
  tasks: ProposalTask[];
  assumptions: { question: string; answer: string; stream: string }[];
  priorArt: PriorArt[];
  createdAt: string;
}

/** Merge planner output + estimates + prior-art assessment into a proposal. */
export function buildProposal(
  plan: Awaited<ReturnType<typeof planProject>>,
  estimates: Awaited<ReturnType<typeof estimateTasks>>,
  priorArt: PriorArt[] = [],
): Proposal {
  return {
    requests: plan.requests,
    tasks: plan.tasks.map((t) => {
      const est = estimates.estimates.find((e) => e.title === t.title);
      return {
        title: t.title,
        why: t.why,
        stream: t.stream,
        dependsOn: t.dependsOn,
        effortHours: est?.effortHours ?? null,
        aiAdjustedHours: est?.aiAdjustedHours ?? null,
        confidence: est?.confidence ?? null,
      };
    }),
    assumptions: plan.assumptions.map((a) => ({ question: a.question, answer: a.answer, stream: a.stream })),
    priorArt,
    createdAt: new Date().toISOString(),
  };
}

/** Search GitHub for existing open-source projects, have the LLM assess them. */
export async function gatherPriorArt(title: string, taskTitles: string[]): Promise<PriorArt[]> {
  const repos = await searchPriorArt(title);
  if (!repos.length) return [];
  const { assessments } = await assessPriorArt(title, taskTitles, repos);
  return assessments.map((a) => {
    const repo = repos.find((r) => r.name === a.repo || a.repo.includes(r.name));
    return {
      repo: a.repo,
      url: repo?.url ?? "",
      stars: repo?.stars ?? 0,
      verdict: a.verdict as PriorArt["verdict"],
      note: a.note,
    };
  });
}

// ── NOTAM identity matching ──────────────────────────────────────────
// The AI often rewords a question between re-files. Match by token
// overlap so a user's accepted/overridden NOTAM survives rewording.
// (similarity() lives in lib/textmatch.ts, shared with coverage checks.)

/** Replace the live plan with a proposal's contents. NOTAMs MERGE rather
 * than replace: accepted/overridden rows survive (even when the AI rewords
 * the question), pending rows get refreshed AI answers, genuinely new
 * questions are added, questions the new plan dropped are removed, and
 * duplicates INSIDE the new set (the AI often asks the same question twice
 * with different wording) are absorbed into the kept row.
 * Caller is responsible for snapshotting history first. */
export async function applyPlan(todoId: string, proposal: Proposal): Promise<void> {
  const prev = await prisma.assumption.findMany({ where: { todoId } });
  const matchedOld = new Set<string>();
  const keptRows: { question: string; stream: string; status: string; override: string | null; answer: string }[] = [];

  const assumptionsData = proposal.assumptions
    .map((a) => {
      // 1) link to a previous NOTAM (user-touched rows survive)
      let best: (typeof prev)[number] | null = null;
      let bestScore = 0;
      for (const old of prev) {
        if (matchedOld.has(old.id)) continue;
        const s = similarity(old.question, a.question);
        if (s > bestScore) { bestScore = s; best = old; }
      }
      if (best && bestScore >= 0.6) {
        matchedOld.add(best.id);
        if (best.status === "accepted" || best.status === "overridden") {
          const row = { question: best.question, answer: best.answer, stream: best.stream ?? a.stream, status: best.status, override: best.override };
          keptRows.push(row);
          return row;
        }
        const row = { question: a.question, answer: a.answer, stream: a.stream, status: "pending_review", override: null };
        keptRows.push(row);
        return row;
      }
      // 2) dedupe against rows already kept this round (AI's own duplicates)
      for (const k of keptRows) {
        if (similarity(k.question, a.question) >= 0.75) return null;
      }
      const row = { question: a.question, answer: a.answer, stream: a.stream, status: "pending_review", override: null };
      keptRows.push(row);
      return row;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  await prisma.$transaction([
    prisma.task.deleteMany({ where: { todoId } }),
    prisma.assumption.deleteMany({ where: { todoId } }),
    ...assumptionsData.map((a) => prisma.assumption.create({ data: { todoId, ...a } })),
    ...proposal.tasks.map((t, i) =>
      prisma.task.create({
        data: {
          todoId,
          title: t.title,
          why: t.why,
          stream: t.stream,
          sortOrder: i,
          effortHours: t.effortHours,
          aiAdjustedHours: t.aiAdjustedHours,
          confidence: t.confidence,
        },
      }),
    ),
    prisma.todo.update({ where: { id: todoId }, data: { solutionCandidate: null, status: "planned" } }),
  ]);
  const created = await prisma.task.findMany({ where: { todoId } });
  for (const t of proposal.tasks) {
    if (!t.dependsOn) continue;
    const dep = created.find((c) => c.title === t.dependsOn);
    const self = created.find((c) => c.title === t.title);
    if (dep && self && dep.id !== self.id)
      await prisma.task.update({ where: { id: self.id }, data: { dependsOnId: dep.id } });
  }
  await scheduleAll();
}
