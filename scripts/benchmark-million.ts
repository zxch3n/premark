import { performance } from "node:perf_hooks";

import { createHighlighter } from "../packages/highlight/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import { createDefaultSpacing } from "../packages/layout/src/font-theme.ts";
import { installNodeCanvas } from "../packages/layout/src/node-canvas.ts";
import { normalizeDocument } from "../packages/layout/src/normalize.ts";
import {
  createIncrementalParseState,
  incrementalParse,
  simpleDiff,
} from "../packages/parser/src/index.ts";

installNodeCanvas();

interface BenchmarkOptions {
  iterations: number;
  warmup: number;
  width: number;
  json: boolean;
  profile: boolean;
}

interface TimedStats {
  parseStateMs: number;
  normalizeMs: number;
  totalEngineLayoutMs: number;
  layoutMeasureMs: number;
  blockCount: number;
  normalizedBlockCount: number;
  lineCount: number;
  totalHeight: number;
}

interface IncrementalStats {
  diffMs: number;
  incrementalParseMs: number;
  applyParseResultMs: number;
  normalizeIncrementalMs: number;
  layoutIncrementalMs: number;
  totalIncrementalLayoutMs: number;
  fullRerenderAfterInsertMs: number;
  mode: string;
  dirtyBlocks: number;
  reusedBlocks: number;
  newBlockCount: number;
  lineCount: number;
  totalHeight: number;
  diffChars: number;
  diffLines: number;
}

interface InternalLayoutEngine {
  layout(
    markdown: string,
    width: number,
  ): {
    lines: Array<unknown>;
    totalHeight: number;
  };
  applyParseResult(
    result: unknown,
    width: number,
  ): {
    lines: Array<unknown>;
    totalHeight: number;
  };
  prepareBlock(block: unknown): unknown;
  layoutPreparedBlock(
    block: { type?: string },
    prepared: { kind?: string },
    blockIndex: number,
    firstLineIndex: number,
    x: number,
    y: number,
    maxWidth: number,
  ): unknown;
  normalizeIncrementally(result: unknown): unknown;
  layoutNormalizedBlocksIncrementally(
    normalizedDocument: unknown,
    containerWidth: number,
    dirtyFromBlock: number,
    dirtyToBlock: number,
  ): unknown;
}

interface ProfileBucket {
  totalMs: number;
  count: number;
}

interface LayoutProfile {
  totalMs: number;
  prepare: {
    totalMs: number;
    byKind: Record<string, ProfileBucket>;
  };
  layout: {
    totalMs: number;
    byKind: Record<string, ProfileBucket>;
  };
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    iterations: 3,
    warmup: 1,
    width: 720,
    json: false,
    profile: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--iterations":
      case "-n":
        options.iterations = Number(argv[index + 1] ?? options.iterations);
        index += 1;
        break;
      case "--warmup":
        options.warmup = Number(argv[index + 1] ?? options.warmup);
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
      case "--profile":
        options.profile = true;
        break;
    }
  }

  return options;
}

function buildFixture(targetChars = 1_000_000): string {
  const section = [
    "## Section",
    "",
    "Paragraph with **bold**, _emphasis_, ~~strike~~, `code`, and [link](https://example.com).",
    "",
    "- item one",
    "- item two",
    "",
    "> quoted text",
    "",
    "| a | b |",
    "| :- | -: |",
    "| left | right |",
    "",
    "```ts",
    "const value = 1",
    "```",
    "",
  ].join("\n");

  let text = "# Benchmark\n\n";
  while (text.length < targetChars) {
    text += section;
  }
  text = text.slice(0, targetChars);
  const lastBoundary = text.lastIndexOf("\n## Section");
  if (lastBoundary > 0) {
    text = text.slice(0, lastBoundary);
  }
  return text;
}

function buildInsertion(oldText: string): { insert: string; insertPos: number; nextText: string } {
  const insert =
    "\n\nInserted incremental paragraph with **bold** markers, `inline code`, and a [link](https://example.com) in the middle.\n";
  const insertPos = Math.floor(oldText.length * 0.44);
  return {
    insert,
    insertPos,
    nextText: `${oldText.slice(0, insertPos)}${insert}${oldText.slice(insertPos)}`,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(2));
}

function medianByKey<T extends object>(entries: T[]): T {
  const result = {} as T;
  const keys = Object.keys(entries[0] ?? {}) as Array<keyof T>;
  for (const key of keys) {
    const sample = entries[0]?.[key];
    if (typeof sample === "number") {
      result[key] = median(entries.map((entry) => entry[key] as number)) as T[keyof T];
      continue;
    }

    result[key] = sample;
  }
  return result;
}

