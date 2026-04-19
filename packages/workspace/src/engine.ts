import { createLayoutEngine, type LayoutEngine, type StyleConfig } from "@pretext-md/layout";
import {
  createIncrementalParseState,
  createMarkdownBlockRecords,
  createMarkdownInlineSourceMap,
  incrementalParse,
  type IncrementalParseResult,
  type MarkdownBlockRecord,
} from "@pretext-md/parser";

import type {
  CanvasRenderMode,
  CanvasTile,
  Rect,
  RenderedSnippet,
  SearchMatchType,
  TileLayoutOptions,
  WorkspaceBenchmarkResult,
  WorkspaceConcurrentBenchmarkResult,
  WorkspaceDocument,
  WorkspaceDocumentDelta,
  WorkspaceDocumentInput,
  WorkspaceDocumentOperation,
  WorkspaceEngineOptions,
  WorkspaceMappedCursor,
  WorkspaceOperationResult,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
  WorkspaceSourceRange,
  WorkspaceStreamAppend,
  WorkspaceStreamFlushResult,
  WorkspaceTextChange,
} from "./types.ts";

interface InternalDocument extends WorkspaceDocument {
  readonly layoutEngine: LayoutEngine;
}

interface SearchIndexEntry {
  readonly docId: string;
  readonly blockId: string;
  readonly blockIndex: number;
  readonly haystack: string;
  readonly renderedHaystack: string;
  readonly linkHaystack: string;
}

const defaultLayoutStyle: StyleConfig = {
  fontTheme: "github",
};

export const activeOverlayRemoteEditPolicy = "apply-outside-active-range-conflict-inside" as const;

export function createWorkspaceEngine(options: WorkspaceEngineOptions): WorkspaceEngine {
  return new WorkspaceEngine(options);
}

export class WorkspaceEngine {
  private readonly documents = new Map<string, InternalDocument>();

  private readonly searchIndex: SearchIndexEntry[] = [];

  private readonly snippetCache = new Map<string, RenderedSnippet>();

  private readonly streamAppendQueue: WorkspaceStreamAppend[] = [];

  private containerWidth: number;

  private readonly layoutStyle: StyleConfig;

  private readonly snippetContextBlocks: number;

  constructor(options: WorkspaceEngineOptions) {
    this.containerWidth = options.containerWidth;
    this.layoutStyle = options.layoutStyle ?? defaultLayoutStyle;
    this.snippetContextBlocks = options.snippetContextBlocks ?? 1;
  }

  loadDocuments(inputs: readonly WorkspaceDocumentInput[]): WorkspaceDocumentDelta[] {
    this.documents.clear();
    this.searchIndex.length = 0;
    this.snippetCache.clear();
    return inputs.map((input) => this.upsertDocument(input));
  }

  upsertDocument(input: WorkspaceDocumentInput): WorkspaceDocumentDelta {
    const previous = this.documents.get(input.id);
    const layoutEngine = previous?.layoutEngine ?? createLayoutEngine(this.layoutStyle);
    const parseResult =
      previous === undefined
        ? createInitialParseResult(input.markdown)
        : incrementalParse(previous.parseState, input.markdown);
    const layout = layoutEngine.layout(input.markdown, this.containerWidth);
    const records = createMarkdownBlockRecords(parseResult.state);
    const inlineSources = createMarkdownInlineSourceMap(parseResult.state);
    const document: InternalDocument = {
      id: input.id,
      title: input.title,
      markdown: input.markdown,
      version: parseResult.state.version,
      parseState: parseResult.state,
      records,
      inlineSources,
      layout,
      layoutEngine,
    };

    this.documents.set(input.id, document);
    this.rebuildDocumentIndex(document);
    this.clearDocumentSnippetCache(input.id);

    return {
      docId: input.id,
      version: document.version,
      blockDirtyRanges: parseResult.blockDirtyRanges,
      removedCount: parseResult.removedCount,
    };
  }

  removeDocument(docId: string): boolean {
    const removed = this.documents.delete(docId);
    if (!removed) {
      return false;
    }
    this.removeDocumentIndex(docId);
    this.clearDocumentSnippetCache(docId);
    return true;
  }

