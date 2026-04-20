import type { TextChange } from "@pretext-md/parser";

export interface FontTheme {
  sansFamily: string;
  monoFamily: string;
  baseFontSize: number;
  baseLineHeight?: number;
  codeFontSize?: number;
  codeLineHeight?: number;
}

export interface ResolvedFonts {
  body: string;
  bodyBold: string;
  bodyItalic: string;
  bodyBoldItalic: string;
  inlineCode: string;
  code: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  heading5: string;
  heading6: string;
  fontSizes: {
    body: number;
    code: number;
    heading1: number;
    heading2: number;
    heading3: number;
    heading4: number;
    heading5: number;
    heading6: number;
  };
  lineHeights: {
    body: number;
    code: number;
    heading1: number;
    heading2: number;
    heading3: number;
    heading4: number;
    heading5: number;
    heading6: number;
  };
}

export interface SpacingConfig {
  blockGap: number;
  paragraphMarginTop: number;
  paragraphMarginBottom: number;
  headingMarginTop: number;
  headingMarginBottom: number;
  listIndent: number;
  listMarkerGap: number;
  blockquoteIndent: number;
  blockquoteBorderWidth: number;
  codePaddingX: number;
  codePaddingY: number;
  codeBorderRadius: number;
  tableCellPaddingX: number;
  tableCellPaddingY: number;
  tableBorderWidth: number;
  thematicBreakHeight: number;
  imagePlaceholderHeight: number;
}

export interface HighlightToken {
  content: string;
  tokenType: string;
}

export interface PrismHighlighter {
  highlight(code: string, lang: string): string;
  tokenize(code: string, lang: string): HighlightToken[][];
  getThemeCss?(theme?: string): string;
}

export interface StyleConfig {
  fontTheme: FontTheme | "github" | "modern" | "chinese";
  spacing?: Partial<SpacingConfig>;
  fontOverrides?: Partial<ResolvedFonts>;
  highlighter?: PrismHighlighter;
  theme?: string;
  lineBreakMode?: "markdown" | "source";
}

export interface BlockContext {
  quoteDepth: number;
  listDepth: number;
  listMarker?: string;
  ordered?: boolean;
}

export interface DocumentLayout {
  lines: LayoutLine[];
  blocks: BlockLayout[];
  totalHeight: number;
  containerWidth: number;
  version: number;
  update?: LayoutUpdateMetadata;
}

export interface LayoutUpdateMetadata {
  readonly mode: "full" | "incremental";
  readonly dirtyFromBlock: number;
  readonly dirtyToBlock: number;
  readonly oldSuffixStartBlock: number;
  readonly newSuffixStartBlock: number;
  readonly suffixYOffset: number;
  readonly sourceChange: TextChange | null;
}

export interface BlockLayout {
  index: number;
  sourceBlockIndex: number;
  type: BlockType;
  firstLineIndex: number;
  lineCount: number;
  y: number;
  height: number;
  contentBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  meta: BlockMeta;
  context: BlockContext;
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "code_block"
  | "list"
  | "list_item"
  | "blockquote"
  | "table"
  | "thematic_break"
  | "html_block"
  | "image";

export type BlockMeta =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "code_block"; lang: string; highlighted: boolean }
  | { type: "list"; ordered: boolean; start?: number }
  | { type: "list_item"; depth: number; marker: string }
  | { type: "blockquote"; depth: number }
  | {
      type: "table";
      columnCount: number;
      alignments: Array<"left" | "center" | "right" | null>;
    }
  | { type: "thematic_break" }
  | { type: "paragraph" }
  | {
      type: "image";
      src: string;
      alt: string;
      naturalWidth?: number;
      naturalHeight?: number;
    }
  | { type: "html_block" };

export type LayoutLine = TextLine | OpaqueLine;

export interface LineBase {
  index: number;
  blockIndex: number;
  lineIndexInBlock: number;
  y: number;
  height: number;
  width: number;
  x: number;
}

export interface TextLine extends LineBase {
  kind: "text";
  fragments: InlineFragment[];
}

export interface OpaqueLine extends LineBase {
  kind: "opaque";
  content: OpaqueContent;
}

export type OpaqueContent = CodeBlockContent | TableContent | HtmlBlockContent | ImageBlockContent;

export interface CodeBlockContent {
  type: "code_block";
  code: string;
  lang: string;
  tokens?: HighlightToken[][];
  html?: string;
  font: string;
  lineHeight: number;
  sourceLineCount: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface TableContent {
  type: "table";
  header: TableCell[];
  rows: TableCell[][];
  alignments: Array<"left" | "center" | "right" | null>;
  columnWidths: number[];
  rowCount: number;
  rowHeights: number[];
  font: string;
}

export interface HtmlBlockContent {
  type: "html_block";
  html: string;
}

export interface ImageBlockContent {
  type: "image";
  src: string;
  alt: string;
  displayWidth: number;
  displayHeight: number;
}

export interface TableCell {
  fragments: InlineFragment[];
  width: number;
  height?: number;
  lines?: Array<{
    fragments: InlineFragment[];
    height: number;
    width: number;
  }>;
}

export interface InlineFragment {
  text: string;
  x: number;
  width: number;
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
}

export type FragmentType =
  | "text"
  | "strong"
  | "emphasis"
  | "strong_emphasis"
  | "inline_code"
  | "link"
  | "strikethrough";

export type FragmentMeta = { type: "link"; href: string; title?: string } | undefined;

export interface LayoutDelta {
  version: number;
  dirtyFromBlock: number;
  previousTotalHeight: number;
  totalHeight: number;
  heightDelta: number;
  appendedLines: LayoutLine[];
  modifiedLines: Array<{ index: number; line: LayoutLine }>;
  removedLineCount: number;
}

export interface LayoutEngine {
  layout(markdown: string, containerWidth: number): DocumentLayout;
  createStream(containerWidth: number): LayoutStream;
  resize(prevLayout: DocumentLayout, newWidth: number): DocumentLayout;
  updateFontTheme(theme: FontTheme): void;
  dispose(): void;
}

export interface LayoutStream {
  push(chunk: string): LayoutDelta;
  finish(): LayoutDelta;
  getLayout(): DocumentLayout;
  resize(newWidth: number): DocumentLayout;
}
