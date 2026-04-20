import { performance } from "node:perf_hooks";

import { createHighlighter } from "../packages/highlight/src/index.ts";
import { createLayoutEngine, type DocumentLayout } from "../packages/layout/src/index.ts";
import { installNodeCanvas } from "../packages/layout/src/node-canvas.ts";
import {
  createIncrementalParseState,
  createMarkdownInlineSourceMap,
  incrementalParse,
} from "../packages/parser/src/index.ts";
import {
  createEditableLayoutIndex,
  createInMemoryTextDocumentAdapter,
} from "../packages/editor/src/index.ts";
import {
  createCanvasTileRenderCommands,
  createWorkspaceEngine,
  type CanvasTile,
  type WorkspaceDocumentDelta,
} from "../packages/workspace/src/index.ts";

installNodeCanvas();

interface BenchmarkOptions {
  readonly chars: number;
  readonly docs: number;
  readonly iterations: number;
  readonly width: number;
  readonly json: boolean;
}

interface Timed<T> {
  readonly ms: number;
  readonly value: T;
}

interface IncrementalScenarioResult {
  readonly scenario: string;
  readonly incrementalLayoutMs: number;
  readonly editableIndexMs: number;
  readonly fullLayoutMs: number;
  readonly speedup: number;
  readonly mode: string;
  readonly dirtyBlocks: number;
  readonly reusedBlocks: number;
  readonly lineCount: number;
  readonly fragmentCount: number;
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const options = {
    chars: 250_000,
    docs: 400,
    iterations: 5,
    width: 720,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--chars":
        options.chars = Number(argv[index + 1] ?? options.chars);
        index += 1;
        break;
      case "--docs":
        options.docs = Number(argv[index + 1] ?? options.docs);
        index += 1;
        break;
      case "--iterations":
      case "-n":
        options.iterations = Number(argv[index + 1] ?? options.iterations);
        index += 1;
        break;
      case "--width":
      case "-w":
        options.width = Number(argv[index + 1] ?? options.width);
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
    }
  }

  return options;
}

function time<T>(run: () => T): Timed<T> {
  const startedAt = performance.now();
  const value = run();
  return {
    ms: performance.now() - startedAt,
    value,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(2));
}

function medianByKey<T extends Record<string, unknown>>(entries: readonly T[]): T {
  const keys = Object.keys(entries[0] ?? {}) as Array<keyof T>;
  const result = {} as T;
  for (const key of keys) {
    const sample = entries[0]?.[key];
    result[key] =
      typeof sample === "number"
        ? (median(entries.map((entry) => entry[key] as number)) as T[keyof T])
        : (sample as T[keyof T]);
  }
  return result;
}

function buildFixture(targetChars: number): string {
  const section = [
    "## Section",
    "",
    "User edit anchor paragraph with **bold**, _emphasis_, `code`, [docs](https://example.com), and emoji 👨‍👩‍👧‍👦.",
    "",
    "AI stream target paragraph with enough text to append generated content without changing the user's active area.",
    "",
    "- item one",
    "- item two",
    "",
    "> quoted text",
    "",
    "```ts",
    "const value = 1;",
    "```",
    "",
  ].join("\n");

  let markdown = "# Native editor benchmark\n\n";
  while (markdown.length < targetChars) {
    markdown += section;
  }
  return markdown;
}

function layoutAndIndex(
  markdown: string,
  width: number,
): {
  readonly layout: DocumentLayout;
  readonly layoutMs: number;
  readonly parseMs: number;
  readonly editableIndexMs: number;
  readonly blockCount: number;
  readonly lineCount: number;
  readonly fragmentCount: number;
} {
  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
    lineBreakMode: "source",
  });
  const layoutResult = time(() => engine.layout(markdown, width));
  const parseResult = time(() => createIncrementalParseState(markdown));
  const inlineSources = createMarkdownInlineSourceMap(parseResult.value);
  const editableIndexResult = time(() =>
    createEditableLayoutIndex({
      markdown,
      layout: layoutResult.value,
      blockSpans: parseResult.value.blockSpans,
      inlineSources,
    }),
  );

  return {
    layout: layoutResult.value,
    layoutMs: Number(layoutResult.ms.toFixed(2)),
    parseMs: Number(parseResult.ms.toFixed(2)),
    editableIndexMs: Number(editableIndexResult.ms.toFixed(2)),
    blockCount: parseResult.value.blocks.length,
    lineCount: layoutResult.value.lines.length,
    fragmentCount: editableIndexResult.value.fragments.length,
  };
}