  appendToBlock(docId: string, targetBlockId: string, chunk: string): WorkspaceDocumentDelta {
    if (chunk.length === 0) {
      const document = this.requireDocument(docId);
      return {
        docId,
        version: document.version,
        blockDirtyRanges: [],
        removedCount: 0,
      };
    }

    const document = this.requireDocument(docId);
    const record = document.records.find((candidate) => candidate.id === targetBlockId);
    if (record === undefined) {
      throw new Error(`Unknown block ${targetBlockId} in document ${docId}`);
    }

    const insertAt = resolveAppendOffset(document.markdown, record);
    const markdown = `${document.markdown.slice(0, insertAt)}${chunk}${document.markdown.slice(insertAt)}`;
    return this.upsertDocument({
      id: docId,
      title: document.title,
      markdown,
    });
  }

  queueStreamAppend(append: WorkspaceStreamAppend): void {
    if (append.chunk.length === 0) {
      return;
    }
    this.streamAppendQueue.push(append);
  }

  flushStreamAppends(): WorkspaceStreamFlushResult {
    const queue = this.streamAppendQueue.splice(0);
    const merged = new Map<string, WorkspaceStreamAppend>();
    for (const append of queue) {
      const key = `${append.docId}\u0000${append.targetBlockId}`;
      const previous = merged.get(key);
      merged.set(key, {
        docId: append.docId,
        targetBlockId: append.targetBlockId,
        chunk: `${previous?.chunk ?? ""}${append.chunk}`,
      });
    }

    const deltas: WorkspaceDocumentDelta[] = [];
    for (const append of merged.values()) {
      deltas.push(this.appendToBlock(append.docId, append.targetBlockId, append.chunk));
    }
    return {
      deltas,
      appendedCount: queue.length,
    };
  }

  applyDocumentOperation(
    operation: WorkspaceDocumentOperation,
    activeRange?: WorkspaceSourceRange,
  ): WorkspaceOperationResult {
    const document = this.requireDocument(operation.docId);
    const markdown = applyTextChanges(document.markdown, operation.changes);
    const delta = this.upsertDocument({
      id: operation.docId,
      title: document.title,
      markdown,
    });
    return {
      delta,
      touchedActiveRange:
        activeRange === undefined ? false : changesTouchRange(operation.changes, activeRange),
    };
  }

  mapSourceOffsetToCanvasRect(
    docId: string,
    offset: number,
  ): {
    readonly blockId: string;
    readonly rect: Rect;
  } | null {
    const document = this.requireDocument(docId);
    const blockIndex = document.records.findIndex(
      (record) => offset >= record.source.from && offset <= record.source.to,
    );
    const record = document.records[blockIndex];
    const block = document.layout.blocks[blockIndex];
    if (record === undefined || block === undefined) {
      return null;
    }

    return {
      blockId: record.id,
      rect: {
        x: block.contentBox.x,
        y: block.y,
        width: block.contentBox.width,
        height: block.height,
      },
    };
  }

  mapRemoteCursor(input: {
    readonly docId: string;
    readonly actorId: string;
    readonly anchor: number;
    readonly head: number;
  }): WorkspaceMappedCursor {
    const from = Math.min(input.anchor, input.head);
    const to = Math.max(input.anchor, input.head);
    const document = this.requireDocument(input.docId);
    const rects: Rect[] = [];
    const blockIds: string[] = [];

    for (let index = 0; index < document.records.length; index += 1) {
      const record = document.records[index]!;
      if (record.source.to < from || record.source.from > to) {
        continue;
      }
      const block = document.layout.blocks[index];
      if (block === undefined) {
        continue;
      }
      blockIds.push(record.id);
      rects.push({
        x: block.contentBox.x,
        y: block.y,
        width: block.contentBox.width,
        height: block.height,
      });
    }

    return {
      docId: input.docId,
      actorId: input.actorId,
      anchor: input.anchor,
      head: input.head,
      rects,
      blockIds,
    };
  }

  getDocument(docId: string): WorkspaceDocument | null {
    return this.documents.get(docId) ?? null;
  }

  listDocuments(): WorkspaceDocument[] {
    return [...this.documents.values()];
  }

