import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import { applyInputIntent, createInMemoryEditorDocumentState } from "../src/index.ts";

installNodeCanvas();

describe("applyInputIntent", () => {
  it("inserts text by replacing the current source selection", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    const result = applyInputIntent(editor, {
      type: "insert-text",
      text: "Premark",
    });

    expect(result.type).toBe("edit");
    expect(editor.markdown).toBe("Hello Premark");
    expect(editor.selectionSourceRange).toEqual({
      from: worldFrom + "Premark".length,
      to: worldFrom + "Premark".length,
    });
  });

  it("deletes selected source across blocks", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    const firstInside = editor.markdown.indexOf("st");
    const secondInside = editor.markdown.indexOf("Second") + "Sec".length;
    editor.setSelection(firstInside, secondInside);

    applyInputIntent(editor, {
      type: "delete",
      direction: "backward",
    });

    expect(editor.markdown).toBe("Firond");
    expect(editor.selectionSourceRange).toEqual({
      from: firstInside,
      to: firstInside,
    });
  });

  it("deletes backward and forward by grapheme cluster", () => {
    const text = "A👨‍👩‍👧‍👦B";
    const editor = createInMemoryEditorDocumentState(text, 600);
    editor.setSelection(text.length - 1, text.length - 1);

    applyInputIntent(editor, {
      type: "delete",
      direction: "backward",
    });

    expect(editor.markdown).toBe("AB");
    expect(editor.selectionSourceRange).toEqual({ from: 1, to: 1 });

    applyInputIntent(editor, {
      type: "delete",
      direction: "forward",
    });

    expect(editor.markdown).toBe("A");
    expect(editor.selectionSourceRange).toEqual({ from: 1, to: 1 });
  });

  it("inserts paragraph source for Enter-style input", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const split = editor.markdown.indexOf("world");
    editor.setSelection(split, split);

    applyInputIntent(editor, { type: "insert-paragraph" });

    expect(editor.markdown).toBe("Hello \n\nworld");
    expect(editor.selectionSourceRange).toEqual({
      from: split + 2,
      to: split + 2,
    });
  });

  it("applies browser selection-change intents to the editor model", () => {
    const editor = createInMemoryEditorDocumentState("abcdef", 600);

    applyInputIntent(editor, {
      type: "selection-change",
      anchor: 5,
      head: 2,
    });

    expect(editor.selectionSourceRange).toEqual({ from: 2, to: 5 });
    expect(editor.selection.direction).toBe("backward");
  });

  it("applies composition update virtually and commits source text", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    applyInputIntent(editor, { type: "composition-start" });
    const update = applyInputIntent(editor, {
      type: "composition-update",
      text: "shi",
    });

    expect(update.type).toBe("composition-update");
    expect(editor.markdown).toBe("Hello world");

    const commit = applyInputIntent(editor, {
      type: "composition-commit",
      text: "世界",
    });

    expect(commit.type).toBe("composition-commit");
    expect(editor.markdown).toBe("Hello 世界");
    expect(editor.selectionSourceRange).toEqual({
      from: worldFrom + "世界".length,
      to: worldFrom + "世界".length,
    });
  });
});
