import { performance } from "node:perf_hooks";

import { installNodeCanvas } from "../packages/layout/src/node-canvas.ts";

const highlightEntry = "../packages/highlight/dist/index.mjs";
const layoutEntry = "../packages/layout/dist/index.mjs";
const parserEntry = "../packages/parser/dist/index.mjs";

installNodeCanvas();

const highlightModule = (await import(
  highlightEntry
)) as typeof import("../packages/highlight/src/index.ts");
const layoutModule = (await import(
  layoutEntry
)) as typeof import("../packages/layout/src/index.ts");
const parserModule = (await import(
  parserEntry
)) as typeof import("../packages/parser/src/index.ts");

const { createHighlighter } = highlightModule;
const { createLayoutEngine } = layoutModule;
const { createIncrementalParseState, incrementalParse, parseMarkdown, simpleDiff } = parserModule;

interface Scenario {
  name: string;
  update(text: string): string;
}

const scenarios: Scenario[] = [
  {
    name: "append-20-chars",
    update: (text) => `${text} trailing benchmark`,
  },
  {
    name: "append-paragraph",
    update: (text) => `${text}\n\nA fresh benchmark paragraph with **bold** text.`,
  },
  {
    name: "replace-middle-30-chars",
    update: (text) => {
      const start = Math.floor(text.length * 0.4);
      const end = Math.min(text.length, start + 30);
      return `${text.slice(0, start)}updated benchmark middle section${text.slice(end)}`;
    },
  },
  {
    name: "modify-list-nesting",
    update: (text) => text.replace("- item two", "- item two\n  - nested benchmark item"),
  },
  {
    name: "open-close-code-fence",
    update: (text) =>
      text.replace(
        "Paragraph with **bold**, _emphasis_, ~~strike~~, `code`, and [link](https://example.com).",
        "```ts\nconst benchmark = true\n```",
      ),
  },
  {
    name: "large-rewrite-fallback",
    update: (text) =>
      `${"# rewritten\n\n"}${"changed paragraph\n\n".repeat(Math.max(16, text.length / 80))}`,
  },
];

const sizes = [
  { label: "10KB", repeat: 90 },
  { label: "50KB", repeat: 450 },
  { label: "100KB", repeat: 900 },
];

for (const size of sizes) {
  const text = buildFixture(size.repeat);
  const oldState = createIncrementalParseState(text);
  const width = 720;
  let fallbackCount = 0;

  console.log(`\n# ${size.label}`);

  for (const scenario of scenarios) {
    const nextText = scenario.update(text);
    const diffTime = measure(() => simpleDiff(text, nextText));
    const parserFull = measure(() => parseMarkdown(nextText));
    const parserIncremental = measure(() => incrementalParse(oldState, nextText));
    const fullEngine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
    });
    const incrementalEngine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
    });
    incrementalEngine.layout(text, width);
    const layoutFull = measure(() => fullEngine.layout(nextText, width));
    const layoutIncremental = measure(() => incrementalEngine.layout(nextText, width));
    const incrementalResult = incrementalParse(oldState, nextText);
    if (incrementalResult.mode === "full") {
      fallbackCount += 1;
    }

    console.log(
      [
        scenario.name,
        `diff=${diffTime.toFixed(2)}ms`,
        `parser full=${parserFull.toFixed(2)}ms`,
        `parser incr=${parserIncremental.toFixed(2)}ms`,
        `layout full=${layoutFull.toFixed(2)}ms`,
        `layout incr=${layoutIncremental.toFixed(2)}ms`,
        `dirty blocks=${incrementalResult.dirtyToBlock - incrementalResult.dirtyFromBlock}`,
        `reused=${incrementalResult.reusedPrefixCount + incrementalResult.reusedSuffixCount}/${oldState.blocks.length}`,
        `mode=${incrementalResult.mode}`,
      ].join(" | "),
    );
  }

  console.log(`fallback hit rate=${fallbackCount}/${scenarios.length}`);
}

function buildFixture(repeat: number): string {
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

  return `# Benchmark\n\n${section.repeat(repeat)}`;
}

function measure(run: () => void, iterations = 20): number {
  const durations: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    run();
    durations.push(performance.now() - startedAt);
  }

  durations.sort((left, right) => left - right);
  return durations[Math.floor(durations.length / 2)];
}