function recordBucket(buckets: Record<string, ProfileBucket>, key: string, duration: number): void {
  const current = buckets[key] ?? { totalMs: 0, count: 0 };
  current.totalMs += duration;
  current.count += 1;
  buckets[key] = current;
}

function summarizeProfile(profile: LayoutProfile): LayoutProfile {
  const summarizeBuckets = (buckets: Record<string, ProfileBucket>) =>
    Object.fromEntries(
      Object.entries(buckets).map(([key, value]) => [
        key,
        {
          totalMs: Number(value.totalMs.toFixed(2)),
          count: value.count,
        },
      ]),
    );

  return {
    totalMs: Number(profile.totalMs.toFixed(2)),
    prepare: {
      totalMs: Number(profile.prepare.totalMs.toFixed(2)),
      byKind: summarizeBuckets(profile.prepare.byKind),
    },
    layout: {
      totalMs: Number(profile.layout.totalMs.toFixed(2)),
      byKind: summarizeBuckets(profile.layout.byKind),
    },
  };
}

function profileLayout(markdown: string, width: number): LayoutProfile {
  const highlighter = createHighlighter();
  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter,
  }) as unknown as InternalLayoutEngine;

  const originalPrepareBlock = engine.prepareBlock.bind(engine);
  const originalLayoutPreparedBlock = engine.layoutPreparedBlock.bind(engine);

  const profile: LayoutProfile = {
    totalMs: 0,
    prepare: {
      totalMs: 0,
      byKind: {},
    },
    layout: {
      totalMs: 0,
      byKind: {},
    },
  };

  engine.prepareBlock = function patchedPrepareBlock(block: { type?: string }) {
    const startedAt = performance.now();
    const result = originalPrepareBlock.call(this, block);
    const duration = performance.now() - startedAt;
    profile.prepare.totalMs += duration;
    recordBucket(
      profile.prepare.byKind,
      (result as { kind?: string }).kind ?? block.type ?? "?",
      duration,
    );
    return result;
  };

  engine.layoutPreparedBlock = function patchedLayoutPreparedBlock(
    block: { type?: string },
    prepared: { kind?: string },
    blockIndex: number,
    firstLineIndex: number,
    x: number,
    y: number,
    maxWidth: number,
  ) {
    const startedAt = performance.now();
    const result = originalLayoutPreparedBlock.call(
      this,
      block,
      prepared,
      blockIndex,
      firstLineIndex,
      x,
      y,
      maxWidth,
    );
    const duration = performance.now() - startedAt;
    profile.layout.totalMs += duration;
    recordBucket(profile.layout.byKind, prepared.kind ?? block.type ?? "?", duration);
    return result;
  };

  const startedAt = performance.now();
  engine.layout(markdown, width);
  profile.totalMs = performance.now() - startedAt;
  return summarizeProfile(profile);
}

function benchmarkFull(markdown: string, width: number): TimedStats {
  const parseStartedAt = performance.now();
  const state = createIncrementalParseState(markdown);
  const parseStateMs = performance.now() - parseStartedAt;

  const normalizeStartedAt = performance.now();
  const normalized = normalizeDocument(state.blocks, createDefaultSpacing());
  const normalizeMs = performance.now() - normalizeStartedAt;

  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
  });
  const totalStartedAt = performance.now();
  const layout = engine.layout(markdown, width);
  const totalEngineLayoutMs = performance.now() - totalStartedAt;

  return {
    parseStateMs: Number(parseStateMs.toFixed(2)),
    normalizeMs: Number(normalizeMs.toFixed(2)),
    totalEngineLayoutMs: Number(totalEngineLayoutMs.toFixed(2)),
    layoutMeasureMs: Number(
      Math.max(0, totalEngineLayoutMs - parseStateMs - normalizeMs).toFixed(2),
    ),
    blockCount: state.blocks.length,
    normalizedBlockCount: normalized.blocks.length,
    lineCount: layout.lines.length,
    totalHeight: Number(layout.totalHeight.toFixed(2)),
  };
}

