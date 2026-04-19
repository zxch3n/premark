import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";

// Import directly from the source module so Node does not pull in the PixiJS
// browser path via the package barrel.
import {
  extractWikilinks,
  normalizeTarget,
  type Wikilink,
} from "../../../packages/wiki-canvas/src/wikilinks.ts";

export interface ScannedNote {
  id: string;
  /** Absolute path on disk. */
  path: string;
  /** Display-friendly relative path from the root. */
  relativePath: string;
  /** Derived title (first H1 if present, else filename stem). */
  title: string;
  /** Raw markdown content. */
  markdown: string;
  /** Raw wikilinks as they appear (deduplicated, order preserved). */
  wikilinks: Wikilink[];
}

export interface ScanOptions {
  /** Glob-like ignored directory names. */
  ignore?: Set<string>;
  /** Maximum file count to prevent runaway scans. */
  maxFiles?: number;
}

const DEFAULT_IGNORES = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".storybook-static",
  "storybook-static",
  ".cache",
  ".vite",
  ".vercel",
]);

export async function scanMarkdown(
  root: string,
  options: ScanOptions = {},
): Promise<ScannedNote[]> {
  const ignore = new Set([...(options.ignore ?? []), ...DEFAULT_IGNORES]);
  const maxFiles = options.maxFiles ?? 2000;
  const absoluteRoot = resolve(root);
  const files: string[] = [];

  async function walk(dir: string) {
    if (files.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith(".") && entry.name !== "." && entry.name !== "..") {
        if (ignore.has(entry.name)) continue;
      }
      if (ignore.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        files.push(full);
      }
    }
  }

  const rootStat = await stat(absoluteRoot);
  if (rootStat.isFile()) {
    if (extname(absoluteRoot).toLowerCase() === ".md") {
      files.push(absoluteRoot);
    }
  } else {
    await walk(absoluteRoot);
  }
  files.sort();

  const notes: ScannedNote[] = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    const relativePath = relative(absoluteRoot, file).split(sep).join("/");
    const id = normalizeTarget(relativePath);
    notes.push({
      id,
      path: file,
      relativePath: relativePath.length > 0 ? relativePath : basename(file),
      title: deriveTitle(markdown, file),
      markdown,
      wikilinks: dedupeLinks(extractWikilinks(markdown)),
    });
  }

  return notes;
}

function deriveTitle(markdown: string, path: string): string {
  const h1 = /^\s*#\s+(.+?)\s*$/m.exec(markdown);
  if (h1 && h1[1].trim().length > 0) {
    return h1[1].trim();
  }
  return basename(path, extname(path));
}

function dedupeLinks(links: Wikilink[]): Wikilink[] {
  const seen = new Set<string>();
  const out: Wikilink[] = [];
  for (const link of links) {
    const key = normalizeTarget(link.target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

/** Resolve each note's links to the ids of notes that actually exist. */
export function resolveEdges(notes: ScannedNote[]): Map<string, string[]> {
  const idByKey = new Map<string, string>();
  for (const note of notes) {
    const stem = normalizeTarget(basename(note.relativePath, extname(note.relativePath)));
    idByKey.set(note.id, note.id);
    if (!idByKey.has(stem)) idByKey.set(stem, note.id);
  }

  const result = new Map<string, string[]>();
  for (const note of notes) {
    const resolved = new Set<string>();
    for (const link of note.wikilinks) {
      const key = normalizeTarget(link.target);
      const matched =
        idByKey.get(key) ??
        idByKey.get(key.split("/").pop() ?? "") ??
        idByKey.get(key.split("/").slice(-1)[0] ?? "");
      if (matched && matched !== note.id) resolved.add(matched);
    }
    result.set(note.id, [...resolved]);
  }
  return result;
}
