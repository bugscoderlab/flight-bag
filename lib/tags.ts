// Tag helpers — tags live on Todo.tags as a JSON string[] (project /
// subproject categories on the manifest). Normalization trims, drops
// empties, and dedupes case-insensitively while keeping first-seen casing.

export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function normalizeTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Inline tags: "#backend" / "#client-acme" inside the title input become tags.
// A tag starts at # and runs through letters, digits, - _ . / — it stops at
// whitespace or other punctuation; a trailing ".", ",", ";" etc. is sentence
// punctuation, not part of the tag ("ship #backend." → tag "backend").
const INLINE_TAG = /#([\p{L}\p{N}][\p{L}\p{N}_\-./]*)/gu;

export function parseInlineTags(text: string): { title: string; tags: string[] } {
  const raw = [...text.matchAll(INLINE_TAG)].map((m) => m[1].replace(/[.,;/\-]+$/u, ""));
  const tags = normalizeTags(raw);
  const title = text
    .replace(INLINE_TAG, " ")
    .replace(/\s+([,.;:!?])/gu, "$1") // punctuation orphaned by tag removal
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags };
}

// Fuzzy tag suggestions for the "#" autocomplete: substring matches rank
// first (earlier occurrence + shorter tag wins), then subsequence matches
// ("bkd" finds "backend"). Empty query matches everything (discovery).
export function fuzzyTags(query: string, tags: string[], limit = 6): string[] {
  const q = query.toLowerCase();
  const scored: [number, string][] = [];
  for (const tag of tags) {
    const t = tag.toLowerCase();
    let s: number;
    if (!q) s = 0;
    else if (t.includes(q)) s = 100 - t.indexOf(q) - t.length / 100;
    else {
      let i = 0;
      for (const ch of t) if (i < q.length && ch === q[i]) i++;
      s = i === q.length ? 10 - t.length / 100 : -1;
    }
    if (s >= 0) scored.push([s, tag]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]))
    .slice(0, limit)
    .map((x) => x[1]);
}
