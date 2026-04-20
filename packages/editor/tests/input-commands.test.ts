import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyInputIntent,
  createInMemoryEditorDocumentState,
  LocalUndoManager,
  normalizeInputTrace,
  toggleTaskCheckbox,
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

  it("inserts one source newline for Enter-style input", () => {
    const editor = createInMemoryEditorDocumentState("Hello world", 600);
    const split = editor.markdown.indexOf("world");
    editor.setSelection(split, split);

    applyInputIntent(editor, { type: "insert-paragraph" });

    expect(editor.markdown).toBe("Hello \nworld");
    expect(editor.selectionSourceRange).toEqual({
      from: split + 1,
      to: split + 1,
    });
  });

  it("continues unordered, ordered and task list items on Enter", () => {
    const unordered = createInMemoryEditorDocumentState("- one", 600);
    unordered.setSelection(unordered.markdown.length, unordered.markdown.length);

    applyInputIntent(unordered, { type: "insert-paragraph" });

    expect(unordered.markdown).toBe("- one\n- ");
    expect(unordered.selectionSourceRange).toEqual({
      from: unordered.markdown.length,
      to: unordered.markdown.length,
    });

    const ordered = createInMemoryEditorDocumentState("7. seven", 600);
    ordered.setSelection(ordered.markdown.length, ordered.markdown.length);

    applyInputIntent(ordered, { type: "insert-paragraph" });

    expect(ordered.markdown).toBe("7. seven\n8. ");

    const task = createInMemoryEditorDocumentState("- [x] done", 600);
    task.setSelection(task.markdown.length, task.markdown.length);

    applyInputIntent(task, { type: "insert-paragraph" });

    expect(task.markdown).toBe("- [x] done\n- [ ] ");
  });

  it("exits empty list and blockquote items on Enter", () => {
    const list = createInMemoryEditorDocumentState("Before\n- \nAfter", 600);
    const listCaret = list.markdown.indexOf("- ") + "- ".length;
    list.setSelection(listCaret, listCaret);

    applyInputIntent(list, { type: "insert-paragraph" });

    expect(list.markdown).toBe("Before\n\nAfter");
    expect(list.selectionSourceRange).toEqual({
      from: "Before\n".length,
      to: "Before\n".length,
    });

    const quote = createInMemoryEditorDocumentState("> ", 600);
    quote.setSelection(quote.markdown.length, quote.markdown.length);

    applyInputIntent(quote, { type: "insert-paragraph" });

    expect(quote.markdown).toBe("");
    expect(quote.selectionSourceRange).toEqual({ from: 0, to: 0 });
  });

  it("continues blockquotes and blockquote list items on Enter", () => {
    const quote = createInMemoryEditorDocumentState("> quoted", 600);
    quote.setSelection(quote.markdown.length, quote.markdown.length);

    applyInputIntent(quote, { type: "insert-paragraph" });

    expect(quote.markdown).toBe("> quoted\n> ");

    const quoteList = createInMemoryEditorDocumentState("> - nested", 600);
    quoteList.setSelection(quoteList.markdown.length, quoteList.markdown.length);

    applyInputIntent(quoteList, { type: "insert-paragraph" });

    expect(quoteList.markdown).toBe("> - nested\n> - ");
  });

  it("edits inline control characters exactly when the caret is inside them", () => {
    const editor = createInMemoryEditorDocumentState("A **bold** Z", 600);
    const markerMiddle = editor.markdown.indexOf("**") + 1;
    editor.setSelection(markerMiddle, markerMiddle);

    applyInputIntent(editor, {
      type: "insert-text",
      text: "!",
    });

    expect(editor.markdown).toBe("A *!*bold** Z");
    expect(editor.selectionSourceRange).toEqual({
      from: markerMiddle + 1,
      to: markerMiddle + 1,
    });

    applyInputIntent(editor, {
      type: "delete",
      direction: "backward",
    });

    expect(editor.markdown).toBe("A **bold** Z");
    expect(editor.selectionSourceRange).toEqual({
      from: markerMiddle,
      to: markerMiddle,
    });
  });

  it("keeps inline controls when replacing only rendered inline content", () => {
    const editor = createInMemoryEditorDocumentState("A **bold** Z", 600);
    const contentFrom = editor.markdown.indexOf("bold");
    editor.setSelection(contentFrom, contentFrom + "bold".length);

    applyInputIntent(editor, {
      type: "insert-text",
      text: "strong",
    });

    expect(editor.markdown).toBe("A **strong** Z");
    expect(editor.selectionSourceRange).toEqual({
      from: contentFrom + "strong".length,
      to: contentFrom + "strong".length,
    });
  });

  it("pastes and deletes inside link suffix controls as plain source edits", () => {
    const editor = createInMemoryEditorDocumentState("A [docs](https://example.com) Z", 600);
    const urlMiddle = editor.markdown.indexOf("https://") + "https".length;
    editor.setSelection(urlMiddle, urlMiddle);

    applyInputIntent(editor, {
      type: "clipboard",
      action: "paste",
      markdown: "+md",
      plainText: "+plain",
    });

    expect(editor.markdown).toBe("A [docs](https+md://example.com) Z");
    expect(editor.selectionSourceRange).toEqual({
      from: urlMiddle + "+md".length,
      to: urlMiddle + "+md".length,
    });

    applyInputIntent(editor, {
      type: "delete",
      direction: "backward",
    });

    expect(editor.markdown).toBe("A [docs](https+m://example.com) Z");
  });

  it("inserts source newlines inside block and inline controls without expanding the edit", () => {
    const heading = createInMemoryEditorDocumentState("### Heading", 600);
    heading.setSelection(1, 1);

    applyInputIntent(heading, { type: "insert-paragraph" });

    expect(heading.markdown).toBe("#\n## Heading");
    expect(heading.selectionSourceRange).toEqual({ from: 2, to: 2 });

    const link = createInMemoryEditorDocumentState("[docs](https://example.com)", 600);
    const linkSuffixOffset = link.markdown.indexOf("https://") + "https".length;
    link.setSelection(linkSuffixOffset, linkSuffixOffset);

    applyInputIntent(link, { type: "insert-paragraph" });

    expect(link.markdown).toBe("[docs](https\n://example.com)");
    expect(link.selectionSourceRange).toEqual({
      from: linkSuffixOffset + 1,
      to: linkSuffixOffset + 1,
    });
  });

  it("applies heading Backspace rules only at the heading content boundary", () => {
    for (let level = 2; level <= 6; level += 1) {
      const editor = createInMemoryEditorDocumentState(`${"#".repeat(level)} Heading`, 600);
      const headingStart = editor.markdown.indexOf("Heading");
      editor.setSelection(headingStart, headingStart);

      applyInputIntent(editor, { type: "delete", direction: "backward" });

      const nextPrefix = `${"#".repeat(level - 1)} `;
      expect(editor.markdown).toBe(`${nextPrefix}Heading`);
      expect(editor.selectionSourceRange).toEqual({
        from: nextPrefix.length,
        to: nextPrefix.length,
      });
    }

    const levelOne = createInMemoryEditorDocumentState("# Heading", 600);
    levelOne.setSelection(
      levelOne.markdown.indexOf("Heading"),
      levelOne.markdown.indexOf("Heading"),
    );

    applyInputIntent(levelOne, { type: "delete", direction: "backward" });

    expect(levelOne.markdown).toBe("Heading");
    expect(levelOne.selectionSourceRange).toEqual({ from: 0, to: 0 });

    const quoted = createInMemoryEditorDocumentState("> ## Heading", 600);
    quoted.setSelection(quoted.markdown.indexOf("Heading"), quoted.markdown.indexOf("Heading"));

    applyInputIntent(quoted, { type: "delete", direction: "backward" });

    expect(quoted.markdown).toBe("> # Heading");
    expect(quoted.selectionSourceRange).toEqual({ from: "> # ".length, to: "> # ".length });

    const markerInternal = createInMemoryEditorDocumentState("### Heading", 600);
    markerInternal.setSelection(2, 2);

    applyInputIntent(markerInternal, { type: "delete", direction: "backward" });

    expect(markerInternal.markdown).toBe("## Heading");
    expect(markerInternal.selectionSourceRange).toEqual({ from: 1, to: 1 });
  });

  it("removes list and blockquote prefixes at source line content boundaries", () => {
    const list = createInMemoryEditorDocumentState("- item", 600);
    list.setSelection(list.markdown.indexOf("item"), list.markdown.indexOf("item"));

    applyInputIntent(list, { type: "delete", direction: "backward" });

    expect(list.markdown).toBe("item");
    expect(list.selectionSourceRange).toEqual({ from: 0, to: 0 });

    const indented = createInMemoryEditorDocumentState("  - item", 600);
    indented.setSelection(indented.markdown.indexOf("item"), indented.markdown.indexOf("item"));

    applyInputIntent(indented, { type: "delete", direction: "backward" });

    expect(indented.markdown).toBe("- item");
    expect(indented.selectionSourceRange).toEqual({ from: "- ".length, to: "- ".length });

    const quote = createInMemoryEditorDocumentState("> quoted", 600);
    quote.setSelection(quote.markdown.indexOf("quoted"), quote.markdown.indexOf("quoted"));

    applyInputIntent(quote, { type: "delete", direction: "backward" });

    expect(quote.markdown).toBe("quoted");
    expect(quote.selectionSourceRange).toEqual({ from: 0, to: 0 });

    const quoteList = createInMemoryEditorDocumentState("> - item", 600);
    quoteList.setSelection(quoteList.markdown.indexOf("item"), quoteList.markdown.indexOf("item"));

    applyInputIntent(quoteList, { type: "delete", direction: "backward" });

    expect(quoteList.markdown).toBe("> item");
    expect(quoteList.selectionSourceRange).toEqual({ from: "> ".length, to: "> ".length });
  });

  it("preserves link and image syntax when replacing rendered labels", () => {
    const link = createInMemoryEditorDocumentState("[docs](https://example.com)", 600);
    const docsFrom = link.markdown.indexOf("docs");
    link.setSelection(docsFrom, docsFrom + "docs".length);

    applyInputIntent(link, { type: "insert-text", text: "site" });

    expect(link.markdown).toBe("[site](https://example.com)");

    const image = createInMemoryEditorDocumentState("![alt](image.png)", 600);
    const altFrom = image.markdown.indexOf("alt");
    image.setSelection(altFrom, altFrom + "alt".length);

    applyInputIntent(image, { type: "insert-text", text: "caption" });

    expect(image.markdown).toBe("![caption](image.png)");
  });

  it("keeps inline-control boundary deletes deterministic", () => {
    const strong = createInMemoryEditorDocumentState("A **bold** Z", 600);
    const boldStart = strong.markdown.indexOf("bold");
    strong.setSelection(boldStart, boldStart);

    applyInputIntent(strong, { type: "delete", direction: "backward" });

    expect(strong.markdown).toBe("A *bold** Z");
    expect(strong.selectionSourceRange).toEqual({
      from: boldStart - 1,
      to: boldStart - 1,
    });
  });

  it("indents and outdents selected list lines through Tab key intents", () => {
    const editor = createInMemoryEditorDocumentState("- one\n- two", 600);
    const twoStart = editor.markdown.indexOf("- two");
    editor.setSelection(twoStart, twoStart);

    const indent = normalizeInputTrace([{ type: "keydown", key: "Tab" }])[0]!;
    expect(indent).toEqual({ type: "line-indent", direction: "in" });
    applyInputIntent(editor, indent);

    expect(editor.markdown).toBe("- one\n  - two");
    expect(editor.selectionSourceRange).toEqual({
      from: twoStart + 2,
      to: twoStart + 2,
    });

    const outdent = normalizeInputTrace([{ type: "keydown", key: "Tab", shiftKey: true }])[0]!;
    expect(outdent).toEqual({ type: "line-indent", direction: "out" });
    applyInputIntent(editor, outdent);

    expect(editor.markdown).toBe("- one\n- two");
    expect(editor.selectionSourceRange).toEqual({
      from: twoStart,
      to: twoStart,
    });
  });

  it("keeps Enter and Tab source-exact inside fenced code blocks", () => {
    const editor = createInMemoryEditorDocumentState("```ts\nconst x = 1\n```", 600);
    const codeOffset = editor.markdown.indexOf("x =") + 1;
    editor.setSelection(codeOffset, codeOffset);

    applyInputIntent(editor, { type: "insert-paragraph" });

    expect(editor.markdown).toBe("```ts\nconst x\n = 1\n```");
    expect(editor.selectionSourceRange).toEqual({
      from: codeOffset + 1,
      to: codeOffset + 1,
    });

    const indent = normalizeInputTrace([{ type: "keydown", key: "Tab" }])[0]!;
    applyInputIntent(editor, indent);

    expect(editor.markdown).toBe("```ts\nconst x\n\t = 1\n```");
    expect(editor.selectionSourceRange).toEqual({
      from: codeOffset + 2,
      to: codeOffset + 2,
    });
  });

  it("keeps paste and multi-line replacement source-exact inside fenced code blocks", () => {
    const editor = createInMemoryEditorDocumentState("```ts\nalpha\nbeta\n```", 600);
    const from = editor.markdown.indexOf("alpha");
    const to = editor.markdown.indexOf("beta") + "beta".length;
    editor.setSelection(from, to);

    applyInputIntent(editor, {
      type: "clipboard",
      action: "paste",
      markdown: "x\ny",
    });

    expect(editor.markdown).toBe("```ts\nx\ny\n```");
    expect(editor.selectionSourceRange).toEqual({
      from: from + "x\ny".length,
      to: from + "x\ny".length,
    });
  });

  it("toggles task checkboxes without changing the current selection", () => {
    const editor = createInMemoryEditorDocumentState("- [ ] todo\n- [x] done", 600);
    const selectionFrom = editor.markdown.indexOf("todo");
    editor.setSelection(selectionFrom, selectionFrom + "todo".length);

    const result = toggleTaskCheckbox(editor, selectionFrom);

    expect(result.type).toBe("edit");
    expect(editor.markdown).toBe("- [x] todo\n- [x] done");
    expect(editor.selectionSourceRange).toEqual({
      from: selectionFrom,
      to: selectionFrom + "todo".length,
    });

    toggleTaskCheckbox(editor, editor.markdown.indexOf("done"));

    expect(editor.markdown).toBe("- [x] todo\n- [ ] done");
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

  it("replaces cross-block selections through composition intents", () => {
    const editor = createInMemoryEditorDocumentState("First paragraph\n\n- Second item", 600);
    const from = editor.markdown.indexOf("paragraph");
    const to = editor.markdown.indexOf("Second") + "Second".length;
    editor.setSelection(from, to);

    applyInputIntent(editor, { type: "composition-start" });
    const update = applyInputIntent(editor, {
      type: "composition-update",
      text: "跨块",
    });

    expect(update.type).toBe("composition-update");
    expect(editor.markdown).toBe("First paragraph\n\n- Second item");
    expect(editor.compositionView?.virtualText).toBe("First 跨块 item");

    const commit = applyInputIntent(editor, {
      type: "composition-commit",
      text: "完成",
    });

    expect(commit.type).toBe("composition-commit");
    expect(editor.markdown).toBe("First 完成 item");
    expect(editor.selectionSourceRange).toEqual({
      from: "First ".length + "完成".length,
      to: "First ".length + "完成".length,
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
