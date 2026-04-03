import type { Tree, TreeFragment } from "@lezer/common";

export type MarkdownBlock =
  | HeadingNode
  | ParagraphNode
  | CodeBlockNode
  | ListNode
  | BlockquoteNode
  | TableNode
  | HtmlBlockNode
  | ThematicBreakNode;

export type MarkdownInline =
  | TextNode
  | SoftBreakNode
  | HardBreakNode
  | StrongNode
  | EmphasisNode
  | StrikethroughNode
  | CodeSpanNode
  | LinkNode
  | ImageNode
  | HtmlNode;

export interface HeadingNode {
  readonly type: "heading";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly MarkdownInline[];
}

export interface ParagraphNode {
  readonly type: "paragraph";
  readonly children: readonly MarkdownInline[];
}

export interface CodeBlockNode {
  readonly type: "code-block";
  readonly content: string;
  readonly info?: string;
}

export interface ListNode {
  readonly type: "list";
  readonly kind: "ordered" | "unordered";
  readonly start: number;
  readonly marker: string;
  readonly items: readonly ListItemNode[];
}

export interface ListItemNode {
  readonly type: "list-item";
  readonly checked?: boolean;
  readonly children: readonly MarkdownBlock[];
}

export interface BlockquoteNode {
  readonly type: "blockquote";
  readonly children: readonly MarkdownBlock[];
}

export interface TableNode {
  readonly type: "table";
  readonly head: {
    readonly cells: readonly TableCellNode[];
  };
  readonly body: {
    readonly rows: readonly TableRowNode[];
  };
}

export interface TableRowNode {
  readonly cells: readonly TableCellNode[];
}

export interface TableCellNode {
  readonly align: "left" | "center" | "right" | null;
  readonly children: readonly MarkdownInline[];
}

export interface HtmlBlockNode {
  readonly type: "html-block";
  readonly content: string;
}

export interface ThematicBreakNode {
  readonly type: "thematic-break";
}

export interface TextNode {
  readonly type: "text";
  readonly text: string;
}

export interface SoftBreakNode {
  readonly type: "softbreak";
}

export interface HardBreakNode {
  readonly type: "hardbreak";
}

export interface StrongNode {
  readonly type: "strong";
  readonly children: readonly MarkdownInline[];
}

export interface EmphasisNode {
  readonly type: "emphasis";
  readonly children: readonly MarkdownInline[];
}

export interface StrikethroughNode {
  readonly type: "strikethrough";
  readonly children: readonly MarkdownInline[];
}

export interface CodeSpanNode {
  readonly type: "code-span";
  readonly text: string;
}

export interface LinkNode {
  readonly type: "link";
  readonly href: string;
  readonly title?: string;
  readonly children: readonly MarkdownInline[];
}

export interface ImageNode {
  readonly type: "image";
  readonly href: string;
  readonly title?: string;
  readonly children: readonly MarkdownInline[];
}

export interface HtmlNode {
  readonly type: "html";
  readonly content: string;
}

export interface BlockSpan {
  readonly from: number;
  readonly to: number;
  readonly type: string;
  readonly signature: number;
}

export interface TextChange {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
  readonly changedChars: number;
  readonly changedRatio: number;
  readonly changedLines: number;
}

export interface IncrementalParseState {
  readonly text: string;
  readonly tree: Tree;
  readonly fragments: readonly TreeFragment[];
  readonly blocks: readonly MarkdownBlock[];
  readonly blockSpans: readonly BlockSpan[];
  readonly closedBlocks: readonly MarkdownBlock[];
  readonly partialBlocks: readonly MarkdownBlock[];
  readonly sourceLength: number;
  readonly version: number;
}

export interface IncrementalParseOptions {
  maxChangedChars?: number;
  maxChangedRatio?: number;
  maxChangedLines?: number;
}

export interface IncrementalParseResult extends StreamParseSnapshot {
  readonly state: IncrementalParseState;
  readonly mode: "full" | "incremental";
  readonly change: TextChange | null;
  readonly dirtyFromBlock: number;
  readonly dirtyToBlock: number;
  readonly reusedPrefixCount: number;
  readonly reusedSuffixCount: number;
  readonly removedCount: number;
}

export interface StreamParseSnapshot {
  readonly allBlocks: readonly MarkdownBlock[];
  readonly closedBlocks: readonly MarkdownBlock[];
  readonly partialBlocks: readonly MarkdownBlock[];
  readonly sourceLength: number;
}

export interface StreamParseResult extends StreamParseSnapshot {
  readonly emittedBlocks: readonly MarkdownBlock[];
}

export interface BlockDiffEntry<T> {
  readonly index: number;
  readonly previous?: T;
  readonly next?: T;
}

export interface BlockDiffResult<T> {
  readonly dirtyFromBlock: number;
  readonly appendedBlocks: readonly T[];
  readonly modifiedBlocks: readonly BlockDiffEntry<T>[];
  readonly removedCount: number;
}
