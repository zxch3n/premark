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
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: MarkdownInline[];
}

export interface ParagraphNode {
  type: "paragraph";
  children: MarkdownInline[];
}

export interface CodeBlockNode {
  type: "code-block";
  content: string;
  info?: string;
}

export interface ListNode {
  type: "list";
  kind: "ordered" | "unordered";
  start: number;
  marker: string;
  items: ListItemNode[];
}

export interface ListItemNode {
  type: "list-item";
  checked?: boolean;
  children: MarkdownBlock[];
}

export interface BlockquoteNode {
  type: "blockquote";
  children: MarkdownBlock[];
}

export interface TableNode {
  type: "table";
  head: {
    cells: TableCellNode[];
  };
  body: {
    rows: TableRowNode[];
  };
}

export interface TableRowNode {
  cells: TableCellNode[];
}

export interface TableCellNode {
  align: "left" | "center" | "right" | null;
  children: MarkdownInline[];
}

export interface HtmlBlockNode {
  type: "html-block";
  content: string;
}

export interface ThematicBreakNode {
  type: "thematic-break";
}

export interface TextNode {
  type: "text";
  text: string;
}

export interface SoftBreakNode {
  type: "softbreak";
}

export interface HardBreakNode {
  type: "hardbreak";
}

export interface StrongNode {
  type: "strong";
  children: MarkdownInline[];
}

export interface EmphasisNode {
  type: "emphasis";
  children: MarkdownInline[];
}

export interface StrikethroughNode {
  type: "strikethrough";
  children: MarkdownInline[];
}

export interface CodeSpanNode {
  type: "code-span";
  text: string;
}

export interface LinkNode {
  type: "link";
  href: string;
  title?: string;
  children: MarkdownInline[];
}

export interface ImageNode {
  type: "image";
  href: string;
  title?: string;
  children: MarkdownInline[];
}

export interface HtmlNode {
  type: "html";
  content: string;
}

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
