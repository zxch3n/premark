import type { BlockSpan, MarkdownBlock } from "./types.ts";

export function freezeBlockSpans(blockSpans: BlockSpan[]): readonly BlockSpan[] {
  return blockSpans;
}

export function freezeMarkdownBlocks(blocks: MarkdownBlock[]): readonly MarkdownBlock[] {
  return blocks;
}

export function freezeMarkdownBlockArray(
  blocks: readonly MarkdownBlock[],
): readonly MarkdownBlock[] {
  return blocks;
}
