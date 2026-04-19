export interface Wikilink {
  target: string;
  alias?: string;
}

const PATTERN = /\[\[([^\]\n]+?)\]\]/g;

export function extractWikilinks(markdown: string): Wikilink[] {
  const out: Wikilink[] = [];
  for (const match of markdown.matchAll(PATTERN)) {
    const raw = match[1].trim();
    if (raw.length === 0) continue;
    const [target, alias] = raw.split("|").map((piece) => piece.trim());
    out.push({ target, alias: alias && alias.length > 0 ? alias : undefined });
  }
  return out;
}

export function normalizeTarget(target: string): string {
  return target.replace(/#.*$/, "").replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLowerCase();
}