  resize(containerWidth: number): void {
    if (containerWidth === this.containerWidth) {
      return;
    }

    this.containerWidth = containerWidth;
    for (const document of this.documents.values()) {
      const layout = document.layoutEngine.resize(document.layout, containerWidth);
      this.documents.set(document.id, {
        ...document,
        layout,
      });
      this.clearDocumentSnippetCache(document.id);
    }
  }

  search(query: string, options: WorkspaceSearchOptions = {}): WorkspaceSearchResult[] {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length === 0) {
      return [];
    }

    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const results: WorkspaceSearchResult[] = [];

    for (const entry of this.searchIndex) {
      if (!entry.haystack.includes(normalizedQuery)) {
        continue;
      }

      const document = this.documents.get(entry.docId);
      const record = document?.records[entry.blockIndex];
      if (document === undefined || record === undefined) {
        continue;
      }

      const matchType = resolveMatchType(entry, normalizedQuery, record);
      results.push({
        docId: document.id,
        blockId: record.id,
        blockIndex: record.index,
        sourceRange: record.source,
        matchType,
        matchText: query,
        renderedText: record.renderedText,
        headingPath: record.headingPath.map((heading) => heading.text),
        snippetBlockIds: this.selectSnippetBlockIds(
          document,
          record.index,
          options.contextBlocks ?? this.snippetContextBlocks,
        ),
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  renderSearchResultSnippet(
    result: WorkspaceSearchResult,
    options: { readonly width?: number } = {},
  ): RenderedSnippet {
    const document = this.requireDocument(result.docId);
    const width = options.width ?? this.containerWidth;
    const cacheKey = `${document.id}:${document.version}:${width}:${result.snippetBlockIds.join(",")}`;
    const cached = this.snippetCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const records = result.snippetBlockIds.map((blockId) => {
      const record = document.records.find((candidate) => candidate.id === blockId);
      if (record === undefined) {
        throw new Error(`Missing snippet block ${blockId} in document ${document.id}`);
      }
      return record;
    });
    const markdown = records
      .map((record) => document.markdown.slice(record.source.from, record.source.to))
      .join("\n\n");
    const layout = createLayoutEngine(this.layoutStyle).layout(markdown, width);
    const snippet: RenderedSnippet = {
      id: `snippet:${document.id}:${result.blockId}`,
      docId: document.id,
      blockIds: result.snippetBlockIds,
      markdown,
      records,
      layout,
      previewKey: cacheKey,
    };

    this.snippetCache.set(cacheKey, snippet);
    return snippet;
  }

  createDocumentTiles(options: TileLayoutOptions = {}): CanvasTile[] {
    const tileWidth = options.width ?? this.containerWidth;
    const gap = options.gap ?? 24;
    const columns = Math.max(1, options.columns ?? 1);
    const originX = options.originX ?? 0;
    const originY = options.originY ?? 0;
    const zoom = options.zoom ?? 1;
    const maxTiles = options.maxTiles ?? Number.POSITIVE_INFINITY;
    const mode = resolveRenderModeForZoom(zoom);

    return layoutTiles(
      [...this.documents.values()].slice(0, maxTiles).map((document) => ({
        id: `doc:${document.id}`,
        type: "document",
        docId: document.id,
        blockIds: document.records.map((record) => record.id),
        height: document.layout.totalHeight,
        previewKey: `doc:${document.id}:${document.version}:${tileWidth}`,
      })),
      {
        tileWidth,
        gap,
        columns,
        originX,
        originY,
        mode,
      },
    );
  }

  createSnippetTiles(
    results: readonly WorkspaceSearchResult[],
    options: TileLayoutOptions = {},
  ): CanvasTile[] {
    const tileWidth = options.width ?? this.containerWidth;
    const gap = options.gap ?? 24;
    const columns = Math.max(1, options.columns ?? 1);
    const originX = options.originX ?? 0;
    const originY = options.originY ?? 0;
    const zoom = options.zoom ?? 1;
    const maxTiles = options.maxTiles ?? Number.POSITIVE_INFINITY;
    const mode = resolveRenderModeForZoom(zoom);

    return layoutTiles(
      results.slice(0, maxTiles).map((result) => {
        const snippet = this.renderSearchResultSnippet(result, { width: tileWidth });
        return {
          id: snippet.id,
          type: "snippet",
          docId: snippet.docId,
          blockIds: snippet.blockIds,
          height: snippet.layout.totalHeight,
          previewKey: snippet.previewKey,
        };
      }),
      {
        tileWidth,
        gap,
        columns,
        originX,
        originY,
        mode,
      },
    );
  }

  cullTiles(tiles: readonly CanvasTile[], viewport: Rect): CanvasTile[] {
    return tiles.filter((tile) => intersects(tile.rect, viewport));
  }

  benchmarkSearchAndRender(options: {
    readonly query: string;
    readonly limit: number;
    readonly tileWidth?: number;
    readonly viewport?: Rect;
  }): WorkspaceBenchmarkResult {
    const searchStart = performance.now();
    const results = this.search(options.query, { limit: options.limit });
    const searchMs = performance.now() - searchStart;

    const renderStart = performance.now();
    const tiles = this.createSnippetTiles(results, {
      width: options.tileWidth,
      columns: 4,
      zoom: 0.8,
      maxTiles: options.limit,
    });
    const renderMs = performance.now() - renderStart;

    const cullStart = performance.now();
    const visibleTiles = this.cullTiles(
      tiles,
      options.viewport ?? {
        x: 0,
        y: 0,
        width: 1600,
        height: 1000,
      },
    );
    const cullMs = performance.now() - cullStart;

    return {
      documentCount: this.documents.size,
      query: options.query,
      resultCount: results.length,
      renderedSnippetCount: Math.min(results.length, options.limit),
      tileCount: tiles.length,
      visibleTileCount: visibleTiles.length,
      searchMs,
      renderMs,
      cullMs,
    };
  }

  benchmarkConcurrentUpdates(options: {
    readonly query: string;
    readonly streamDocId: string;
    readonly streamBlockId: string;
    readonly streamChunks: readonly string[];
    readonly editDocId: string;
    readonly edit: (markdown: string) => string;
    readonly limit: number;
    readonly tileWidth?: number;
    readonly viewport?: Rect;
  }): WorkspaceConcurrentBenchmarkResult {
    const editDocument = this.requireDocument(options.editDocId);
    const editStart = performance.now();
    this.upsertDocument({
      id: editDocument.id,
      title: editDocument.title,
      markdown: options.edit(editDocument.markdown),
    });
    const editMs = performance.now() - editStart;

    for (const chunk of options.streamChunks) {
      this.queueStreamAppend({
        docId: options.streamDocId,
        targetBlockId: options.streamBlockId,
        chunk,
      });
    }

    const streamStart = performance.now();
    const streamResult = this.flushStreamAppends();
    const streamMs = performance.now() - streamStart;
    const base = this.benchmarkSearchAndRender(options);

    return {
      ...base,
      editMs,
      streamMs,
      queuedStreamCount: streamResult.appendedCount,
    };
  }

  private selectSnippetBlockIds(
    document: WorkspaceDocument,
    blockIndex: number,
    contextBlocks: number,
  ): string[] {
    const from = Math.max(0, blockIndex - contextBlocks);
    const to = Math.min(document.records.length, blockIndex + contextBlocks + 1);
    return document.records.slice(from, to).map((record) => record.id);
  }

  private rebuildDocumentIndex(document: WorkspaceDocument): void {
    this.removeDocumentIndex(document.id);
    for (const record of document.records) {
      const renderedHaystack = normalizeSearchText(record.renderedText);
      const linkHaystack = normalizeSearchText(
        record.links.map((link) => `${link.text} ${link.href}`).join(" "),
      );
      this.searchIndex.push({
        docId: document.id,
        blockId: record.id,
        blockIndex: record.index,
        haystack: `${renderedHaystack} ${linkHaystack}`.trim(),
        renderedHaystack,
        linkHaystack,
      });
    }
  }

  private removeDocumentIndex(docId: string): void {
    for (let index = this.searchIndex.length - 1; index >= 0; index -= 1) {
      if (this.searchIndex[index]?.docId === docId) {
        this.searchIndex.splice(index, 1);
      }
    }
  }

  private clearDocumentSnippetCache(docId: string): void {
    for (const key of this.snippetCache.keys()) {
      if (key.startsWith(`${docId}:`)) {
        this.snippetCache.delete(key);
      }
    }
  }

  private requireDocument(docId: string): WorkspaceDocument {
    const document = this.documents.get(docId);
    if (document === undefined) {
      throw new Error(`Unknown document: ${docId}`);
    }
    return document;
  }
}

export function resolveRenderModeForZoom(zoom: number): CanvasRenderMode {
  if (zoom < 0.45) {
    return "skeleton";
  }
  if (zoom < 0.9) {
    return "cached-preview";
  }
  return "high-detail";
}

function createInitialParseResult(markdown: string): IncrementalParseResult {
  const state = createIncrementalParseState(markdown);
  return {
    state,
    mode: "full",
    change: null,
    blockDirtyRanges:
      state.blocks.length === 0
        ? []
        : [
            {
              kind: "content",
              fromBlock: 0,
              toBlock: state.blocks.length,
            },
          ],
    dirtyFromBlock: 0,
    dirtyToBlock: state.blocks.length,
    reusedPrefixCount: 0,
    reusedSuffixCount: 0,
    removedCount: 0,
    allBlocks: state.blocks,
    closedBlocks: state.closedBlocks,
    partialBlocks: state.partialBlocks,
    sourceLength: state.sourceLength,
  };
}

function resolveMatchType(
  entry: SearchIndexEntry,
  normalizedQuery: string,
  record: MarkdownBlockRecord,
): SearchMatchType {
  if (record.type === "heading" && entry.renderedHaystack.includes(normalizedQuery)) {
    return "heading";
  }
  if (entry.linkHaystack.includes(normalizedQuery)) {
    return "link";
  }
  return "rendered-text";
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function applyTextChanges(text: string, changes: readonly WorkspaceTextChange[]): string {
  let next = text;
  for (const change of [...changes].sort((left, right) => right.from - left.from)) {
    next = `${next.slice(0, change.from)}${change.insert}${next.slice(change.to)}`;
  }
  return next;
}

function changesTouchRange(
  changes: readonly WorkspaceTextChange[],
  range: WorkspaceSourceRange,
): boolean {
  return changes.some((change) => {
    if (change.from === change.to) {
      return change.from >= range.from && change.from <= range.to;
    }
    return change.from < range.to && change.to > range.from;
  });
}

function resolveAppendOffset(markdown: string, record: MarkdownBlockRecord): number {
  if (record.type !== "code-block") {
    return record.source.to;
  }

  const source = markdown.slice(record.source.from, record.source.to);
  const closingFence = source.match(/\n[ \t]*(`{3,}|~{3,})[ \t]*$/u);
  if (closingFence === null || closingFence.index === undefined) {
    return record.source.to;
  }
  return record.source.from + closingFence.index;
}

function layoutTiles(
  items: Array<{
    readonly id: string;
    readonly type: "document" | "snippet";
    readonly docId: string;
    readonly blockIds: readonly string[];
    readonly height: number;
    readonly previewKey: string;
  }>,
  options: {
    readonly tileWidth: number;
    readonly gap: number;
    readonly columns: number;
    readonly originX: number;
    readonly originY: number;
    readonly mode: CanvasRenderMode;
  },
): CanvasTile[] {
  const columnHeights = Array.from({ length: options.columns }, () => options.originY);
  return items.map((item) => {
    const column = findShortestColumn(columnHeights);
    const x = options.originX + column * (options.tileWidth + options.gap);
    const y = columnHeights[column]!;
    const height = Math.max(48, item.height);
    columnHeights[column] = y + height + options.gap;

    return {
      id: item.id,
      type: item.type,
      docId: item.docId,
      blockIds: item.blockIds,
      rect: {
        x,
        y,
        width: options.tileWidth,
        height,
      },
      renderMode: options.mode,
      previewKey: item.previewKey,
    };
  });
}

function findShortestColumn(columnHeights: readonly number[]): number {
  let shortestIndex = 0;
  let shortestHeight = columnHeights[0] ?? 0;
  for (let index = 1; index < columnHeights.length; index += 1) {
    const height = columnHeights[index] ?? 0;
    if (height < shortestHeight) {
      shortestIndex = index;
      shortestHeight = height;
    }
  }
  return shortestIndex;
}

function intersects(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
