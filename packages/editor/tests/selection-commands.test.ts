import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyKeyboardSelectionIntent,
  beginPointerSelection,
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
  updatePointerSelection,
} from "../src/index.ts";

installNodeCanvas();

describe("selection commands", () => {
  it("updates source selection from pointer drag and drag reversal", () => {
    const editor = createInMemoryEditorDocumentState("First paragraph\n\nSecond paragraph", 600);
    const firstOffset = editor.markdown.indexOf("paragraph");
    const secondOffset = editor.markdown.indexOf("Second") + "Second".length;
    const firstCaret = editor.editableIndex.sourceOffsetToCaretRect(firstOffset);
    const secondCaret = editor.editableIndex.sourceOffsetToCaretRect(secondOffset);

    const session = beginPointerSelection(editor, firstCaret.rect.x, firstCaret.rect.y + 1);
    updatePointerSelection(editor, session, secondCaret.rect.x, secondCaret.rect.y + 1);

    expect(createSelectionGeometry(editor).range).toEqual({
      from: firstOffset,
      to: secondOffset,
    });

    const reverseSession = beginPointerSelection(
      editor,
      secondCaret.rect.x,
      secondCaret.rect.y + 1,
    );
    updatePointerSelection(editor, reverseSession, firstCaret.rect.x, firstCaret.rect.y + 1);
    const reversed = createSelectionGeometry(editor);

    expect(reversed.direction).toBe("backward");
    expect(reversed.range).toEqual({
      from: firstOffset,
      to: secondOffset,
    });
  });

  it("moves by grapheme clusters for ArrowLeft and ArrowRight", () => {
    const text = "A👨‍👩‍👧‍👦B";
    const editor = createInMemoryEditorDocumentState(text, 600);
    editor.setSelection(1, 1);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowRight",
      by: "character",
      extend: false,
    });

    expect(editor.selectionSourceRange).toEqual({
      from: text.length - 1,
      to: text.length - 1,
    });

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowLeft",
      by: "character",
      extend: false,
    });

    expect(editor.selectionSourceRange).toEqual({ from: 1, to: 1 });
  });

  it("extends selection for Shift+Arrow without moving the anchor", () => {
    const editor = createInMemoryEditorDocumentState("abcdef", 600);
    editor.setSelection(2, 2);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowRight",
      by: "character",
      extend: true,
    });
    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowRight",
      by: "character",
      extend: true,
    });

    const geometry = createSelectionGeometry(editor);
    expect(geometry.anchorOffset).toBe(2);
    expect(geometry.headOffset).toBe(4);
    expect(geometry.range).toEqual({ from: 2, to: 4 });
  });

  it("moves to document boundaries for Shift+Command+Arrow style intents", () => {
    const editor = createInMemoryEditorDocumentState("abcdef", 600);
    editor.setSelection(2, 2);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowDown",
      by: "document-boundary",
      extend: true,
    });

    const geometry = createSelectionGeometry(editor);
    expect(geometry.anchorOffset).toBe(2);
    expect(geometry.headOffset).toBe(editor.markdown.length);
    expect(geometry.range).toEqual({ from: 2, to: editor.markdown.length });
  });

  it("moves vertically through wrapped lines", () => {
    const editor = createInMemoryEditorDocumentState(
      "One two three four five six seven eight nine",
      110,
    );
    expect(editor.layout.lines.length).toBeGreaterThan(1);
    editor.setSelection(0, 0);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowDown",
      by: "line",
      extend: false,
    });

    expect(editor.selectionSourceRange.from).toBeGreaterThan(0);
  });
});
