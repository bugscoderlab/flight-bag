// Attachment helpers — decide which uploads are text-like, extract their
// text for the planner, format sizes, and store the bytes on disk.
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Extensions we treat as plain text and feed to the planner. */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml",
  "log", "xml", "html", "htm", "css", "scss", "js", "jsx", "ts", "tsx",
  "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs",
  "sh", "bash", "zsh", "sql", "toml", "ini", "env", "conf", "properties",
]);

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-yaml",
  "application/yaml",
]);

/** Cap the extracted text so one big file can't blow up the LLM context. */
const MAX_TEXT_CHARS = 12000;

export function isTextLike(filename: string, mimeType: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  return TEXT_MIME_EXACT.has(mimeType);
}

/** Extract UTF-8 text from a text-like file; null for binary files. */
export async function extractText(file: File): Promise<string | null> {
  if (!isTextLike(file.name, file.type)) return null;
  const raw = Buffer.from(await file.arrayBuffer()).toString("utf8");
  return raw.slice(0, MAX_TEXT_CHARS);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── On-disk storage ──────────────────────────────────────────────────
// Attachment bytes live outside the DB, under data/attachments/<id>.
// The Attachment row keeps the metadata and a path pointing at the file.

const STORE_DIR = path.join(process.cwd(), "data", "attachments");

/** Absolute path for a stored relative path like "data/attachments/<id>". */
export function attachmentFilePath(relPath: string): string {
  return path.join(process.cwd(), relPath);
}

/** Write bytes to disk and return the path to store in the DB. */
export async function saveAttachmentFile(id: string, bytes: Uint8Array): Promise<string> {
  await mkdir(STORE_DIR, { recursive: true });
  const abs = path.join(STORE_DIR, id);
  await writeFile(abs, bytes);
  return path.relative(process.cwd(), abs);
}

/** Best-effort removal of the backing file (DB row is the source of truth). */
export async function deleteAttachmentFile(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  try {
    await unlink(attachmentFilePath(relPath));
  } catch {
    /* already gone — nothing to do */
  }
}

export async function readAttachmentFile(relPath: string): Promise<Buffer> {
  return readFile(attachmentFilePath(relPath));
}
