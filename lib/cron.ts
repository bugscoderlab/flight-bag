// Timed triggers for the background agent (node-cron).
// Started once from instrumentation.ts (Node runtime only).
//   07:30 daily   → morning-brief
//   23:00 daily   → nightly-replan
//   Sun 18:00     → weekly-retro

import cron from "node-cron";
import { runAgent, type AgentMode } from "./agent";

let started = false;

const JOBS: { cron: string; mode: AgentMode }[] = [
  { cron: "30 7 * * *", mode: "morning-brief" },
  { cron: "0 23 * * *", mode: "nightly-replan" },
  { cron: "0 18 * * 0", mode: "weekly-retro" },
];

export function startCron() {
  if (started) return;
  if (process.env.DISABLE_AGENT_CRON === "1") return;
  started = true;
  for (const job of JOBS) {
    cron.schedule(job.cron, () => {
      runAgent(job.mode).catch((err) => console.error(`[agent:${job.mode}]`, err));
    });
  }
  console.log(`[agent] cron registered: ${JOBS.map((j) => `${j.mode} (${j.cron})`).join(", ")}`);
}
