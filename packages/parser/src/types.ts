import type { BlockNode, InlineNode } from "markdown-parser";

export type MarkdownBlock = BlockNode;
export type MarkdownInline = InlineNode;

export interface StreamParseSnapshot {
  allBlocks: MarkdownBlock[];
  closedBlocks: MarkdownBlock[];
  partialBlocks: MarkdownBlock[];
  sourceLength: number;
}

export interface StreamParseResult extends StreamParseSnapshot {
  emittedBlocks: MarkdownBlock[];
}

export interface BlockDiffEntry<T> {
  index: number;
  previous?: T;
  next?: T;
}

export interface BlockDiffResult<T> {
  dirtyFromBlock: number;
  appendedBlocks: T[];
  modifiedBlocks: BlockDiffEntry<T>[];
  removedCount: number;
}
