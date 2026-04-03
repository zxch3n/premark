import { MarkdownParser } from "markdown-parser";

export { diffBlocks } from "./block-differ.ts";
export { StreamParser } from "./stream-parser.ts";
export type * from "./types.ts";

import type { MarkdownBlock } from "./types.ts";

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const parser = new MarkdownParser();
  return parser.parse(markdown);
}