function benchmarkLargeDocument(markdown: string, options: BenchmarkOptions) {
  const runs = Array.from({ length: options.iterations }, () => {
    const result = layoutAndIndex(markdown, options.width);
    return {
      layoutMs: result.layoutMs,
      parseMs: result.parseMs,
      editableIndexMs: result.editableIndexMs,
      blockCount: result.blockCount,
      lineCount: result.lineCount,
      fragmentCount: result.fragmentCount,
      totalHeight: Number(result.layout.totalHeight.toFixed(2)),
    };
  });
  return medianByKey(runs);
}

function benchmarkIncrementalScenario(
  markdown: string,
  options: BenchmarkOptions,
  scenario: string,
  update: (text: string) => string,
): IncrementalScenarioResult {
  const runs = Array.from({ length: options.iterations }, () => {
    const highlighter = createHighlighter();
    const incrementalEngine = createLayoutEngine({
      fontTheme: "github",
      highlighter,
      lineBreakMode: "source",
    });
    incrementalEngine.layout(markdown, options.width);
    const previousState = createIncrementalParseState(markdown);
    const nextText = update(markdown);
    const parseResult = incrementalParse(previousState, nextText);
    const layoutResult = time(() => incrementalEngine.layout(nextText, options.width));
    const inlineSources = createMarkdownInlineSourceMap(parseResult.state);
    const editableIndexResult = time(() =>
      createEditableLayoutIndex({
        markdown: nextText,
        layout: layoutResult.value,
        blockSpans: parseResult.state.blockSpans,
        inlineSources,
      }),
    );
    const fullEngine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
      lineBreakMode: "source",
    });
    const fullLayoutResult = time(() => fullEngine.layout(nextText, options.width));

    return {
      scenario,
      incrementalLayoutMs: Number(layoutResult.ms.toFixed(2)),
      editableIndexMs: Number(editableIndexResult.ms.toFixed(2)),
      fullLayoutMs: Number(fullLayoutResult.ms.toFixed(2)),
      speedup: Number((fullLayoutResult.ms / Math.max(0.01, layoutResult.ms)).toFixed(2)),
      mode: parseResult.mode,
      dirtyBlocks: parseResult.dirtyToBlock - parseResult.dirtyFromBlock,
      reusedBlocks: parseResult.reusedPrefixCount + parseResult.reusedSuffixCount,
      lineCount: layoutResult.value.lines.length,
      fragmentCount: editableIndexResult.value.fragments.length,
    };
  });
  return medianByKey(runs);
}

function benchmarkIncremental(markdown: string, options: BenchmarkOptions) {
  const localNeedle = "User edit anchor";
  const remoteNeedle = "## Section";
  const streamNeedle = "AI stream target paragraph";
  return [
    benchmarkIncrementalScenario(markdown, options, "local-edit-middle", (text) => {
      const offset = text.indexOf(localNeedle) + localNeedle.length;
      return `${text.slice(0, offset)} typed locally${text.slice(offset)}`;
    }),
    benchmarkIncrementalScenario(markdown, options, "remote-edit-before-user", (text) => {
      const offset = text.indexOf(remoteNeedle);
      return `${text.slice(0, offset)}> remote collaborator note\n\n${text.slice(offset)}`;
    }),
    benchmarkIncrementalScenario(markdown, options, "ai-stream-append", (text) => {
      const offset = text.indexOf(streamNeedle) + streamNeedle.length;
      return `${text.slice(0, offset)}${" streamed token".repeat(12)}${text.slice(offset)}`;
    }),
  ];
}

function benchmarkRangeRebasing(markdown: string, options: BenchmarkOptions) {
  const adapter = createInMemoryTextDocumentAdapter(markdown, { idPrefix: "benchmark" });
  const anchor = markdown.indexOf("User edit anchor");
  const selection = adapter.createRange(anchor, anchor + "User edit anchor".length, {
    kind: "selection",
    bias: "expand",
  });
  const patches = Math.max(50, Math.floor(options.docs / 2));
  const startedAt = performance.now();
  for (let index = 0; index < patches; index += 1) {
    adapter.transact((tx) => {
      tx.insert(0, `remote-${index}\n`);
    });
  }
  const ms = performance.now() - startedAt;
  const resolved = adapter.resolveRange(selection);
  const selectedText = adapter.getText().slice(resolved.from, resolved.to);
  adapter.disposeRange(selection);
  return {
    patches,
    ms: Number(ms.toFixed(2)),
    selectionPreserved: selectedText === "User edit anchor",
    selectionFrom: resolved.from,
    selectionTo: resolved.to,
  };
}

