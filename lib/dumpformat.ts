// Dump formatting — all entries merge into ONE combined dump text for
// LLM calls (blank-line separated). Ignored dumps (and ignored attachments)
// are skipped so the planner only sees what the user wants it to.

export interface DumpAttachmentEntry {
  filename: string;
  text?: string | null;
  ignored?: boolean;
}

export interface DumpEntry {
  content: string;
  createdAt?: Date | string;
  ignored?: boolean;
  attachments?: DumpAttachmentEntry[];
}

/** One dump as the planner sees it: its text, then each non-ignored
 *  attachment's extracted text under a filename marker. */
function formatDump(d: DumpEntry): string {
  const parts: string[] = [];
  const content = d.content.trim();
  if (content) parts.push(content);
  for (const a of d.attachments ?? []) {
    if (a.ignored || !a.text?.trim()) continue;
    parts.push(`[Attached file: ${a.filename}]\n${a.text.trim()}`);
  }
  return parts.join("\n\n");
}

export function formatDumps(dumps: DumpEntry[]): string {
  return dumps
    .filter((d) => !d.ignored)
    .map(formatDump)
    .filter(Boolean)
    .join("\n\n");
}