function benchmarkIncremental(markdown: string, width: number): IncrementalStats {
  const { nextText } = buildInsertion(markdown);
  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
  }) as unknown as InternalLayoutEngine;
  engine.layout(markdown, width);
  const previousState = createIncrementalParseState(markdown);

  let normalizeIncrementalMs = 0;
  let layoutIncrementalMs = 0;
  const originalNormalizeIncrementally = engine.normalizeIncrementally.bind(engine) as (
    result: unknown,
  ) => unknown;
  const originalLayoutNormalizedBlocksIncrementally =
    engine.layoutNormalizedBlocksIncrementally.bind(engine) as (
      normalizedDocument: unknown,
      containerWidth: number,
      dirtyFromBlock: number,
      dirtyToBlock: number,
    ) => unknown;

  engine.normalizeIncrementally = function patchedNormalizeIncrementally(result: unknown) {
    const startedAt = performance.now();
    const value = originalNormalizeIncrementally.call(this, result);
    normalizeIncrementalMs += performance.now() - startedAt;
    return value;
  };

  engine.layoutNormalizedBlocksIncrementally = function patchedLayoutNormalizedBlocksIncrementally(
    normalizedDocument: unknown,
    containerWidth: number,
    dirtyFromBlock: number,
    dirtyToBlock: number,
  ) {
    const startedAt = performance.now();
    const value = originalLayoutNormalizedBlocksIncrementally.call(
      this,
      normalizedDocument,
      containerWidth,
      dirtyFromBlock,
      dirtyToBlock,
    );
    layoutIncrementalMs += performance.now() - startedAt;
    return value;
  };

  const diffStartedAt = performance.now();
  const diff = simpleDiff(markdown, nextText);
  const diffMs = performance.now() - diffStartedAt;

  const parseStartedAt = performance.now();
  const parseResult = incrementalParse(previousState, nextText);
  const incrementalParseMs = performance.now() - parseStartedAt;

  const applyStartedAt = performance.now();
  const layout = engine.applyParseResult(parseResult, width);
  const applyParseResultMs = performance.now() - applyStartedAt;

  const freshEngine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
  });
  const fullStartedAt = performance.now();
  freshEngine.layout(nextText, width);
  const fullRerenderAfterInsertMs = performance.now() - fullStartedAt;

  return {
    diffMs: Number(diffMs.toFixed(2)),
    incrementalParseMs: Number(incrementalParseMs.toFixed(2)),
    applyParseResultMs: Number(applyParseResultMs.toFixed(2)),
    normalizeIncrementalMs: Number(normalizeIncrementalMs.toFixed(2)),
    layoutIncrementalMs: Number(layoutIncrementalMs.toFixed(2)),
    totalIncrementalLayoutMs: Number((incrementalParseMs + applyParseResultMs).toFixed(2)),
    fullRerenderAfterInsertMs: Number(fullRerenderAfterInsertMs.toFixed(2)),
    mode: parseResult.mode,
    dirtyBlocks: parseResult.dirtyToBlock - parseResult.dirtyFromBlock,
    reusedBlocks: parseResult.reusedPrefixCount + parseResult.reusedSuffixCount,
    newBlockCount: parseResult.state.blocks.length,
    lineCount: layout.lines.length,
    totalHeight: Number(layout.totalHeight.toFixed(2)),
    diffChars: diff?.changedChars ?? 0,
    diffLines: diff?.changedLines ?? 0,
  };
}

function printResult(title: string, result: object): void {
  console.log(`\n${title}`);
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "object" && value !== null) {
      console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
      continue;
    }
    console.log(`${key}: ${String(value)}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const markdown = buildFixture();

  for (let warmup = 0; warmup < options.warmup; warmup += 1) {
    benchmarkFull(markdown.slice(0, 100_000), options.width);
  }

  const fullRuns: TimedStats[] = [];
  const incrementalRuns: IncrementalStats[] = [];

  for (let index = 0; index < options.iterations; index += 1) {
    fullRuns.push(benchmarkFull(markdown, options.width));
    incrementalRuns.push(benchmarkIncremental(markdown, options.width));
  }

  const payload = {
    env: {
      node: process.version,
      width: options.width,
      iterations: options.iterations,
      warmup: options.warmup,
    },
    fixture: {
      characters: markdown.length,
    },
    full: medianByKey(fullRuns),
    incremental: medianByKey(incrementalRuns),
    profile: options.profile ? profileLayout(markdown, options.width) : undefined,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printResult("Environment", payload.env);
  printResult("Fixture", payload.fixture);
  printResult("Full Render", payload.full);
  printResult("Incremental Update", payload.incremental);
  if (payload.profile !== undefined) {
    printResult("Layout Profile", payload.profile as unknown as Record<string, unknown>);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
