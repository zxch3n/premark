import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyInputIntent,
  createInMemoryEditorDocumentState,
  LocalUndoManager,
} from "../src/index.ts";

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

  it("selects the full source for select-all intents", () => {
    const editor = createInMemoryEditorDocumentState("Hello\n\nworld", 600);
    editor.setSelection(2, 2);

    expect(applyInputIntent(editor, { type: "select-all" })).toEqual({ type: "selection" });
    expect(editor.selectionSourceRange).toEqual({
      from: 0,
      to: editor.markdown.length,
    });
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

  it("cancels composition without changing source, selection, or undo history", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const undoManager = new LocalUndoManager();
    const worldFrom = editor.markdown.indexOf("world");
    const worldTo = worldFrom + "world".length;
    editor.setSelection(worldFrom, worldTo);

    applyInputIntent(editor, { type: "composition-start" }, { undoManager });
    const update = applyInputIntent(
      editor,
      {
        type: "composition-update",
        text: "shi",
      },
      { undoManager },
    );

    expect(update.type).toBe("composition-update");
    expect(editor.markdown).toBe("Hello world");
    expect(editor.compositionView?.virtualText).toBe("Hello shi");
    expect(undoManager.undoDepth).toBe(0);

    const cancel = applyInputIntent(editor, { type: "composition-cancel" }, { undoManager });

    expect(cancel).toEqual({ type: "composition-cancel" });
    expect(editor.markdown).toBe("Hello world");
    expect(editor.compositionView).toBeNull();
    expect(editor.selectionSourceRange).toEqual({ from: worldFrom, to: worldTo });
    expect(undoManager.undoDepth).toBe(0);
  });

  it("records text edits into the local undo manager and applies history intents", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const undoManager = new LocalUndoManager();
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    applyInputIntent(
      editor,
      {
        type: "insert-text",
        text: "Premark",
      },
      { undoManager },
    );

    expect(editor.markdown).toBe("Hello Premark");
    expect(undoManager.undoDepth).toBe(1);

    expect(applyInputIntent(editor, { type: "history", action: "undo" }, { undoManager })).toEqual({
      type: "history",
      action: "undo",
    });
    expect(editor.markdown).toBe("Hello world");
    expect(undoManager.redoDepth).toBe(1);

    expect(applyInputIntent(editor, { type: "history", action: "redo" }, { undoManager })).toEqual({
      type: "history",
      action: "redo",
    });
    expect(editor.markdown).toBe("Hello Premark");
  });

  it("records composition commits into the local undo manager", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const undoManager = new LocalUndoManager();
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    applyInputIntent(editor, { type: "composition-start" }, { undoManager });
    applyInputIntent(editor, { type: "composition-commit", text: "世界" }, { undoManager });

    expect(editor.markdown).toBe("Hello 世界");
    expect(undoManager.undoDepth).toBe(1);

    applyInputIntent(editor, { type: "history", action: "undo" }, { undoManager });

    expect(editor.markdown).toBe("Hello world");
  });

  it("pastes Markdown payloads before plain text and records undo", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const undoManager = new LocalUndoManager();
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    applyInputIntent(
      editor,
      {
        type: "clipboard",
        action: "paste",
        markdown: "**Premark**",
        plainText: "Premark",
      },
      { undoManager },
    );

    expect(editor.markdown).toBe("Hello **Premark**");
    expect(undoManager.undoDepth).toBe(1);
  });

  it("pastes plain text and simple HTML fallback payloads", () => {
    const editor = createInMemoryEditorDocumentState("A B C", 600);
    editor.setSelection(2, 3);

    applyInputIntent(editor, {
      type: "clipboard",
      action: "paste",
      plainText: "plain",
    });
    expect(editor.markdown).toBe("A plain C");

    editor.setSelection(2, 7);
    applyInputIntent(editor, {
      type: "clipboard",
      action: "paste",
      html: "<p>Hello<br>world</p>",
    });
    expect(editor.markdown).toBe("A Hello\nworld C");
  });

  it("cuts selected source through the same edit path", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const undoManager = new LocalUndoManager();
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    applyInputIntent(editor, { type: "clipboard", action: "cut" }, { undoManager });

    expect(editor.markdown).toBe("Hello ");
    expect(undoManager.undoDepth).toBe(1);
  });

  it("pastes over and cuts cross-block selections", () => {
    const editor = createInMemoryEditorDocumentState("First\n\nSecond", 600);
    const firstInside = editor.markdown.indexOf("st");
    const secondInside = editor.markdown.indexOf("Second") + "Sec".length;
    editor.setSelection(firstInside, secondInside);

    applyInputIntent(editor, {
      type: "clipboard",
      action: "paste",
      markdown: "Joined",
    });

    expect(editor.markdown).toBe("FirJoinedond");

    const joinedFrom = editor.markdown.indexOf("Joined");
    editor.setSelection(joinedFrom, joinedFrom + "Joined".length);
    applyInputIntent(editor, { type: "clipboard", action: "cut" });

    expect(editor.markdown).toBe("Firond");
  });
});
