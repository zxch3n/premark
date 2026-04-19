import type { DocumentLayout, StyleConfig } from "@pretext-md/layout";
import type {
  BlockDirtyRange,
  IncrementalParseState,
  MarkdownBlockRecord,
  MarkdownInlineSourceRecord,
  SourceRange,
} from "@pretext-md/parser";

export interface WorkspaceEngineOptions {
  readonly containerWidth: number;
  readonly layoutStyle?: StyleConfig;
  readonly snippetContextBlocks?: number;
}

export interface WorkspaceDocumentInput {
  readonly id: string;
  readonly markdown: string;
  readonly title?: string;
}

export interface WorkspaceDocument {
  readonly id: string;
  readonly title?: string;
  readonly markdown: string;
  readonly version: number;
  readonly parseState: IncrementalParseState;
  readonly records: readonly MarkdownBlockRecord[];
  readonly inlineSources: readonly MarkdownInlineSourceRecord[];
  readonly layout: DocumentLayout;
}

export interface WorkspaceDocumentDelta {
  readonly docId: string;
  readonly version: number;
  readonly blockDirtyRanges: readonly BlockDirtyRange[];
  readonly removedCount: number;
}

export interface WorkspaceStreamAppend {
  readonly docId: string;
  readonly targetBlockId: string;
  readonly chunk: string;
}

export interface WorkspaceStreamFlushResult {
  readonly deltas: readonly WorkspaceDocumentDelta[];
  readonly appendedCount: number;
}

export interface WorkspaceTextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface WorkspaceDocumentOperation {
  readonly docId: string;
  readonly origin: "local" | "remote";
  readonly changes: readonly WorkspaceTextChange[];
  readonly actorId?: string;
}

export interface WorkspaceOperationResult {
  readonly delta: WorkspaceDocumentDelta;
  readonly touchedActiveRange: boolean;
}

export interface WorkspaceSourceRange {
  readonly from: number;
  readonly to: number;
}

export interface WorkspaceMappedCursor {
  readonly docId: string;
  readonly actorId: string;
  readonly anchor: number;
  readonly head: number;
  readonly rects: readonly Rect[];
  readonly blockIds: readonly string[];
}

export type ActiveOverlayRemoteEditPolicy = "apply-outside-active-range-conflict-inside";

export type WorkspaceTaskPriority =
  | "active-input"
  | "visible-dirty-tiles"
  | "ai-stream"
  | "search-index"
  | "offscreen-layout";

export interface WorkspaceScheduledTask<T = void> {
  readonly priority: WorkspaceTaskPriority;
  readonly run: () => T;
}

export type SearchMatchType = "rendered-text" | "heading" | "link";

export interface WorkspaceSearchOptions {
  readonly limit?: number;
  readonly contextBlocks?: number;
}

export interface WorkspaceSearchResult {
  readonly docId: string;
  readonly blockId: string;
  readonly blockIndex: number;
  readonly sourceRange: SourceRange;
  readonly matchType: SearchMatchType;
  readonly matchText: string;
  readonly renderedText: string;
  readonly headingPath: readonly string[];
  readonly snippetBlockIds: readonly string[];
}

export interface RenderedSnippet {
  readonly id: string;
  readonly docId: string;
  readonly blockIds: readonly string[];
  readonly markdown: string;
  readonly records: readonly MarkdownBlockRecord[];
  readonly layout: DocumentLayout;
  readonly previewKey: string;
}

export type CanvasTileType = "document" | "snippet";
export type CanvasRenderMode = "skeleton" | "cached-preview" | "high-detail";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasTile {
  readonly id: string;
  readonly type: CanvasTileType;
  readonly docId: string;
  readonly blockIds: readonly string[];
  readonly rect: Rect;
  readonly renderMode: CanvasRenderMode;
  readonly previewKey: string;
}

export interface TileLayoutOptions {
  readonly width?: number;
  readonly gap?: number;
  readonly columns?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly zoom?: number;
  readonly maxTiles?: number;
}

export interface WorkspaceBenchmarkResult {
  readonly documentCount: number;
  readonly query: string;
  readonly resultCount: number;
  readonly renderedSnippetCount: number;
  readonly tileCount: number;
  readonly visibleTileCount: number;
  readonly searchMs: number;
  readonly renderMs: number;
  readonly cullMs: number;
}

export interface WorkspaceConcurrentBenchmarkResult extends WorkspaceBenchmarkResult {
  readonly editMs: number;
  readonly streamMs: number;
  readonly queuedStreamCount: number;
}
