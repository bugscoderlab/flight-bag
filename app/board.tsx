"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseTags } from "@/lib/tags";

type Row = {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  etaDate: string | null;
  dueDate: string | null;
  openLegs: number;
  notams: number;
  dumps: number;
  hasDumps: boolean;
  tags: string[];
  paused: boolean;
  hidden: boolean;
};

export function Manifest({ todos: initial }: { todos: Row[] }) {
  const [todos, setTodos] = useState(initial);
  const [title, setTitle] = useState("");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [tagEditing, setTagEditing] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [arming, setArming] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState<Set<string>>(new Set());
  const [planError, setPlanError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const router = useRouter();

  // Hide (or unhide) every selected flight — same shape as Pause / Re-plan.
  async function bulkHide() {
    const sel = todos.filter((t) => selected.has(t.id));
    if (!sel.length) return;
    const next = sel.some((t) => !t.hidden); // hide all unless every selected one is already hidden
    const ids = new Set(sel.map((t) => t.id));
    await Promise.all(
      sel.map((t) =>
        fetch(`/api/todos/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden: next }),
        }),
      ),
    );
    setTodos((ts) => ts.map((t) => (ids.has(t.id) ? { ...t, hidden: next } : t)));
    setSelected(new Set());
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const created = await res.json();
      setTodos((ts) => [
        ...ts,
        {
          id: created.id,
          title: created.title,
          status: created.status,
          sortOrder: created.sortOrder,
          etaDate: null,
          dueDate: null,
          openLegs: 0,
          notams: 0,
          dumps: 0,
          hasDumps: false,
          tags: parseTags(created.tags),
          paused: false,
          hidden: false,
        },
      ]);
      setTitle("");
      router.refresh();
    }
  }

  // Tags replace the whole set server-side (normalize = trim + case-insensitive dedupe).
  async function updateTags(t: Row, tags: string[]) {
    setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, tags } : x)));
    await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    router.refresh();
  }

  function addTag(t: Row) {
    const incoming = tagDraft.split(",").map((s) => s.trim()).filter(Boolean);
    if (incoming.length) updateTags(t, [...t.tags, ...incoming]);
    setTagDraft("");
    setTagEditing(null);
  }

  function toggleTagFilter(tag: string) {
    setTagFilter((s) => {
      const n = new Set(s);
      if (n.has(tag)) n.delete(tag);
      else n.add(tag);
      return n;
    });
  }

  async function scrap(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTodos((ts) => ts.filter((t) => t.id !== id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      router.refresh();
    }
  }

  // Planning runs server-side in the background — cards show progress and
  // update when done; you keep browsing freely.
  async function planOne(t: Row) {
    setPlanning((s) => new Set(s).add(t.id));
    setPlanError(null);
    fetch(`/api/todos/${t.id}/plan`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setPlanError(`${t.title}: ${j.error ?? res.status}`);
          return;
        }
        const fresh = await res.json();
        setTodos((ts) =>
          ts.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  status: fresh.status,
                  etaDate: fresh.etaDate ?? null,
                  notams: fresh.assumptions?.length ?? x.notams,
                  openLegs: fresh.tasks?.length ?? x.openLegs,
                }
              : x,
          ),
        );
        router.refresh();
      })
      .catch((err) => setPlanError(`${t.title}: ${err}`))
      .finally(() =>
        setPlanning((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        }),
      );
  }

  function bulkPlan() {
    const targets = todos.filter((t) => selected.has(t.id) && t.hasDumps && !t.paused);
    const skipped = selected.size - targets.length;
    if (skipped > 0)
      setPlanError(`${skipped} flight(s) skipped — need dumps and not paused`);
    targets.forEach(planOne);
    setSelected(new Set());
  }

  async function bulkPause() {
    const sel = todos.filter((t) => selected.has(t.id));
    if (!sel.length) return;
    const anyActive = sel.some((t) => !t.paused);
    const next = anyActive; // pause all if any is active, else resume all
    await Promise.all(
      sel.map((t) =>
        fetch(`/api/todos/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused: next }),
        }),
      ),
    );
    const ids = new Set(sel.map((t) => t.id));
    setTodos((ts) => ts.map((t) => (ids.has(t.id) ? { ...t, paused: next } : t)));
    setSelected(new Set());
    router.refresh();
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function reorder(id: string, beforeId: string | null) {
    const list = [...todos];
    const from = list.findIndex((t) => t.id === id);
    const [moved] = list.splice(from, 1);
    const to = beforeId ? list.findIndex((t) => t.id === beforeId) : list.length;
    list.splice(to < 0 ? list.length : to, 0, moved);
    setTodos(list.map((t, i) => ({ ...t, sortOrder: i })));
    await Promise.all(
      list.map((t, i) =>
        fetch(`/api/todos/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        }),
      ),
    );
    router.refresh();
  }

  // Keyboard reorder from the drag grip — same result as dropping the card.
  function moveByKeyboard(id: string, dir: -1 | 1) {
    const i = todos.findIndex((t) => t.id === id);
    if (i < 0) return;
    const dest = i + dir;
    if (dest < 0 || dest >= todos.length) return;
    const beforeId = dir === -1 ? todos[i - 1].id : dest + 1 < todos.length ? todos[dest + 1].id : null;
    reorder(id, beforeId);
  }

  const selRows = todos.filter((t) => selected.has(t.id));
  const anyActive = selRows.some((t) => !t.paused);
  const planLabel = selRows.some((t) => t.status === "dumping") ? "Plan" : "Re-plan";
  const hiddenList = todos.filter((t) => t.hidden);
  const visibleAll = todos.filter((t) => !t.hidden);
  // Tag filter intersects: a flight shows only when it carries every selected tag.
  const visible = tagFilter.size
    ? visibleAll.filter((t) => [...tagFilter].every((f) => t.tags.some((x) => x.toLowerCase() === f.toLowerCase())))
    : visibleAll;
  const allTags = [...new Map(todos.flatMap((t) => t.tags).map((x) => [x.toLowerCase(), x])).values()].sort((a, b) => a.localeCompare(b));
  const selAnyVisible = selRows.some((t) => !t.hidden);

  const renderCard = (t: Row) => (
    <div
      key={t.id}
      className={`card dispatch ${dragging === t.id ? "dragging" : ""} ${dropTarget === t.id && dragging !== t.id ? "drop-target" : ""} ${selected.has(t.id) ? "selected" : ""} ${t.hidden ? "hidden-flight" : ""}`}
      draggable={!t.hidden}
      onDragStart={(e) => {
        setDragging(t.id);
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragging && dragging !== t.id) setDropTarget(t.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id && id !== t.id) reorder(id, t.id);
        setDragging(null);
        setDropTarget(null);
      }}
    >
      <span className="grip-slot">
        <button
          type="button"
          className="grip"
          aria-label={`Select or reorder ${t.title} — arrow keys reorder`}
          title="Drag to reorder — click to select"
          onClick={() => toggleSelect(t.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { e.preventDefault(); moveByKeyboard(t.id, -1); }
            if (e.key === "ArrowDown") { e.preventDefault(); moveByKeyboard(t.id, 1); }
          }}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
            <circle cx="2.5" cy="3" r="1.5" /><circle cx="7.5" cy="3" r="1.5" />
            <circle cx="2.5" cy="8" r="1.5" /><circle cx="7.5" cy="8" r="1.5" />
            <circle cx="2.5" cy="13" r="1.5" /><circle cx="7.5" cy="13" r="1.5" />
          </svg>
        </button>
        <input
          type="checkbox"
          checked={selected.has(t.id)}
          onChange={() => toggleSelect(t.id)}
          onClick={(e) => e.stopPropagation()}
          title="Select for bulk actions"
        />
      </span>
      <div className={t.paused ? "paused" : undefined} style={{ flex: 1, minWidth: 220 }}>
        <Link href={`/todo/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="title" style={{ cursor: "pointer" }}>{t.title}</div>
        </Link>
        <div className="tag-row">
            {t.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
                <button
                  type="button"
                  className="tag-x"
                  title={`Remove tag ${tag}`}
                  onClick={() => updateTags(t, t.tags.filter((x) => x !== tag))}
                >
                  ✕
                </button>
              </span>
            ))}
            {tagEditing === t.id ? (
              <input
                type="text"
                className="tag-input"
                placeholder="tag, another"
                value={tagDraft}
                autoFocus
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => addTag(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(t); }
                  if (e.key === "Escape") { setTagDraft(""); setTagEditing(null); }
                }}
              />
            ) : (
              <button type="button" className="tag tag-add" title="Add a tag — project or subproject" onClick={() => setTagEditing(t.id)}>
                ＋ tag
              </button>
            )}
          </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {t.openLegs} open leg{t.openLegs === 1 ? "" : "s"} · {t.dumps} dump{t.dumps === 1 ? "" : "s"}
        </div>
      </div>
      <div className="meta">
        {t.notams > 0 && <span className="notam-badge">{t.notams} NOTAM{t.notams === 1 ? "" : "s"}</span>}
        {t.etaDate && (
          <span className="caps mono">
            ETA {t.etaDate.slice(0, 10)}
          </span>
        )}
        {t.dueDate && (
          <span className={`caps mono ${t.etaDate && t.etaDate.slice(0, 10) > t.dueDate ? "due-late" : ""}`}>
            DUE {t.dueDate.slice(5)}
          </span>
        )}
        {planning.has(t.id) && <span className="caps" style={{ color: "var(--chart)" }}>Planning…</span>}
        <span className={`stamp ${t.status}`}>{t.status}</span>
        {t.hidden && <span className="stamp done">hidden</span>}
        {arming === t.id ? (
          <>
            <span className="muted" style={{ fontSize: 12 }}>Scrap this flight?</span>
            <button className="notam" onClick={() => scrap(t.id)}>Confirm</button>
            <button className="ghost" onClick={() => setArming(null)}>Keep</button>
          </>
        ) : (
          <button className="ghost" onClick={() => setArming(t.id)}>Scrap</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="stack">
      <form onSubmit={create} className="row">
        <input
          type="text"
          placeholder="File a new flight — title, #tag it by project…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">File</button>
      </form>

      {allTags.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="caps muted">filter</span>
          {allTags.map((tag) => {
            const on = [...tagFilter].some((f) => f.toLowerCase() === tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                className={`tag tag-filter${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleTagFilter(tag)}
              >
                {tag}
              </button>
            );
          })}
          {tagFilter.size > 0 && (
            <>
              <span className="caps muted">
                {visible.length}/{visibleAll.length} flights
              </span>
              <button type="button" className="icon-btn" style={{ width: "auto" }} onClick={() => setTagFilter(new Set())}>
                clear
              </button>
            </>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="card row wrap" style={{ position: "sticky", top: 8, zIndex: 5, boxShadow: "0 4px 0 rgba(30,42,56,0.10)" }}>
          <span className="caps">{selected.size} selected</span>
          <button className="ghost" onClick={bulkPause}>
            {anyActive ? `⏸ Pause (${selRows.filter((t) => !t.paused).length || selected.size})` : `▶ Resume (${selected.size})`}
          </button>
          <button className="ghost" onClick={bulkHide}>
            {selAnyVisible ? `Hide (${selRows.filter((t) => !t.hidden).length || selected.size})` : `Unhide (${selected.size})`}
          </button>
          <button className="chart" onClick={bulkPlan} disabled={planning.size > 0}>
            {planning.size > 0 ? `Planning ${planning.size}…` : `${planLabel} (${selected.size})`}
          </button>
          <span style={{ marginLeft: "auto" }} />
          <button className="ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {todos.length === 0 && (
        <div className="card deep muted">
          No expeditions on the manifest. File one above — just a title.
        </div>
      )}

      {todos.length > 0 && visible.length === 0 && (
        <div className="card deep muted">
          No active flights — all {hiddenList.length} are hidden below.
        </div>
      )}

      {planError && (
        <div className="notam-strip" style={{ color: "var(--notam)" }}>{planError}</div>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="caps muted">Drag a flight into priority order — the top of the manifest flies first</span>
        <span className="caps muted">or focus a grip and use arrow keys</span>
      </div>

      {visible.map(renderCard)}

      {hiddenList.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 4 }}>
            <button
              className="ghost"
              onClick={() => setShowHidden((s) => !s)}
              aria-expanded={showHidden}
            >
              {showHidden ? `▾ Hidden (${hiddenList.length})` : `▸ Hidden (${hiddenList.length})`}
            </button>
            <span className="caps muted">
              {showHidden ? "select one and Unhide to bring it back" : "finished flights — kept, not deleted"}
            </span>
          </div>
          {showHidden && hiddenList.map(renderCard)}
        </>
      )}
    </div>
  );
}
