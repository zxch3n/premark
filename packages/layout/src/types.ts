// ─── Document Level ───

export interface DocumentLayout {
  /** All lines flattened, sorted by y. Virtual-scroll binary-search friendly. */
  lines: LayoutLine[]
  /** Block-level summaries (grouped view of lines) */
  blocks: BlockLayout[]
  /** Total document height in px */
  totalHeight: number
  /** Container width used for layout */
  containerWidth: number
  /** Version number, increments on each append/resize */
  version: number
}

// ─── Block Level ───

export interface BlockLayout {
  index: number
  type: BlockType
  firstLineIndex: number
  lineCount: number
  y: number
  height: number
  contentBox: { x: number; y: number; width: number; height: number }
  meta: BlockMeta
}

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'code_block'
  | 'list'
  | 'list_item'
  | 'blockquote'
  | 'table'
  | 'thematic_break'
  | 'html_block'
  | 'image'

export type BlockMeta =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'code_block'; lang: string; highlighted: boolean }
  | { type: 'list'; ordered: boolean; start?: number }
  | { type: 'list_item'; depth: number; marker: string }
  | { type: 'blockquote'; depth: number }
  | {
      type: 'table'
      columnCount: number
      alignments: ('left' | 'center' | 'right' | null)[]
    }
  | { type: 'thematic_break' }
  | { type: 'paragraph' }
  | { type: 'image'; src: string; alt: string; naturalWidth?: number; naturalHeight?: number }
  | { type: 'html_block' }

// ─── Line Level ───

export type LayoutLine = TextLine | OpaqueLine

export interface LineBase {
  /** Global line index */
  index: number
  /** Owning block index */
  blockIndex: number
  /** Line index within the block (OpaqueLine is always 0) */
  lineIndexInBlock: number
  /** Absolute Y position */
  y: number
  /** Line height */
  height: number
  /** Content width */
  width: number
  /** Left offset (indent) */
  x: number
}

/** Normal text line: heading / paragraph / list-item / blockquote */
export interface TextLine extends LineBase {
  kind: 'text'
  fragments: InlineFragment[]
}

/**
 * Opaque line: code blocks and tables occupy one position in lines[].
 * Height is precisely computed by Pretext. Internal structure is for the renderer.
 */
export interface OpaqueLine extends LineBase {
  kind: 'opaque'
  content: OpaqueContent
}

// ─── Opaque Content ───

export type OpaqueContent = CodeBlockContent | TableContent

export interface CodeBlockContent {
  type: 'code_block'
  code: string
  lang: string
  tokens?: { content: string; tokenType: string }[][]
  html?: string
  font: string
  lineHeight: number
  sourceLineCount: number
  padding: { top: number; right: number; bottom: number; left: number }
}

export interface TableContent {
  type: 'table'
  header: TableCell[]
  rows: TableCell[][]
  alignments: ('left' | 'center' | 'right' | null)[]
  columnWidths: number[]
  rowCount: number
  rowHeights: number[]
  font: string
}

export interface TableCell {
  fragments: InlineFragment[]
  width: number
}

// ─── Inline Fragment ───

export interface InlineFragment {
  text: string
  x: number
  width: number
  font: string
  type: FragmentType
  meta?: FragmentMeta
}

export type FragmentType =
  | 'text'
  | 'strong'
  | 'emphasis'
  | 'strong_emphasis'
  | 'inline_code'
  | 'link'
  | 'strikethrough'

export type FragmentMeta =
  | { type: 'link'; href: string; title?: string }
  | undefined

// ─── Layout Delta (for streaming) ───

export interface LayoutDelta {
  version: number
  dirtyFromBlock: number
  previousTotalHeight: number
  totalHeight: number
  heightDelta: number
  appendedLines: LayoutLine[]
  modifiedLines: { index: number; line: LayoutLine }[]
  removedLineCount: number
}

// ─── Highlighter Interface ───

export interface Highlighter {
  highlight(code: string, lang: string): string | undefined
  tokenize(code: string, lang: string): { content: string; tokenType: string }[][] | undefined
  loadLanguage(lang: string): void
}
