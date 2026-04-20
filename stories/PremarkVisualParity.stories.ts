import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import { createEditableLayoutIndex, type Rect } from "../packages/editor/src/index.ts";
import {
  createIncrementalParseState,
  createMarkdownInlineSourceMap,
} from "../packages/parser/src/index.ts";
import { darkTilePalette, drawTile } from "../packages/wiki-canvas/src/index.ts";
import { waitForPremarkStoryFonts } from "./font-loading.ts";
import { visualParityFixtures, type VisualParityFixture } from "./visual-parity-fixtures.ts";

export default {
  title: "Editing/Premark Visual Parity",
};

const highlighter = createHighlighter();
const width = 420;
const contentPadding = 18;
const maxSurfaceHeight = 280;

interface FixtureReport {
  readonly id: string;
  readonly title: string;
  readonly blockCount: number;
  readonly lineCount: number;
  readonly totalHeight: number;
  readonly caretRect: Rect;
  readonly selectionRects: readonly Rect[];
  readonly expectedText: readonly string[];
  readonly issues: readonly string[];
}

export const FixtureGallery = () => {
  const root = document.createElement("div");
  root.className = "pvp-root";
  root.dataset.fontsReady = "0";
  root.innerHTML = `
    <style>
      .pvp-root {
        min-height: 100vh;
        padding: 18px;
        background: #eef2ed;
        color: #12140f;
        font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
      }

      .pvp-heading {
        margin: 0 0 14px;
        font-size: 18px;
        line-height: 1.25;
      }

      .pvp-gallery {
        display: grid;
        gap: 16px;
      }

      .pvp-fixture {
        border: 1px solid #cad4c8;
        border-radius: 8px;
        background: #f9fbf6;
        overflow: hidden;
      }

      .pvp-fixture h2 {
        margin: 0;
        padding: 10px 12px;
        border-bottom: 1px solid #d7dfd4;
        color: #46513f;
        font-size: 12px;
        line-height: 1;
        text-transform: uppercase;
      }

      .pvp-pair {
        display: grid;
        grid-template-columns: 1fr 1fr 220px;
        gap: 12px;
        padding: 12px;
        align-items: start;
      }

      .pvp-dom,
      .pvp-canvas {
        width: ${width + contentPadding * 2}px;
        height: ${maxSurfaceHeight}px;
        overflow: hidden;
        border-radius: 8px;
        background: #0f1320;
      }

      .pvp-dom {
        box-sizing: border-box;
        padding: ${contentPadding}px;
        color: #e2e8f0;
      }

      .pvp-dom .pmd-fragment--link {
        color: #93c5fd;
      }

      .pvp-dom .pmd-doc {
        width: ${width}px;
      }

      .pvp-canvas {
        display: block;
      }

      .pvp-report {
        margin: 0;
        max-height: ${maxSurfaceHeight}px;
        overflow: auto;
        white-space: pre-wrap;
        color: #232920;
        font: 11px/1.45 "IBM Plex Mono", "SFMono-Regular", monospace;
      }
    </style>
    <h1 class="pvp-heading">Premark visual parity fixtures</h1>
    <div class="pvp-gallery" data-visual-parity-gallery></div>
  `;

  const gallery = root.querySelector<HTMLDivElement>("[data-visual-parity-gallery]")!;
  const reports: FixtureReport[] = [];

  async function initialize() {
    await waitForPremarkStoryFonts();
    root.dataset.fontsReady = "1";
    for (const fixture of visualParityFixtures) {
      reports.push(renderFixture(gallery, fixture));
    }
  }

  void initialize();

  (
    window as typeof window & {
      __premarkVisualParity?: {
        fixtures(): readonly FixtureReport[];
      };
    }
  ).__premarkVisualParity = {
    fixtures: () => reports,
  };

  return root;
};

function renderFixture(parent: HTMLElement, fixture: VisualParityFixture): FixtureReport {
  const engine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
    lineBreakMode: "source",
  });
  const layout = engine.layout(fixture.markdown, width);
  const rendered = renderToHtml(layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });
  const parseState = createIncrementalParseState(fixture.markdown);
  const editableIndex = createEditableLayoutIndex({
    markdown: fixture.markdown,
    layout,
    blockSpans: parseState.blockSpans,
    inlineSources: createMarkdownInlineSourceMap(parseState),
  });
  const caretOffset = sourceOffsetForNeedle(fixture, fixture.caretNeedle);
  const selectionRange = {
    from: sourceOffsetForNeedle(fixture, fixture.selectionFromNeedle),
    to: sourceOffsetForNeedle(fixture, fixture.selectionToNeedle, "end"),
  };
  const caretRect = editableIndex.sourceOffsetToCaretRect(caretOffset).rect;
  const selectionRects = editableIndex.sourceRangeToSelectionRects(selectionRange);
  const issues = classifyFixtureIssues({ caretRect, selectionRects });

  const row = document.createElement("section");
  row.className = "pvp-fixture";
  row.dataset.fixture = fixture.id;
  row.innerHTML = `
    <h2>${fixture.title}</h2>
    <div class="pvp-pair">
      <div class="pvp-dom" data-parity-dom="${fixture.id}"></div>
      <canvas class="pvp-canvas" data-parity-canvas="${fixture.id}"></canvas>
      <pre class="pvp-report" data-parity-report="${fixture.id}"></pre>
    </div>
  `;
  parent.append(row);

  const dom = row.querySelector<HTMLDivElement>("[data-parity-dom]")!;
  dom.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;

  const canvas = row.querySelector<HTMLCanvasElement>("[data-parity-canvas]")!;
  const pixelRatio = window.devicePixelRatio || 1;
  const canvasWidth = width + contentPadding * 2;
  canvas.width = Math.round(canvasWidth * pixelRatio);
  canvas.height = Math.round(maxSurfaceHeight * pixelRatio);
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${maxSurfaceHeight}px`;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawTile(context, layout, canvasWidth, maxSurfaceHeight, {
    cardRadius: 8,
    contentPadding,
    caretRect,
    caretColor: "#7dd3ae",
    selectionRects,
    selectionColor: "rgba(52, 139, 99, 0.34)",
    palette: darkTilePalette,
  });

  const report: FixtureReport = {
    id: fixture.id,
    title: fixture.title,
    blockCount: layout.blocks.length,
    lineCount: layout.lines.length,
    totalHeight: layout.totalHeight,
    caretRect,
    selectionRects,
    expectedText: fixture.expectedText,
    issues,
  };
  row.querySelector<HTMLPreElement>("[data-parity-report]")!.textContent = JSON.stringify(
    report,
    null,
    2,
  );
  return report;
}

function sourceOffsetForNeedle(
  fixture: VisualParityFixture,
  needle: string,
  edge: "start" | "end" = "start",
): number {
  const offset = fixture.markdown.indexOf(needle);
  if (offset < 0) {
    throw new Error(`Missing ${needle} in ${fixture.id}`);
  }
  return edge === "start" ? offset : offset + needle.length;
}

function classifyFixtureIssues(input: {
  readonly caretRect: Rect;
  readonly selectionRects: readonly Rect[];
}): readonly string[] {
  const issues: string[] = [];
  if (input.caretRect.height <= 0 || !Number.isFinite(input.caretRect.x)) {
    issues.push("caret-geometry");
  }
  if (input.selectionRects.length === 0) {
    issues.push("selection-empty");
  }
  if (input.selectionRects.some((rect) => rect.width <= 0 || rect.height <= 0)) {
    issues.push("selection-geometry");
  }
  return issues;
}
