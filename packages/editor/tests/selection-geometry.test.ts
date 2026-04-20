import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import { createInMemoryEditorDocumentState, createSelectionGeometry } from "../src/index.ts";

installNodeCanvas();

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
});
