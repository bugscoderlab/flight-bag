"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PlanVersion } from "@/lib/planhistory";
import type { Solution, SolutionCandidate } from "@/lib/solution";

type Notam = { id: string; question: string; answer: string; stream: string | null; status: string; override: string | null };

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  ignored: boolean;
  hasText: boolean;
};

type Dump = {
  id: string;
  content: string;
  createdAt: string;
  ignored: boolean;
  attachments: Attachment[];
};

type Todo = {
  id: string;
  title: string;
  status: string;
  etaDate: string | null;
  dueDate: string | null;
  workDir: string | null;
  sshTarget: string | null;
  solution: Solution | null;
  solutionCandidate: SolutionCandidate | null;
  solutionComment: string | null;
  latestDumpAt: string | null;
  planHistory: PlanVersion[];
  dumps: Dump[];
  tasks: {
    id: string;
    title: string;
    why: string | null;
    stream: string | null;
    status: string;
    effortHours: number | null;
    aiAdjustedHours: number | null;
    execStrategy: string | null;
    execStatus: string | null;
    execResult: string | null;
  }[];
  assumptions: Notam[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Detail({ todo }: { todo: Todo }) {
  const router = useRouter();
  const [dump, setDump] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [workDir, setWorkDir] = useState(todo.workDir ?? "");
  const [sshTarget, setSshTarget] = useState(todo.sshTarget ?? "");
  const [machines, setMachines] = useState<{ name: string; host: string }[]>([]);
  const [notamEdits, setNotamEdits] = useState<Record<string, string>>({});
  const [notamOpen, setNotamOpen] = useState<Record<string, boolean>>({});
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [dueSaved, setDueSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const late = Boolean(todo.etaDate && todo.dueDate && todo.etaDate > todo.dueDate);
  const activeDumpCount = todo.dumps.filter((d) => !d.ignored).length;

  useEffect(() => {
    fetch("/api/settings/ssh")
      .then((r) => r.json())
      .then((d: { machines?: { name: string; host: string }[] }) => setMachines(d.machines ?? []))
      .catch(() => {});
  }, []);

  async function setDue(value: string) {
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: value || null }),
    });
    setDueSaved(true);
    setTimeout(() => setDueSaved(false), 1500);
    router.refresh();
  }

  async function addDump(e: React.FormEvent) {
    e.preventDefault();
    if (!dump.trim() && files.length === 0) return;
    setUploading(true);
    try {
      let res: Response;
      if (files.length) {
        const fd = new FormData();
        fd.append("content", dump);
        files.forEach((f) => fd.append("files", f));
        res = await fetch(`/api/todos/${todo.id}/dumps`, { method: "POST", body: fd });
      } else {
        res = await fetch(`/api/todos/${todo.id}/dumps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: dump }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `Append failed (${res.status})`);
        return; // keep the text + files so you can retry
      }
      setDump("");
      setFiles([]);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  const MAX_FILE_MB = 25;
  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const tooBig = picked.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length)
      toast.error(`${tooBig.map((f) => f.name).join(", ")} over the ${MAX_FILE_MB} MB limit`);
    const ok = picked.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  }

  async function saveWorkDir() {
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workDir, sshTarget }),
    });
    router.refresh();
  }

  async function deleteDump(dumpId: string) {
    await fetch(`/api/todos/${todo.id}/dumps/${dumpId}`, { method: "DELETE" });
    router.refresh();
  }

  // Ignoring (not deleting) a dump keeps it in the log for reference but
  // drops it from the merged dump the planner reads.
  async function setDumpIgnored(dumpId: string, ignored: boolean) {
    await fetch(`/api/todos/${todo.id}/dumps/${dumpId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignored }),
    });
    router.refresh();
  }

  async function setAttachmentIgnored(attachmentId: string, ignored: boolean) {
    await fetch(`/api/todos/${todo.id}/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignored }),
    });
    router.refresh();
  }

  async function deleteAttachment(attachmentId: string) {
    await fetch(`/api/todos/${todo.id}/attachments/${attachmentId}`, { method: "DELETE" });
    router.refresh();
  }

  // Filing/re-filing runs server-side in the background — you can keep
  // browsing; the page reflects the new release on completion.
  async function plan() {
    setPlanning(true);
    fetch(`/api/todos/${todo.id}/plan`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.error(j.error ?? `Planning failed (${res.status})`);
          return;
        }
        router.refresh();
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => setPlanning(false));
  }

  const editCount = Object.values(notamEdits).filter((v) => v.trim()).length;

  async function refile() {
    const list = Object.entries(notamEdits)
      .filter(([, v]) => v.trim())
      .map(([assumptionId, override]) => ({ assumptionId, override }));
    if (!list.length) return;
    setPlanning(true);
    const res = await fetch(`/api/todos/${todo.id}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: list }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? `Re-file failed (${res.status})`);
      setPlanning(false);
      return; // keep the edits so you can retry
    }
    setNotamEdits({});
    setPlanning(false);
    router.refresh();
  }

  async function toggleTask(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "done" ? "pending" : "done" }),
    });
    router.refresh();
  }

  async function setStrategy(taskId: string, execStrategy: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ execStrategy }),
    });
    router.refresh();
  }

  async function dispatch(taskId: string) {
    setDispatching(taskId);
    const res = await fetch(`/api/tasks/${taskId}/dispatch`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Dispatch failed");
    }
    setDispatching(null);
    router.refresh();
  }

  async function acceptNotam(assumptionId: string) {
    await fetch(`/api/assumptions/${assumptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });
    router.refresh();
  }

  // Replace = correct this NOTAM and save it — no LLM, instant. The edit
  // stays in the strip so "Re-file plan with N override(s)" picks it up;
  // that button (or "Re-file flight plan") regenerates the plan around
  // your corrections when you're ready.
  async function replaceNotam(a: Notam) {
    const text = (notamEdits[a.id] ?? "").trim();
    if (!text) return;
    setPlanning(true);
    const res = await fetch(`/api/assumptions/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: text }),
    });
    setPlanning(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? `Replace failed (${res.status}) — your edit is kept`);
      return;
    }
    // Keep notamEdits[a.id] — it counts toward the re-file button.
    setNotamOpen((o) => ({ ...o, [a.id]: false }));
    router.refresh();
  }

  const pendingCount = todo.assumptions.filter((a) => a.status === "pending_review").length;

  return (
    <div className="stack">
      <div className="row">
        <div>
          <div className="caps mb">Flight {todo.id.slice(-6).toUpperCase()}</div>
          <h1 style={{ margin: 0 }}>{todo.title}</h1>
        </div>
        <span style={{ marginLeft: "auto" }} />
        {late && <span className="stamp failed">late — eta {todo.etaDate!.slice(5, 10)}</span>}
        <label className="row" style={{ gap: 6 }} title="Due date — flags LATE, never reshuffles the queue">
          <span className="caps">due</span>
          <input
            type="date"
            value={todo.dueDate ?? ""}
            onChange={(e) => setDue(e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          />
          {dueSaved && <span className="muted" style={{ fontSize: 11 }}>saved</span>}
        </label>
        <span className={`stamp ${todo.status}`}>{todo.status}</span>
      </div>

      {/* Thought dump */}
      <section className="card stack">
        <div className="caps">Thought dump — uncontrolled airspace</div>
        <form onSubmit={addDump} className="stack">
          <textarea
            placeholder="Dump everything. No structure needed. The planner interrogates itself, not you."
            value={dump}
            onChange={(e) => setDump(e.target.value)}
          />
          {files.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="row attach-chip">
                  <span className="attach-name" title={f.name}>{f.name}</span>
                  <span className="caps muted mono">{formatSize(f.size)}</span>
                  <span style={{ marginLeft: "auto" }} />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remove this file"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <span className="caps muted">Uploads when you press “Append to dump”.</span>
            </div>
          )}
          <div className="row">
            <button type="submit" className="ghost" disabled={uploading || (!dump.trim() && files.length === 0)}>
              {uploading ? "Appending…" : "Append to dump"}
            </button>
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
              📎 Attach files
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="file-input-hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span style={{ marginLeft: "auto" }} />
            {planning && <span className="caps" style={{ color: "var(--chart)" }}>Working in background…</span>}
            <button
              type="button"
              className="chart"
              onClick={plan}
              disabled={planning || activeDumpCount === 0}
              title={activeDumpCount === 0 ? "Every dump is ignored — un-ignore one to plan" : undefined}
            >
              {todo.tasks.length ? "Re-file flight plan" : "File flight plan"}
            </button>
          </div>
        </form>
        {todo.dumps.map((d) => (
          <div key={d.id} className={`card deep${d.ignored ? " ignored" : ""}`} style={{ fontSize: 13 }}>
            <div className="row" style={{ marginBottom: d.content || d.attachments.length ? 6 : 0 }}>
              <span className="caps">{d.createdAt.slice(0, 16).replace("T", " ")}</span>
              {d.ignored && <span className="stamp done">ignored</span>}
              <span style={{ marginLeft: "auto" }} />
              <label className="row" style={{ gap: 5, cursor: "pointer" }} title="Exclude this dump from the plan AI">
                <input
                  key={String(d.ignored)}
                  type="checkbox"
                  defaultChecked={d.ignored}
                  onChange={(e) => setDumpIgnored(d.id, e.target.checked)}
                />
                <span className="caps">ignore</span>
              </label>
              <button
                className="icon-btn"
                title="Delete this dump"
                onClick={() => deleteDump(d.id)}
              >
                ✕
              </button>
            </div>
            {d.content && <div className="brief-body">{d.content}</div>}
            {d.attachments.length > 0 && (
              <div className="stack" style={{ gap: 4, marginTop: d.content ? 8 : 0 }}>
                {d.attachments.map((a) => (
                  <div key={a.id} className={`row attach-chip${a.ignored ? " ignored" : ""}`}>
                    <a
                      className="attach-name"
                      href={`/api/todos/${todo.id}/attachments/${a.id}`}
                      download
                      title={`Download ${a.filename}`}
                    >
                      {a.filename}
                    </a>
                    <span className="caps muted mono">{formatSize(a.size)}</span>
                    {a.hasText && <span className="caps" style={{ color: "var(--chart)" }}>text</span>}
                    <span style={{ marginLeft: "auto" }} />
                    <label className="row" style={{ gap: 5, cursor: "pointer" }} title="Exclude this file from the plan AI">
                      <input
                        key={String(a.ignored)}
                        type="checkbox"
                        defaultChecked={a.ignored}
                        onChange={(e) => setAttachmentIgnored(a.id, e.target.checked)}
                      />
                      <span className="caps">ignore</span>
                    </label>
                    <button
                      className="icon-btn"
                      title="Remove this file"
                      onClick={() => deleteAttachment(a.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Working directory + dispatch target for dispatches */}
      <section className="card row">
        <div className="stack" style={{ flex: 1, gap: 8 }}>
          <div className="caps">Dispatch target — {sshTarget ? `runs on ${sshTarget} over SSH` : "runs on this machine"}</div>
          <input type="text" placeholder={sshTarget ? "/path/on/remote/host" : "~/code/my-project"} value={workDir} onChange={(e) => setWorkDir(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <span className="caps muted">host</span>
            <select value={sshTarget} onChange={(e) => setSshTarget(e.target.value)} style={{ width: "auto" }}>
              <option value="">This machine (local)</option>
              {machines.map((m) => (
                <option key={m.host} value={m.host}>{m.name} — {m.host}</option>
              ))}
              {sshTarget && !machines.some((m) => m.host === sshTarget) && (
                <option value={sshTarget}>{sshTarget} (not in the Settings list)</option>
              )}
            </select>
            <span className="muted" style={{ fontSize: 11 }}>
              {sshTarget ? "workDir is a path on the remote host · opencode must be installed there" : "manage machines on the Settings page"}
            </span>
          </div>
        </div>
        <button className="ghost" onClick={saveWorkDir}>Save</button>
      </section>

      {/* NOTAM strip — every NOTAM is editable, any status */}
      {todo.assumptions.length > 0 && (
        <section className="notam-strip">
          <div className="caps" style={{ color: "var(--notam)" }}>
            NOTAMs — read before departure · {pendingCount} new
          </div>
          {(() => {
            let lastStream: string | null = null;
            return todo.assumptions.map((a) => {
              const effective = a.override ?? a.answer;
              const header =
                a.stream && a.stream !== lastStream ? (
                  <div key={`nstream-${a.id}`} className="notam-stream-header">
                    <span className="caps">{a.stream}</span>
                  </div>
                ) : null;
              lastStream = a.stream ?? lastStream;
              return (
                <div key={a.id}>
                  {header}
                  <div className="notam-item">
                    <div className="row">
                      <div className="q" style={{ flex: 1 }}>Q — {a.question}</div>
                      <span className={`stamp ${a.status === "pending_review" ? "dumping" : a.status === "accepted" ? "doing" : "failed"}`}>
                        {a.status === "pending_review" ? "new" : a.status}
                      </span>
                    </div>
                    {a.status === "overridden" ? (
                      <>
                        <div className="a">
                          Assumed: {a.answer}
                          <button
                            className="icon-btn"
                            title="Reuse the assumed answer"
                            onClick={() => {
                              setNotamEdits({ ...notamEdits, [a.id]: a.answer });
                              setNotamOpen({ ...notamOpen, [a.id]: true });
                            }}
                          >
                            ⟲
                          </button>
                        </div>
                        <div className="a">
                          Override: {a.override}
                          {!notamOpen[a.id] && (
                            <button
                              className="icon-btn"
                              title="Edit this NOTAM"
                              onClick={() => setNotamOpen({ ...notamOpen, [a.id]: true })}
                            >
                              ✎
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="a">
                        Assumed: {effective}
                        {a.status !== "pending_review" && !notamOpen[a.id] && (
                          <button
                            className="icon-btn"
                            title="Edit this NOTAM"
                            onClick={() => setNotamOpen({ ...notamOpen, [a.id]: true })}
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    )}
                    {(a.status === "pending_review" || notamOpen[a.id]) && (
                      <div className="row mt">
                        <input
                          type="text"
                          placeholder={a.status === "pending_review" ? effective : ""}
                          value={notamEdits[a.id] ?? (a.status === "pending_review" ? "" : effective)}
                          onChange={(e) => setNotamEdits({ ...notamEdits, [a.id]: e.target.value })}
                        />
                        {(notamEdits[a.id] ?? (a.status === "pending_review" ? "" : effective)).trim() && (
                          <button className="chart" onClick={() => replaceNotam(a)} disabled={planning}>
                            Replace
                          </button>
                        )}
                        {a.status === "pending_review" && (
                          <button className="ghost" onClick={() => acceptNotam(a.id)}>Accept</button>
                        )}
                        {a.status !== "pending_review" && (
                          <button className="ghost" onClick={() => setNotamOpen({ ...notamOpen, [a.id]: false })}>Done</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
          {editCount > 0 && (
            <div className="mt">
              <button className="notam" onClick={refile} disabled={planning}>
                Re-file plan with {editCount} override(s)
              </button>
            </div>
          )}
        </section>
      )}

      {/* Dispatch release — the live plan */}
      {todo.tasks.length > 0 && (
        <section className="release">
          <header>
            <span className="caps">Dispatch release — flight plan</span>
            <span className="caps mono">
              {todo.tasks.reduce((s, t) => s + (t.aiAdjustedHours ?? 0), 0).toFixed(1)}h with AI ·{" "}
              {todo.tasks.reduce((s, t) => s + (t.effortHours ?? 0), 0).toFixed(1)}h solo
            </span>
          </header>
          {(() => {
            let lastStream: string | null = null;
            return todo.tasks.map((t) => {
              const header =
                t.stream && t.stream !== lastStream ? (
                  <div key={`stream-${t.id}`} className="stream-header">
                    <span className="caps">{t.stream}</span>
                  </div>
                ) : null;
              lastStream = t.stream ?? lastStream;
              return (
                <div key={t.id}>
                  {header}
                  <div className="leg">
                    <input
                      key={t.status}
                      type="checkbox"
                      defaultChecked={t.status === "done"}
                      onChange={() => toggleTask(t.id, t.status)}
                    />
                    <div>
                      <div className="title">{t.title}</div>
                      {t.why && <div className="muted" style={{ fontSize: 12 }}>{t.why}</div>}
                      {t.execResult && (
                        <div className="muted brief-body" style={{ fontSize: 11, marginTop: 4 }}>{t.execResult}</div>
                      )}
                    </div>
                    <div className="hours">
                      {t.aiAdjustedHours != null && t.effortHours != null && (
                        <>
                          <b>{t.aiAdjustedHours}h</b> <span className="muted">(was {t.effortHours}h)</span>
                        </>
                      )}
                    </div>
                    <select
                      value={t.execStrategy ?? ""}
                      onChange={(e) => setStrategy(t.id, e.target.value)}
                      style={{ width: "auto" }}
                    >
                      <option value="">manual leg</option>
                      <option value="opencode">{sshTarget ? "dispatch → opencode (via SSH)" : "dispatch → opencode"}</option>
                      <option value="herdr">dispatch → herdr pane</option>
                    </select>
                    {t.execStrategy && t.status !== "done" && (
                      <button
                        className="chart"
                        onClick={() => dispatch(t.id)}
                        disabled={dispatching === t.id || t.execStatus === "running"}
                      >
                        {t.execStatus === "running" ? "Working…" : dispatching === t.id ? "Dispatching…" : "Dispatch"}
                      </button>
                    )}
                    {t.execStatus && t.execStatus !== "running" && (
                      <span className={`stamp ${t.execStatus}`}>{t.execStatus}</span>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </section>
      )}

      {/* Solution — what the deliverable contains (bottom) */}
      <SolutionSection
        todoId={todo.id}
        title={todo.title}
        solution={todo.solution}
        candidate={todo.solutionCandidate}
        comment={todo.solutionComment}
        latestDumpAt={todo.latestDumpAt}
        assumptions={todo.assumptions}
        notamEdits={notamEdits}
      />

      {/* Plan history — previous releases kept for reference */}
      {todo.planHistory.length > 0 && <HistorySection history={todo.planHistory} />}
    </div>
  );
}

// ── Solution: what the deliverable actually contains. One button
//    (Re-propose) regenerates it from everything above: the latest dump,
//    the live release, and whatever you're editing in the NOTAM strip. ──

function SolutionSection({
  todoId,
  title,
  solution,
  candidate,
  comment,
  latestDumpAt,
  assumptions,
  notamEdits,
}: {
  todoId: string;
  title: string;
  solution: Solution | null;
  candidate: SolutionCandidate | null;
  comment: string | null;
  latestDumpAt: string | null;
  assumptions: Notam[];
  notamEdits: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(comment ?? "");
  const [savedText, setSavedText] = useState(comment ?? "");
  const [savingComment, setSavingComment] = useState(false);

  // Keep the local box in step with server state after a refresh.
  useEffect(() => {
    setText(comment ?? "");
    setSavedText(comment ?? "");
  }, [comment]);

  async function saveComment() {
    if (text === savedText) return;
    setSavingComment(true);
    await fetch(`/api/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solutionComment: text }),
    });
    setSavedText(text);
    setSavingComment(false);
  }

  // Solution is stale when a dump arrived after it was generated.
  const stale = Boolean(
    solution && latestDumpAt && new Date(latestDumpAt) > new Date(solution.createdAt),
  );

  async function propose() {
    setBusy(true);
    const answers = Object.entries(notamEdits)
      .filter(([, v]) => v.trim())
      .map(([assumptionId, answer]) => ({
        question: assumptions.find((a) => a.id === assumptionId)?.question ?? "",
        answer,
      }));
    const body: Record<string, unknown> = { comment: text };
    if (answers.length) body.answers = answers;
    const res = await fetch(`/api/todos/${todoId}/solution/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? `Failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  async function adopt() {
    setBusy(true);
    const res = await fetch(`/api/todos/${todoId}/solution/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "adopt" }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? `Failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  function download() {
    if (!solution) return;
    const md = [
      `# ${title} — solution`,
      ``,
      ...solution.sections.map((s) => `### ${s.heading}\n\n${s.body}`),
    ].join("\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="release proposed">
      <header>
        <span className="caps" style={{ color: "var(--chart)" }}>Solution — what you&apos;re building</span>
        <span className="caps mono" style={stale ? { color: "var(--amber)" } : undefined}>
          {stale
            ? `stale — dump ${latestDumpAt!.slice(5, 16).replace("T", " ")} is newer`
            : solution
              ? `adopted ${solution.createdAt.slice(0, 10)}`
              : ""}
        </span>
      </header>
      <div className="proposal-body">
        {solution && (
          <>
            <div className="row mb">
              <div className="caps">Current solution</div>
              <span style={{ marginLeft: "auto" }} />
              <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={download} title="Download as Markdown">
                ⬇ .md
              </button>
            </div>
            {solution.sections.map((s, i) => (
              <div key={i} className="md-block" style={{ marginBottom: 10 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{`### ${s.heading}\n\n${s.body}`}</ReactMarkdown>
              </div>
            ))}
          </>
        )}

        <div className="stack" style={{ gap: 6, marginTop: solution ? 12 : 0, marginBottom: 4 }}>
          <label className="caps" htmlFor="solution-comment">
            Comments — steer the next proposal (optional)
          </label>
          <textarea
            id="solution-comment"
            placeholder="e.g. keep it to 5 slides, drop the budget section, add a demo script…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveComment}
            style={{ minHeight: 64 }}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            {savingComment
              ? "Saving…"
              : text !== savedText
                ? "Unsaved — leaves the box to save"
                : text
                  ? "Saved — Re-propose will use this"
                  : "Optional: leave blank to propose from the dump and release alone."}
          </span>
        </div>

        {!candidate ? (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="chart" onClick={propose} disabled={busy}>
              {busy ? "Proposing…" : solution ? "Re-propose" : "Propose solution"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {solution
                ? "Takes the latest dump, release, your NOTAM edits, and the comment above."
                : "Reads the dump, the release, and the comment above."}
            </span>
          </div>
        ) : (
          <>
            <div className="caps mb" style={{ marginTop: solution ? 12 : 0 }}>
              Candidate — adopt to make it current
            </div>
            {candidate.sections.map((s, i) => (
              <div key={i} className="md-block" style={{ marginBottom: 10 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{`### ${s.heading}\n\n${s.body}`}</ReactMarkdown>
              </div>
            ))}
            {candidate.comment && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Steered by your comment: “{candidate.comment}”
              </div>
            )}
            <div className="row" style={{ marginTop: candidate.comment ? 12 : 0 }}>
              <button className="chart" onClick={adopt} disabled={busy}>
                {busy === true ? "Working…" : "Adopt solution"}
              </button>
              <button className="ghost" onClick={propose} disabled={busy}>
                {busy ? "Proposing…" : "Re-propose"}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Re-propose uses the latest dump, release, your NOTAM edits, and the comment above.
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Plan history — superseded releases kept for reference ────────────

function HistorySection({ history }: { history: PlanVersion[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card stack">
      <div className="caps">Plan history — previous releases ({history.length})</div>
      {history.map((v, i) => (
        <div key={i}>
          <div className="row" style={{ padding: "6px 0", borderTop: i ? "1px dashed var(--hairline)" : 0 }}>
            <span className="caps mono">{v.createdAt.slice(0, 16).replace("T", " ")}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {v.tasks.length} leg{v.tasks.length === 1 ? "" : "s"} ·{" "}
              {v.tasks.reduce((s, t) => s + (t.aiAdjustedHours ?? 0), 0).toFixed(1)}h
              {v.solution ? " · has solution" : ""}
            </span>
            <button className="ghost" style={{ marginLeft: "auto" }} onClick={() => setOpen(open === String(i) ? null : String(i))}>
              {open === String(i) ? "Hide" : "View"}
            </button>
          </div>
          {open === String(i) && (
            <div className="card deep stack" style={{ marginTop: 6, fontSize: 13 }}>
              {v.tasks.map((t, j) => (
                <div key={j}>
                  <b>{t.title}</b>
                  <span className="muted"> — {t.why}</span>
                  {t.aiAdjustedHours != null && (
                    <span className="caps mono" style={{ marginLeft: 8 }}>{t.aiAdjustedHours}h</span>
                  )}
                </div>
              ))}
              {v.assumptions.length > 0 && (
                <div className="muted" style={{ marginTop: 6 }}>
                  {v.assumptions.map((a, j) => (
                    <div key={j}>Q: {a.question} — A: {a.answer}{a.override ? ` → ${a.override}` : ""}</div>
                  ))}
                </div>
              )}
              {v.solution && (
                <div style={{ marginTop: 10 }}>
                  <div className="caps mb">Solution — what you were building</div>
                  {v.solution.sections.map((s, j) => (
                    <div key={j} className="md-block" style={{ marginBottom: 8 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{`### ${s.heading}\n\n${s.body}`}</ReactMarkdown>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
