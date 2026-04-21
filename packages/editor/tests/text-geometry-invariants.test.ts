import { createLayoutEngine, measureGraphemeBoundaryXs } from "@pretext-md/layout";
import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import {
  createActiveMarkerRevealMarkdown,
  createEditableLayoutIndex,
  createGraphemeSegments,
  createInMemoryEditorDocumentState,
  type EditableFragment,
  type EditableLayoutIndex,
} from "../src/index.ts";

installNodeCanvas();

interface GeometryFixture {
  readonly name: string;
  readonly markdown: string;
  readonly width?: number;
  readonly activeNeedle?: string;
}

const geometryFixtures: readonly GeometryFixture[] = [
  { name: "latin", markdown: "alpha beta gamma" },
  { name: "variable-width", markdown: "iiiiiiii WWWW done" },
  { name: "cjk", markdown: "中文输入，标点。かなカナ" },
  { name: "repeated emoji zwj", markdown: "👨‍👩‍👧‍👦".repeat(7), width: 900 },
  { name: "flags", markdown: "flags 🇺🇸🇯🇵🇨🇳 done" },
  { name: "skin tones", markdown: "tones 👍🏽👍🏻👍🏿 done" },
  { name: "combining marks", markdown: "combining e\u0301 a\u0308 n\u0303 done" },
  { name: "variation selector", markdown: "symbols ♥️ ♦️ ☺️ done" },
  { name: "zero width space", markdown: "zero a\u200Bb done" },
  { name: "inline code", markdown: "Try `code()` now" },
  { name: "hidden link", markdown: "Open [docs](https://example.com) now" },
  { name: "source newlines", markdown: "abc\n\n👨‍👩‍👧‍👦\nlast", width: 320 },
  { name: "code block", markdown: "```ts\nconst y = 1;\n```" },
  { name: "revealed heading markers", markdown: "### Heading", activeNeedle: "Heading" },
  { name: "revealed strong controls", markdown: "Try **bold** now", activeNeedle: "bold" },
  {
    name: "revealed link suffix",
    markdown: "Open [docs](https://example.com) now",
    activeNeedle: "docs",
  },
];

function createFixtureIndex(fixture: GeometryFixture): {
  readonly index: EditableLayoutIndex;
  readonly markdown: string;
} {
  const state = createIncrementalParseState(fixture.markdown);
  const inlineSources = createMarkdownInlineSourceMap(state);
  const engine = createLayoutEngine({ fontTheme: "github", lineBreakMode: "source" });
  const width = fixture.width ?? 720;

  if (fixture.activeNeedle !== undefined) {
    const activeOffset = fixture.markdown.indexOf(fixture.activeNeedle);
    expect(activeOffset, fixture.name).toBeGreaterThanOrEqual(0);
    const reveal = createActiveMarkerRevealMarkdown({
      markdown: fixture.markdown,
      inlineSources,
      blockSpans: state.blockSpans,
      selectionRange: { from: activeOffset, to: activeOffset },
    });
    const layout = engine.layout(reveal.markdown, width);
    return {
      markdown: fixture.markdown,
      index: createEditableLayoutIndex({
        markdown: fixture.markdown,
        layout,
        blockSpans: state.blockSpans,
        inlineSources,
        sourceMap: reveal.sourceMap,
      }),
    };
  }

  const layout = engine.layout(fixture.markdown, width);
  return {
    markdown: fixture.markdown,
    index: createEditableLayoutIndex({
      markdown: fixture.markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    }),
  };
}

function visibleTextWidth(fragment: EditableFragment): number {
  return Math.max(0, fragment.rect.width - fragment.textInsetX * 2);
}

function sourceOffsetAtTextOffset(fragment: EditableFragment, textOffset: number): number {
  const bounded = Math.min(Math.max(textOffset, 0), fragment.sourceOffsets.length - 1);
  return fragment.sourceOffsets[bounded] ?? fragment.sourceRange.from;
}

function boundaryXs(fragment: EditableFragment): readonly number[] {
  const measured = measureGraphemeBoundaryXs(
    fragment.text,
    fragment.font,
    fragment.type === "inline_code" || fragment.type === "code_block"
      ? { whiteSpace: "pre-wrap" }
      : undefined,
  );
  return measured.map((x) => fragment.rect.x + fragment.textInsetX + x);
}

