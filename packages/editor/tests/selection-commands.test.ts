import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyKeyboardSelectionIntent,
  beginPointerSelection,
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
  selectPointerRange,
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

  it("snaps pointer hit-test offsets to grapheme boundaries", () => {
    const text = "A 👨‍👩‍👧‍👦 B";
    const editor = createInMemoryEditorDocumentState(text, 600);
    const emojiFrom = text.indexOf("👨");
    const emojiTo = emojiFrom + "👨‍👩‍👧‍👦".length;
    const insideEmoji = editor.editableIndex.sourceOffsetToCaretRect(emojiFrom + 2);

    beginPointerSelection(editor, insideEmoji.rect.x, insideEmoji.rect.y + 1);

    expect([emojiFrom, emojiTo]).toContain(editor.selectionSourceRange.from);
  });

  it("selects word and block ranges from pointer granularity", () => {
    const markdown = "alpha beta gamma\n\n- list item text";
    const editor = createInMemoryEditorDocumentState(markdown, 600);
    const betaOffset = markdown.indexOf("beta");
    const betaCaret = editor.editableIndex.sourceOffsetToCaretRect(betaOffset + 1);

    selectPointerRange(editor, betaCaret.rect.x, betaCaret.rect.y + 1, "word");
    expect(createSelectionGeometry(editor).range).toEqual({
      from: betaOffset,
      to: betaOffset + "beta".length,
    });

    const listOffset = markdown.indexOf("list item");
    const listCaret = editor.editableIndex.sourceOffsetToCaretRect(listOffset);
    selectPointerRange(editor, listCaret.rect.x, listCaret.rect.y + 1, "block");
    expect(createSelectionGeometry(editor).range).toEqual({
      from: markdown.indexOf("- list item text"),
      to: markdown.length,
    });
  });

  it("selects CJK, emoji, link labels and inline code from word pointer granularity", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const markdown = `Try 中文输入 ${emoji}, [docs](https://example.com), and \`inline code\`.`;
    const editor = createInMemoryEditorDocumentState(markdown, 600);

    const cjkFrom = markdown.indexOf("中文输入");
    selectPointerRangeInsideSourceRange(editor, cjkFrom, cjkFrom + "中文输入".length, "word");
    expect(editor.selectionSourceRange.from).toBeGreaterThanOrEqual(cjkFrom);
    expect(editor.selectionSourceRange.to).toBeLessThanOrEqual(cjkFrom + "中文输入".length);
    expect(editor.selectionSourceRange.to).toBeGreaterThan(editor.selectionSourceRange.from);

    const emojiFrom = markdown.indexOf(emoji);
    selectPointerRangeInsideSourceRange(editor, emojiFrom, emojiFrom + emoji.length, "word");
    expect(editor.selectionSourceRange).toEqual({
      from: emojiFrom,
      to: emojiFrom + emoji.length,
    });

    const docsFrom = markdown.indexOf("docs");
    selectPointerRangeInsideSourceRange(editor, docsFrom, docsFrom + "docs".length, "word");
    expect(editor.selectionSourceRange).toEqual({
      from: docsFrom,
      to: docsFrom + "docs".length,
    });

    const inlineFrom = markdown.indexOf("inline code");
    selectPointerRangeInsideSourceRange(editor, inlineFrom, inlineFrom + "inline".length, "word");
    expect(editor.selectionSourceRange).toEqual({
      from: inlineFrom,
      to: inlineFrom + "inline".length,
    });
  });

  it("selects the hit emoji grapheme for word granularity even near trailing punctuation", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const markdown = `emoji ${emoji}.`;
    const editor = createInMemoryEditorDocumentState(markdown, 600);
    const emojiFrom = markdown.indexOf(emoji);
    const emojiTo = emojiFrom + emoji.length;
    const fromCaret = editor.editableIndex.sourceOffsetToCaretRect(emojiFrom);
    const toCaret = editor.editableIndex.sourceOffsetToCaretRect(emojiTo, "before");

    const hit = editor.editableIndex.hitTestSourceRange(
      fromCaret.rect.x + (toCaret.rect.x - fromCaret.rect.x) * 0.75,
      fromCaret.rect.y + fromCaret.rect.height / 2,
      "word",
    );

    expect(hit.range).toEqual({
      from: emojiFrom,
      to: emojiTo,
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

    editor.setSelection(4, 4);
    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowLeft",
      by: "character",
      extend: true,
    });

    const backwardGeometry = createSelectionGeometry(editor);
    expect(backwardGeometry.anchorOffset).toBe(4);
    expect(backwardGeometry.headOffset).toBe(3);
    expect(backwardGeometry.range).toEqual({ from: 3, to: 4 });
  });

  it("moves by word and line boundary granularities", () => {
    const text = "alpha beta gamma\nsecond line";
    const editor = createInMemoryEditorDocumentState(text, 600);
    editor.setSelection(text.indexOf("beta") + 2, text.indexOf("beta") + 2);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowLeft",
      by: "word",
      extend: false,
    });

    expect(editor.selectionSourceRange).toEqual({
      from: text.indexOf("beta"),
      to: text.indexOf("beta"),
    });

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "End",
      by: "line-boundary",
      extend: true,
    });

    const geometry = createSelectionGeometry(editor);
    expect(geometry.anchorOffset).toBe(text.indexOf("beta"));
    expect(geometry.headOffset).toBe(
      editor.editableIndex.sourceLineRangeAtOffset(text.indexOf("beta")).to,
    );

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "Home",
      by: "line-boundary",
      extend: false,
    });

    expect(editor.selectionSourceRange).toEqual({
      from: editor.editableIndex.sourceLineRangeAtOffset(text.indexOf("beta")).from,
      to: editor.editableIndex.sourceLineRangeAtOffset(text.indexOf("beta")).from,
    });
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

  it("moves vertically to short and blank adjacent lines by clamping the target x", () => {
    const markdown = "short\n\nThis is a much much longer line";
    const editor = createInMemoryEditorDocumentState(markdown, 600);
    const longLineEnd = markdown.length;
    editor.setSelection(longLineEnd, longLineEnd);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowUp",
      by: "line",
      extend: false,
    });

    expect(editor.selectionSourceRange).toEqual({
      from: markdown.indexOf("\n\n") + 1,
      to: markdown.indexOf("\n\n") + 1,
    });

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "ArrowUp",
      by: "line",
      extend: false,
    });

    expect(editor.selectionSourceRange.from).toBeGreaterThanOrEqual(0);
    expect(editor.selectionSourceRange.from).toBeLessThanOrEqual("short".length);
  });

  it("moves by page granularity", () => {
    const editor = createInMemoryEditorDocumentState(
      Array.from({ length: 18 }, (_, index) => `Line ${index + 1} with text`).join("\n\n"),
      240,
    );
    editor.setSelection(0, 0);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "PageDown",
      by: "page",
      extend: false,
    });

    const pageDownOffset = editor.selectionSourceRange.from;
    expect(pageDownOffset).toBeGreaterThan(0);

    applyKeyboardSelectionIntent(editor, {
      type: "keyboard-selection",
      key: "PageUp",
      by: "page",
      extend: false,
    });

    expect(editor.selectionSourceRange.from).toBeLessThan(pageDownOffset);
  });
});

function selectPointerRangeInsideSourceRange(
  editor: ReturnType<typeof createInMemoryEditorDocumentState>,
  from: number,
  to: number,
  granularity: "word" | "block",
): void {
  const fromCaret = editor.editableIndex.sourceOffsetToCaretRect(from);
  const toCaret = editor.editableIndex.sourceOffsetToCaretRect(to, "before");
  selectPointerRange(
    editor,
    (fromCaret.rect.x + toCaret.rect.x) / 2,
    (fromCaret.rect.y + toCaret.rect.y) / 2 + fromCaret.rect.height / 2,
    granularity,
  );
}
