import { describe, expect, it } from "vite-plus/test";

import {
  createWorkspaceEngine,
  createAnimationFrameStreamBatcher,
  createWorkspaceScheduler,
  activeOverlayRemoteEditPolicy,
  createCanvasTileRenderCommands,
  resolveRenderModeForZoom,
} from "../src/index.ts";

describe("WorkspaceEngine", () => {
  it("indexes rendered block text across multiple documents and renders local snippets", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 520,
      snippetContextBlocks: 1,
    });

    engine.loadDocuments([
      {
        id: "guide",
        title: "Guide",
        markdown: [
          "# Guide",
          "",
          "Use [docs](https://example.com/docs) for details.",
          "",
          "## Table",
          "",
          "| Name | Value |",
          "| --- | --- |",
          "| Alpha | target value |",
        ].join("\n"),
      },
      {
        id: "notes",
        title: "Notes",
        markdown: "# Notes\n\nPlain paragraph.",
      },
    ]);

    const results = engine.search("target");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      docId: "guide",
      matchType: "rendered-text",
      renderedText: expect.stringContaining("target value"),
    });
    expect(results[0]?.snippetBlockIds.length).toBeGreaterThanOrEqual(2);

    const snippet = engine.renderSearchResultSnippet(results[0]!);
    expect(snippet.markdown).toContain("| Alpha | target value |");
    expect(snippet.layout.blocks.some((block) => block.type === "table")).toBe(true);
  });

  it("can search link metadata while still returning rendered snippets", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 480,
    });
    engine.loadDocuments([
      {
        id: "links",
        markdown: "# Links\n\nRead [Premark](https://example.com/premark).",
      },
    ]);

    const results = engine.search("premark");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      matchType: "link",
      renderedText: "Read Premark.",
    });

    const snippet = engine.renderSearchResultSnippet(results[0]!);
    expect(snippet.markdown).toContain("[Premark](https://example.com/premark)");
  });

  it("creates document and snippet tiles with zoom render modes and viewport culling", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments(
      Array.from({ length: 8 }, (_, index) => ({
        id: `doc-${index}`,
        markdown: `# Doc ${index}\n\nParagraph with shared target ${index}.`,
      })),
    );

    const results = engine.search("target", { limit: 8 });
    const documentTiles = engine.createDocumentTiles({
      width: 320,
      columns: 2,
      zoom: 0.3,
    });
    const snippetTiles = engine.createSnippetTiles(results, {
      width: 320,
      columns: 2,
      zoom: 1.2,
    });
    const visible = engine.cullTiles(snippetTiles, {
      x: 0,
      y: 0,
      width: 700,
      height: 300,
    });

    expect(documentTiles).toHaveLength(8);
    expect(documentTiles.every((tile) => tile.renderMode === "skeleton")).toBe(true);
    expect(snippetTiles).toHaveLength(8);
    expect(snippetTiles.every((tile) => tile.renderMode === "high-detail")).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(snippetTiles.length);
  });

  it("turns canvas tiles into render commands for each zoom mode", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nBody",
      },
    ]);

    const skeleton = createCanvasTileRenderCommands(engine.createDocumentTiles({ zoom: 0.3 }));
    const preview = createCanvasTileRenderCommands(engine.createDocumentTiles({ zoom: 0.6 }));
    const detail = createCanvasTileRenderCommands(engine.createDocumentTiles({ zoom: 1.2 }));

    expect(skeleton[0]).toMatchObject({ kind: "rect", mode: "skeleton" });
    expect(preview[0]).toMatchObject({ kind: "preview", mode: "cached-preview" });
    expect(detail[0]).toMatchObject({ kind: "detail", mode: "high-detail" });
  });

  it("tracks document deltas and reuses stable search results after edits", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nAlpha target.\n\nBeta suffix.",
      },
    ]);

    const delta = engine.upsertDocument({
      id: "doc",
      markdown: "# Title\n\nAlpha target updated.\n\nBeta suffix.",
    });
    const results = engine.search("suffix");

    expect(delta.blockDirtyRanges).toEqual([
      { kind: "content", fromBlock: 1, toBlock: 2 },
      { kind: "layout", fromBlock: 2, toBlock: 3 },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      docId: "doc",
      renderedText: "Beta suffix.",
    });
  });

  it("can prepare at least 500 rendered snippet tiles for a large search result", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 360,
      snippetContextBlocks: 0,
    });
    engine.loadDocuments(
      Array.from({ length: 600 }, (_, index) => ({
        id: `doc-${index}`,
        markdown: `# Doc ${index}\n\nneedle result ${index}\n\nTail paragraph ${index}.`,
      })),
    );

    const benchmark = engine.benchmarkSearchAndRender({
      query: "needle",
      limit: 500,
      tileWidth: 320,
      viewport: {
        x: 0,
        y: 0,
        width: 1400,
        height: 900,
      },
    });

    expect(benchmark.resultCount).toBe(500);
    expect(benchmark.renderedSnippetCount).toBe(500);
    expect(benchmark.tileCount).toBe(500);
    expect(benchmark.visibleTileCount).toBeGreaterThan(0);
  });

  it("batches stream appends and dirties only the streamed block range plus layout suffix", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: [
          "# Title",
          "",
          "Intro paragraph with enough baseline text to keep the stream append on the incremental path.",
          "",
          "AI target paragraph with enough baseline text for stable dirty range checks.",
          "",
          "User block with enough text to remain reusable after the streaming target changes.",
        ].join("\n"),
      },
    ]);
    const target = engine.search("AI target")[0]!;

    engine.queueStreamAppend({
      docId: "doc",
      targetBlockId: target.blockId,
      chunk: " chunk",
    });
    engine.queueStreamAppend({
      docId: "doc",
      targetBlockId: target.blockId,
      chunk: " two",
    });
    const flushed = engine.flushStreamAppends();
    const document = engine.getDocument("doc")!;

    expect(flushed.appendedCount).toBe(2);
    expect(document.markdown).toContain("AI target paragraph with enough baseline text");
    expect(document.markdown).toContain("checks. chunk two");
    expect(flushed.deltas[0]?.blockDirtyRanges[0]).toMatchObject({
      kind: "content",
      fromBlock: 2,
      toBlock: 3,
    });
    expect(engine.search("User block")).toHaveLength(1);
  });

  it("runs active input before stream and offscreen work in the scheduler", () => {
    const scheduler = createWorkspaceScheduler();
    const order: string[] = [];
    scheduler.schedule({ priority: "offscreen-layout", run: () => order.push("offscreen") });
    scheduler.schedule({ priority: "ai-stream", run: () => order.push("stream") });
    scheduler.schedule({ priority: "active-input", run: () => order.push("input") });
    scheduler.schedule({ priority: "visible-dirty-tiles", run: () => order.push("visible") });
    scheduler.schedule({ priority: "search-index", run: () => order.push("search") });

    expect(scheduler.flush()).toBe(5);
    expect(order).toEqual(["input", "visible", "stream", "search", "offscreen"]);
  });

  it("can batch stream appends on an animation-frame boundary", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nAI target paragraph with enough baseline text.",
      },
    ]);
    const target = engine.search("target paragraph")[0]!;
    const callbacks: FrameRequestCallback[] = [];
    const batcher = createAnimationFrameStreamBatcher(engine, {
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelAnimationFrame: () => {},
    });

    batcher.enqueue({ docId: "doc", targetBlockId: target.blockId, chunk: " one" });
    batcher.enqueue({ docId: "doc", targetBlockId: target.blockId, chunk: " two" });
    expect(callbacks).toHaveLength(1);

    callbacks[0]!(0);
    expect(engine.getDocument("doc")?.markdown).toContain("baseline text. one two");
  });

  it("benchmarks edit, stream append, search, snippet render and culling together", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 360,
      snippetContextBlocks: 0,
    });
    engine.loadDocuments([
      {
        id: "stream",
        markdown: "# Stream\n\nneedle stream target\n\nTail",
      },
      {
        id: "edit",
        markdown: "# Edit\n\nneedle edit target\n\nTail",
      },
    ]);
    const streamBlock = engine.search("stream target")[0]!;
    const result = engine.benchmarkConcurrentUpdates({
      query: "needle",
      streamDocId: "stream",
      streamBlockId: streamBlock.blockId,
      streamChunks: [" chunk", " chunk2"],
      editDocId: "edit",
      edit: (markdown) => markdown.replace("edit target", "edit target updated"),
      limit: 10,
      tileWidth: 320,
    });

    expect(result.queuedStreamCount).toBe(2);
    expect(result.resultCount).toBeGreaterThanOrEqual(2);
    expect(result.tileCount).toBeGreaterThanOrEqual(2);
    expect(result.visibleTileCount).toBeGreaterThan(0);
  });

  it("applies multi-change remote operations deterministically", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nAlpha block.\n\nBeta block.\n\nGamma block.",
      },
    ]);
    const before = engine.getDocument("doc")!;
    const beta = engine.search("Beta block")[0]!;
    const gamma = engine.search("Gamma block")[0]!;
    const result = engine.applyDocumentOperation({
      docId: "doc",
      origin: "remote",
      actorId: "peer",
      changes: [
        { from: beta.sourceRange.from, to: beta.sourceRange.from, insert: "Remote " },
        { from: gamma.sourceRange.to, to: gamma.sourceRange.to, insert: " updated" },
      ],
    });
    const after = engine.getDocument("doc")!;

    expect(result.touchedActiveRange).toBe(false);
    expect(after.markdown).toContain("Remote Beta block.");
    expect(after.markdown).toContain("Gamma block. updated");
    expect(after.records[0]?.id).toBe(before.records[0]?.id);
    expect(after.records[1]?.id).toBe(before.records[1]?.id);
  });

  it("detects remote edits that touch the active overlay range", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nActive block.\n\nRemote block.",
      },
    ]);
    const active = engine.search("Active block")[0]!;
    const result = engine.applyDocumentOperation(
      {
        docId: "doc",
        origin: "remote",
        actorId: "peer",
        changes: [{ from: active.sourceRange.from, to: active.sourceRange.from, insert: "Peer " }],
      },
      active.sourceRange,
    );

    expect(activeOverlayRemoteEditPolicy).toBe("apply-outside-active-range-conflict-inside");
    expect(result.touchedActiveRange).toBe(true);
  });

  it("maps remote cursor source positions to canvas block rects", () => {
    const engine = createWorkspaceEngine({
      containerWidth: 420,
    });
    engine.loadDocuments([
      {
        id: "doc",
        markdown: "# Title\n\nAlpha block.\n\nBeta block.",
      },
    ]);
    const beta = engine.search("Beta block")[0]!;
    const point = engine.mapSourceOffsetToCanvasRect("doc", beta.sourceRange.from + 1);
    const cursor = engine.mapRemoteCursor({
      docId: "doc",
      actorId: "peer",
      anchor: beta.sourceRange.from,
      head: beta.sourceRange.to,
    });

    expect(point?.blockId).toBe(beta.blockId);
    expect(point?.rect.height).toBeGreaterThan(0);
    expect(cursor.blockIds).toContain(beta.blockId);
    expect(cursor.rects[0]?.width).toBeGreaterThan(0);
  });

  it("replays recorded operation sequences deterministically", () => {
    const createEngine = () => {
      const engine = createWorkspaceEngine({
        containerWidth: 420,
      });
      engine.loadDocuments([
        {
          id: "doc",
          markdown: "# Title\n\nAlpha block.\n\nBeta block.",
        },
      ]);
      return engine;
    };
    const left = createEngine();
    const right = createEngine();
    const operations = [
      {
        docId: "doc",
        origin: "remote" as const,
        changes: [{ from: 9, to: 9, insert: "First " }],
      },
      {
        docId: "doc",
        origin: "local" as const,
        changes: [{ from: 31, to: 35, insert: "section" }],
      },
    ];

    for (const operation of operations) {
      left.applyDocumentOperation(operation);
      right.applyDocumentOperation(operation);
    }

    expect(left.getDocument("doc")?.markdown).toBe(right.getDocument("doc")?.markdown);
    expect(left.getDocument("doc")?.records.map((record) => record.id)).toEqual(
      right.getDocument("doc")?.records.map((record) => record.id),
    );
  });
});

describe("resolveRenderModeForZoom", () => {
  it("switches from skeleton to preview to high detail", () => {
    expect(resolveRenderModeForZoom(0.3)).toBe("skeleton");
    expect(resolveRenderModeForZoom(0.6)).toBe("cached-preview");
    expect(resolveRenderModeForZoom(1)).toBe("high-detail");
  });
});