function closeToSameLine(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

function expectCaretAtBoundary(
  index: EditableLayoutIndex,
  fragment: EditableFragment,
  sourceOffset: number,
  textOffset: number,
  affinity: "before" | "after",
  label: string,
): void {
  const caret = index.sourceOffsetToCaretRect(sourceOffset, affinity);
  const xs = boundaryXs(fragment);
  const expectedX = xs[textOffset] ?? fragment.rect.x;
  expect(caret.rect.x, `${label} caret x`).toBeCloseTo(expectedX, 5);
  expect(caret.rect.y, `${label} caret y`).toBeCloseTo(fragment.rect.y, 5);
}

function expectSelectionCoversBoundary(
  index: EditableLayoutIndex,
  fragment: EditableFragment,
  fromSource: number,
  toSource: number,
  fromTextOffset: number,
  toTextOffset: number,
  label: string,
): void {
  const xs = boundaryXs(fragment);
  const expectedX = xs[fromTextOffset] ?? fragment.rect.x;
  const expectedEndX = xs[toTextOffset] ?? expectedX;
  if (Math.abs(expectedEndX - expectedX) < 0.1 || fromSource === toSource) {
    return;
  }

  const rects = index.sourceRangeToSelectionRects({
    from: Math.min(fromSource, toSource),
    to: Math.max(fromSource, toSource),
  });
  const rect = rects.find((candidate) => closeToSameLine(candidate.y, fragment.rect.y));
  expect(rect, `${label} selection rect`).toBeDefined();
  expect(rect!.x, `${label} selection x`).toBeCloseTo(Math.min(expectedX, expectedEndX), 5);
  expect(rect!.width, `${label} selection width`).toBeCloseTo(
    Math.abs(expectedEndX - expectedX),
    5,
  );
}

function assertFragmentGeometry(index: EditableLayoutIndex, fragment: EditableFragment): void {
  if (fragment.text.length === 0) {
    return;
  }
  expect(fragment.sourceOffsets, fragment.text).toHaveLength(fragment.text.length + 1);

  const xs = boundaryXs(fragment);
  const measuredWidth = measureGraphemeBoundaryXs(
    fragment.text,
    fragment.font,
    fragment.type === "inline_code" || fragment.type === "code_block"
      ? { whiteSpace: "pre-wrap" }
      : undefined,
  ).at(-1);
  expect(visibleTextWidth(fragment), `${fragment.text} visible width`).toBeCloseTo(
    measuredWidth ?? 0,
    5,
  );
  for (const segment of createGraphemeSegments(fragment.text)) {
    const fromSource = sourceOffsetAtTextOffset(fragment, segment.from);
    const toSource = sourceOffsetAtTextOffset(fragment, segment.to);
    const label = `${fragment.text} ${segment.from}-${segment.to}`;

    expectCaretAtBoundary(index, fragment, fromSource, segment.from, "after", `${label} start`);
    expectCaretAtBoundary(index, fragment, toSource, segment.to, "before", `${label} end`);
    expectSelectionCoversBoundary(
      index,
      fragment,
      fromSource,
      toSource,
      segment.from,
      segment.to,
      label,
    );

    const startX = xs[segment.from] ?? fragment.rect.x;
    const endX = xs[segment.to] ?? startX;
    if (Math.abs(endX - startX) < 0.1) {
      continue;
    }
    const hit = index.hitTest((startX + endX) / 2, fragment.rect.y + fragment.rect.height / 2);
    expect([fromSource, toSource], `${label} hit offset`).toContain(hit.offset);
  }
}

describe("text geometry invariants", () => {
  it("keeps caret, hit-test, and selection rects on one boundary model", () => {
    for (const fixture of geometryFixtures) {
      const { index } = createFixtureIndex(fixture);
      expect(index.fragments.length, fixture.name).toBeGreaterThan(0);
      for (const fragment of index.fragments) {
        assertFragmentGeometry(index, fragment);
      }
    }
  });

  it("does not hit-test hidden Markdown controls in the hidden-marker view", () => {
    const markdown = "Try **bold** and [docs](https://example.com) now";
    const { index } = createFixtureIndex({ name: "hidden controls", markdown });
    const hiddenRanges = [
      { from: markdown.indexOf("**"), to: markdown.indexOf("bold") },
      { from: markdown.indexOf("bold") + "bold".length, to: markdown.indexOf("** and") + 2 },
      { from: markdown.indexOf("[docs]"), to: markdown.indexOf("docs") },
      {
        from: markdown.indexOf("](https://example.com)"),
        to: markdown.indexOf("](https://example.com)") + "](https://example.com)".length,
      },
    ];

    for (const text of ["bold", "docs"]) {
      const fragment = index.fragments.find((candidate) => candidate.text === text);
      expect(fragment, text).toBeDefined();
      const hit = index.hitTest(
        fragment!.rect.x + fragment!.rect.width / 2,
        fragment!.rect.y + fragment!.rect.height / 2,
      );
      expect(
        hiddenRanges.some((range) => hit.offset > range.from && hit.offset < range.to),
        `${text} hit returned hidden marker offset ${hit.offset}`,
      ).toBe(false);
    }
  });

  it("rebuilds geometry after active reveal switches and layout resize", () => {
    const markdown = "Try **bold** now";
    const markerStart = markdown.indexOf("**");
    const hidden = createFixtureIndex({ name: "hidden", markdown }).index;
    const hiddenMarker = hidden.sourceOffsetToCaretRect(markerStart + 1, "before");

    const active = createFixtureIndex({
      name: "active",
      markdown,
      activeNeedle: "bold",
    }).index;
    const activeOpenStart = active.sourceOffsetToCaretRect(markerStart, "after");
    const activeOpenMiddle = active.sourceOffsetToCaretRect(markerStart + 1, "after");
    const activeOpenEnd = active.sourceOffsetToCaretRect(markerStart + 2, "before");
    expect(activeOpenMiddle.rect.x).toBeGreaterThan(activeOpenStart.rect.x);
    expect(activeOpenEnd.rect.x).toBeGreaterThan(activeOpenMiddle.rect.x);

    const hiddenAgain = createFixtureIndex({ name: "hidden again", markdown }).index;
    expect(hiddenAgain.sourceOffsetToCaretRect(markerStart + 1, "before").rect.x).toBeCloseTo(
      hiddenMarker.rect.x,
      5,
    );

    const wrappingMarkdown = "alpha beta gamma delta epsilon zeta eta theta WWWW suffix";
    const editor = createInMemoryEditorDocumentState(wrappingMarkdown, 720, {
      fontTheme: "github",
    });
    const targetOffset = wrappingMarkdown.indexOf("WWWW");
    const wideCaret = editor.editableIndex.sourceOffsetToCaretRect(targetOffset);
    editor.resize(140);
    const narrowCaret = editor.editableIndex.sourceOffsetToCaretRect(targetOffset);
    expect(narrowCaret.rect.y).toBeGreaterThan(wideCaret.rect.y);
  });
});
