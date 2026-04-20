import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import { createInMemoryEditorDocumentState, createSelectionGeometry } from "../src/index.ts";

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
});
