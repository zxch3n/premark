import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { createLayoutEngine } from "@pretext-md/layout";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import {
  createActiveMarkerRevealMarkdown,
  createEditableLayoutIndex,
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
} from "../src/index.ts";

installNodeCanvas();

function expectCloseTo(actual: number, expected: number, threshold = 0.75): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(threshold);
}

describe("createSelectionGeometry", () => {
  it("returns a visible caret for collapsed selections", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldMiddle = editor.markdown.indexOf("world") + 2;
    editor.setSelection(worldMiddle, worldMiddle);

    const geometry = createSelectionGeometry(editor);

    expect(geometry.isCollapsed).toBe(true);
    expect(geometry.direction).toBe("collapsed");
    expect(geometry.caret?.offset).toBe(worldMiddle);
    expect(geometry.caret?.rect.height).toBeGreaterThan(0);
    expect(geometry.selectionRects).toEqual([]);
  });

  it("keeps forward selection direction while producing normalized rects", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldFrom = editor.markdown.indexOf("world");
    const worldTo = worldFrom + "world".length;
    editor.setSelection(worldFrom, worldTo);

    const geometry = createSelectionGeometry(editor);

    expect(geometry.direction).toBe("forward");
    expect(geometry.anchorOffset).toBe(worldFrom);
    expect(geometry.headOffset).toBe(worldTo);
    expect(geometry.range).toEqual({ from: worldFrom, to: worldTo });
    expect(geometry.caret).toBeNull();
    expect(geometry.selectionRects.length).toBeGreaterThan(0);
    expect(geometry.selectionRects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
  });

  it("keeps backward selection direction while sharing the same selected source range", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldFrom = editor.markdown.indexOf("world");
    const worldTo = worldFrom + "world".length;
    editor.setSelection(worldTo, worldFrom);

    const geometry = createSelectionGeometry(editor);

    expect(geometry.direction).toBe("backward");
    expect(geometry.anchorOffset).toBe(worldTo);
    expect(geometry.headOffset).toBe(worldFrom);
    expect(geometry.range).toEqual({ from: worldFrom, to: worldTo });
    expect(geometry.selectionRects.length).toBeGreaterThan(0);
  });

  it("creates multi-rect geometry for cross-block selections", () => {
    const editor = createInMemoryEditorDocumentState("First paragraph\n\nSecond paragraph", 160);
    const firstInside = editor.markdown.indexOf("paragraph");
    const secondInside = editor.markdown.indexOf("Second") + "Second".length;
    editor.setSelection(firstInside, secondInside);

    const geometry = createSelectionGeometry(editor);

    expect(geometry.isCollapsed).toBe(false);
    expect(geometry.range).toEqual({
      from: firstInside,
      to: secondInside,
    });
    expect(geometry.selectionRects.length).toBeGreaterThanOrEqual(2);
    expect(new Set(geometry.selectionRects.map((rect) => rect.y)).size).toBeGreaterThanOrEqual(2);
  });

  it("matches single-line selection rect edges to caret positions within a strict threshold", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world** after", 600);
    const worldFrom = editor.markdown.indexOf("world");
    const worldTo = worldFrom + "world".length;
    editor.setSelection(worldFrom, worldTo);

    const geometry = createSelectionGeometry(editor);
    const [rect] = geometry.selectionRects;
    expect(rect).toBeDefined();

    const startCaret = editor.editableIndex.sourceOffsetToCaretRect(worldFrom);
    const endCaret = editor.editableIndex.sourceOffsetToCaretRect(worldTo);
    expectCloseTo(rect!.x, startCaret.rect.x);
    expectCloseTo(rect!.x + rect!.width, endCaret.rect.x);
    expectCloseTo(rect!.y, startCaret.rect.y);
    expectCloseTo(rect!.height, startCaret.rect.height);
  });

  it("matches code-block selection rect edges to caret positions within a strict threshold", () => {
    const markdown = ["```ts", "const x = 1;", "```"].join("\n");
    const editor = createInMemoryEditorDocumentState(markdown, 600);
    const codeFrom = editor.markdown.indexOf("const x");
    const codeTo = editor.markdown.indexOf("1;") + "1;".length;
    editor.setSelection(codeFrom, codeTo);

    const geometry = createSelectionGeometry(editor);
    const [rect] = geometry.selectionRects;
    expect(rect).toBeDefined();

    const startCaret = editor.editableIndex.sourceOffsetToCaretRect(codeFrom);
    const endCaret = editor.editableIndex.sourceOffsetToCaretRect(codeTo);
    expectCloseTo(rect!.x, startCaret.rect.x);
    expectCloseTo(rect!.x + rect!.width, endCaret.rect.x);
    expectCloseTo(rect!.y, startCaret.rect.y);
    expectCloseTo(rect!.height, startCaret.rect.height);
  });

  it("keeps wrapped selection rects aligned to start and end caret edges", () => {
    const markdown = "Alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const editor = createInMemoryEditorDocumentState(markdown, 160);
    const from = markdown.indexOf("beta");
    const to = markdown.indexOf("theta") + "theta".length;
    editor.setSelection(from, to);

    const geometry = createSelectionGeometry(editor);
    expect(geometry.selectionRects.length).toBeGreaterThan(1);

    const first = geometry.selectionRects[0]!;
    const last = geometry.selectionRects.at(-1)!;
    const startCaret = editor.editableIndex.sourceOffsetToCaretRect(from);
    const endCaret = editor.editableIndex.sourceOffsetToCaretRect(to);
    expectCloseTo(first.x, startCaret.rect.x);
    expectCloseTo(first.y, startCaret.rect.y);
    expectCloseTo(last.x + last.width, endCaret.rect.x);
    expectCloseTo(last.y, endCaret.rect.y);
    expect(geometry.selectionRects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
  });

  it("uses the active render-view index when Markdown controls are revealed", () => {
    const markdown = "# Native rendered Markdown";
    const editor = createInMemoryEditorDocumentState(markdown, 720);
    editor.setSelection(0, 0);
    const parseState = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(parseState);
    const reveal = createActiveMarkerRevealMarkdown({
      markdown,
      inlineSources,
      blockSpans: parseState.blockSpans,
      selectionRange: { from: 0, to: 0 },
    });
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(reveal.markdown, 720);
    const activeIndex = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: parseState.blockSpans,
      inlineSources,
      sourceMap: reveal.sourceMap,
    });

    const activeGeometry = createSelectionGeometry(editor, activeIndex);
    editor.setSelection(1, 1);
    const activeOffsetOne = createSelectionGeometry(editor, activeIndex);
    editor.setSelection(markdown.indexOf("Native"), markdown.indexOf("Native"));
    const activeTitleStart = createSelectionGeometry(editor, activeIndex);

    expect(activeOffsetOne.headCaret.rect.x).toBeGreaterThan(activeGeometry.headCaret.rect.x);
    expect(activeTitleStart.headCaret.rect.x).toBeGreaterThan(activeOffsetOne.headCaret.rect.x);
  });

  it("keeps collapsed caret geometry at the previous visual line end on wrap boundaries", () => {
    const editor = createInMemoryEditorDocumentState(
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa",
      160,
    );
    const firstLineEnd = editor.editableIndex.fragments[0]!.sourceRange.to;
    const firstLine = editor.editableIndex.fragments[0]!;
    const secondLine = editor.editableIndex.fragments[1]!;
    editor.setSelection(firstLineEnd, firstLineEnd);

    const geometry = createSelectionGeometry(editor);
    const afterCaret = editor.editableIndex.sourceOffsetToCaretRect(firstLineEnd, "after");

    expect(firstLine.sourceRange.to).toBe(secondLine.sourceRange.from);
    expect(geometry.headCaret.rect.y).toBe(firstLine.rect.y);
    expect(geometry.headCaret.rect.x).toBeCloseTo(firstLine.rect.x + firstLine.rect.width, 0);
    expect(afterCaret.rect.y).toBe(secondLine.rect.y);
    expect(afterCaret.rect.x).toBeCloseTo(secondLine.rect.x, 0);
  });

  it("keeps collapsed caret geometry on explicit blank visual lines", () => {
    const editor = createInMemoryEditorDocumentState("abc\n\ndef", 600);
    const firstLine = editor.editableIndex.fragments.find((fragment) => fragment.text === "abc")!;
    const blankLine = editor.editableIndex.fragments.find(
      (fragment) => fragment.sourceRange.from === 4,
    )!;
    const secondLine = editor.editableIndex.fragments.find((fragment) => fragment.text === "def")!;
    editor.setSelection(editor.markdown.indexOf("\n") + 1, editor.markdown.indexOf("\n") + 1);

    const geometry = createSelectionGeometry(editor);

    expect(geometry.headCaret.fragment).toBe(blankLine);
    expect(geometry.headCaret.rect.y).toBe(firstLine.rect.y + firstLine.rect.height);
    expect(geometry.headCaret.rect.x).toBe(0);
    expect(
      editor.editableIndex.sourceOffsetToCaretRect(editor.markdown.indexOf("def")).fragment,
    ).toBe(secondLine);
  });
});
