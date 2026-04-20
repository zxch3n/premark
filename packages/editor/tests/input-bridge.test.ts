import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyTextareaBridgeChange,
  createInMemoryEditorDocumentState,
  createTextareaBridgeSnapshot,
  deriveTextareaBridgeEdit,
  sourceOffsetToTextareaOffset,
  textareaOffsetToSourceOffset,
} from "../src/index.ts";

installNodeCanvas();

describe("textarea input bridge", () => {
  it("mirrors the active block source and maps caret offsets", () => {
    const editor = createInMemoryEditorDocumentState("# Title\n\nHello **world**", 600);
    const blockText = "Hello **world**";
    const blockFrom = editor.markdown.indexOf(blockText);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom);

    const snapshot = createTextareaBridgeSnapshot(editor);

    expect(snapshot.mode).toBe("active-block");
    expect(snapshot.value).toBe(blockText);
    expect(snapshot.sourceRange).toEqual({
      from: blockFrom,
      to: blockFrom + blockText.length,
    });
    expect(snapshot.selectionStart).toBe(worldFrom - blockFrom);
    expect(snapshot.selectionEnd).toBe(worldFrom - blockFrom);
    expect(textareaOffsetToSourceOffset(snapshot, snapshot.selectionStart)).toBe(worldFrom);
    expect(sourceOffsetToTextareaOffset(snapshot, worldFrom)).toBe(snapshot.selectionStart);
  });

  it("preserves same-block selected ranges in textarea coordinates", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world** and `code`", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    const snapshot = createTextareaBridgeSnapshot(editor);

    expect(snapshot.mode).toBe("active-block");
    expect(snapshot.selectionStart).toBe(worldFrom);
    expect(snapshot.selectionEnd).toBe(worldFrom + "world".length);
    expect(snapshot.selectionSourceRange).toEqual({
      from: worldFrom,
      to: worldFrom + "world".length,
    });
  });

  it("keeps a collapsed caret at the next block start in active-block mode", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    const secondFrom = editor.markdown.indexOf("Second");
    editor.setSelection(secondFrom, secondFrom);

    const snapshot = createTextareaBridgeSnapshot(editor);

    expect(snapshot.mode).toBe("active-block");
    expect(snapshot.value).toBe("Second");
    expect(snapshot.selectionStart).toBe(0);
    expect(snapshot.sourceRange.from).toBe(secondFrom);
  });

  it("uses a minimal bridge value for cross-block selections", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    const firstInside = editor.markdown.indexOf("irst");
    const secondInside = editor.markdown.indexOf("Second") + "Sec".length;
    editor.setSelection(firstInside, secondInside);

    const snapshot = createTextareaBridgeSnapshot(editor);

    expect(snapshot.mode).toBe("cross-block");
    expect(snapshot.value).toBe("");
    expect(snapshot.selectionStart).toBe(0);
    expect(snapshot.selectionEnd).toBe(0);
    expect(snapshot.selectionSourceRange).toEqual({
      from: firstInside,
      to: secondInside,
    });
  });

  it("derives active-block textarea diffs as source edits", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);
    const snapshot = createTextareaBridgeSnapshot(editor);
    const nextValue = snapshot.value.replace("world", "Premark");

    const edit = deriveTextareaBridgeEdit(snapshot, nextValue);

    expect(edit).toEqual({
      sourceRange: {
        from: worldFrom,
        to: worldFrom + "world".length,
      },
      insert: "Premark",
    });
  });

  it("applies active-block textarea changes and restores the visible selection", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom + "world".length, worldFrom + "world".length);
    const snapshot = createTextareaBridgeSnapshot(editor);
    const nextValue = snapshot.value.replace("world", "Premark");
    const nextSelectionStart = nextValue.indexOf("Premark") + "Premark".length;

    const applied = applyTextareaBridgeChange(editor, snapshot, nextValue, {
      nextSelectionStart,
    });

    expect(applied?.change).toEqual({
      from: worldFrom,
      to: worldFrom + "world".length,
      insert: "Premark",
      deleted: "world",
    });
    expect(editor.markdown).toBe("Hello **Premark**");
    expect(editor.selectionSourceRange).toEqual({
      from: worldFrom + "Premark".length,
      to: worldFrom + "Premark".length,
    });
  });

  it("replaces cross-block selections through the editor source selection", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    editor.setSelection(0, editor.markdown.length);
    const snapshot = createTextareaBridgeSnapshot(editor);

    applyTextareaBridgeChange(editor, snapshot, "Joined");

    expect(editor.markdown).toBe("Joined");
    expect(editor.selectionSourceRange).toEqual({
      from: "Joined".length,
      to: "Joined".length,
    });
  });

  it("deletes cross-block selections when the bridge input commits an empty value", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    const firstInside = editor.markdown.indexOf("st");
    const secondInside = editor.markdown.indexOf("Second") + "Sec".length;
    editor.setSelection(firstInside, secondInside);
    const snapshot = createTextareaBridgeSnapshot(editor);

    applyTextareaBridgeChange(editor, snapshot, "");

    expect(editor.markdown).toBe("Firond");
    expect(editor.selectionSourceRange).toEqual({
      from: firstInside,
      to: firstInside,
    });
  });
});