function buildWorkspaceDocuments(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `doc-${index}`,
    title: `Doc ${index}`,
    markdown: [
      `# Doc ${index}`,
      "",
      `needle rendered result ${index} with **bold** text and [docs](https://example.com/${index}).`,
      "",
      "AI stream target paragraph with enough text to append generated output.",
      "",
      "User edit anchor paragraph stays separate from streaming output.",
    ].join("\n"),
  }));
}

function dirtyBlockIds(delta: WorkspaceDocumentDelta, tiles: readonly CanvasTile[]): Set<string> {
  const targetTile = tiles.find((tile) => tile.docId === delta.docId);
  const blockIds = targetTile?.blockIds ?? [];
  const dirtyIds = new Set<string>();
  for (const range of delta.blockDirtyRanges) {
    for (let index = range.fromBlock; index < range.toBlock; index += 1) {
      const blockId = blockIds[index];
      if (blockId !== undefined) {
        dirtyIds.add(blockId);
      }
    }
  }
  return dirtyIds;
}

function benchmarkWorkspaceAndDirtyTiles(options: BenchmarkOptions) {
  const engine = createWorkspaceEngine({
    containerWidth: 360,
    snippetContextBlocks: 0,
  });
  const documents = buildWorkspaceDocuments(options.docs);
  const loadResult = time(() => engine.loadDocuments(documents));
  const documentTiles = engine.createDocumentTiles({
    width: 320,
    columns: 4,
    zoom: 1.2,
    maxTiles: options.docs,
  });
  const tiles = engine.createSnippetTiles(engine.search("needle", { limit: options.docs }), {
    width: 320,
    columns: 4,
    zoom: 1.2,
    maxTiles: options.docs,
  });
  const beforeCommands = createCanvasTileRenderCommands(tiles);
  const editDoc = documents[Math.min(1, documents.length - 1)]!;
  const editOffset = editDoc.markdown.indexOf("User edit anchor") + "User edit anchor".length;
  const dirtyResult = time(() =>
    engine.applyDocumentOperation({
      docId: editDoc.id,
      origin: "remote",
      actorId: "peer",
      changes: [{ from: editOffset, to: editOffset, insert: " remote patch" }],
    }),
  );
  const dirtyIds = dirtyBlockIds(dirtyResult.value.delta, documentTiles);
  const dirtyCommandResult = time(() =>
    createCanvasTileRenderCommands(
      tiles.filter(
        (tile) => tile.docId === editDoc.id || tile.blockIds.some((id) => dirtyIds.has(id)),
      ),
    ),
  );

  const streamDoc = engine.search("AI stream target", { limit: 1 })[0]!;
  const concurrent = engine.benchmarkConcurrentUpdates({
    query: "needle",
    streamDocId: streamDoc.docId,
    streamBlockId: streamDoc.blockId,
    streamChunks: Array.from({ length: 24 }, (_, index) => ` token-${index}`),
    editDocId: editDoc.id,
    edit: (markdown) => markdown.replace("User edit anchor", "User edit anchor local"),
    limit: Math.min(500, options.docs),
    tileWidth: 320,
    viewport: {
      x: 0,
      y: 0,
      width: 1440,
      height: 960,
    },
  });

  return {
    loadMs: Number(loadResult.ms.toFixed(2)),
    tileCount: tiles.length,
    initialRenderCommandCount: beforeCommands.length,
    dirtyOperationMs: Number(dirtyResult.ms.toFixed(2)),
    dirtyBlockCount: dirtyIds.size,
    dirtyRenderCommandMs: Number(dirtyCommandResult.ms.toFixed(2)),
    dirtyRenderCommandCount: dirtyCommandResult.value.length,
    concurrent,
  };
}

function printSection(title: string, value: unknown): void {
  console.log(`\n# ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const markdown = buildFixture(options.chars);
  const payload = {
    env: {
      node: process.version,
      chars: markdown.length,
      docs: options.docs,
      iterations: options.iterations,
      width: options.width,
    },
    largeDocument: benchmarkLargeDocument(markdown, options),
    incremental: benchmarkIncremental(markdown, options),
    rangeRebasing: benchmarkRangeRebasing(markdown, options),
    canvasDirtyTilesAndConcurrent: benchmarkWorkspaceAndDirtyTiles(options),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printSection("Environment", payload.env);
  printSection("Large Document Layout And Editable Index", payload.largeDocument);
  printSection("Incremental Local Remote And AI Stream Edits", payload.incremental);
  printSection("Stable Range Rebasing", payload.rangeRebasing);
  printSection(
    "Canvas Dirty Tiles And Concurrent Workspace",
    payload.canvasDirtyTilesAndConcurrent,
  );
}

main();
