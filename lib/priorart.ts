// Prior-art check — does an open-source project already do this?
// Source: GitHub repository search (no auth required, rate-limited).
// The LLM then assesses the top candidates against the planned work.

export interface Repo {
  name: string;
  url: string;
  description: string;
  stars: number;
  language: string | null;
}

export interface PriorArt {
  repo: string;
  url: string;
  stars: number;
  verdict: "use" | "borrow" | "skip";
  note: string;
}

/** Build a GitHub search query from the project title — drop filler words. */
function buildQuery(title: string): string {
  const stop = new Set([
    "the", "a", "an", "for", "and", "or", "of", "to", "in", "on", "with",
    "my", "our", "me", "i", "new", "build", "make", "create", "app", "tool",
  ]);
  const terms = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  return terms.slice(0, 6).join(" ") || title.toLowerCase();
}

export async function searchPriorArt(title: string): Promise<Repo[]> {
  const q = encodeURIComponent(buildQuery(title));
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`,
      { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: { full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null }[];
    };
    return (data.items ?? []).map((r) => ({
      name: r.full_name,
      url: r.html_url,
      description: r.description ?? "",
      stars: r.stargazers_count,
      language: r.language,
    }));
  } catch {
    return [];
  }
}
