// Shared text-similarity helpers (NOTAM identity + coverage matching).

const STOP = new Set(["what", "is", "are", "the", "a", "an", "of", "to", "in", "does", "do", "how", "which", "there", "any"]);

export function textTokens(q: string): Set<string> {
  return new Set(
    q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Overlap coefficient: shared tokens / smallest token set. 1.0 = same. */
export function similarity(a: string, b: string): number {
  const ta = textTokens(a);
  const tb = textTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
