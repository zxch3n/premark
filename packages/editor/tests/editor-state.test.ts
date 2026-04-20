import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import { createInMemoryEditorDocumentState } from "../src/index.ts";

installNodeCanvas();

describe("EditorDocumentState", () => {
  it("keeps adapter, parser, layout and editable index in sync after replacing selection", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world** and `code`", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    editor.replaceSelection("Premark");

    expect(editor.markdown).toBe("Hello **Premark** and `code`");
    expect(editor.selectionSourceRange).toEqual({
      from: worldFrom + "Premark".length,
      to: worldFrom + "Premark".length,
    });
    expect(editor.parseState.text).toBe(editor.markdown);
    expect(editor.layout.update).toMatchObject({
      sourceChange: expect.objectContaining({
        changedChars: expect.any(Number),
      }),
    });
    expect(editor.layout.blocks).toHaveLength(1);
    expect(editor.editableIndex.fragments.some((fragment) => fragment.text === "Premark")).toBe(
      true,
    );
  });

  it("renders composition updates virtually and commits them into the document", () => {
    const editor = createInMemoryEditorDocumentState("Hello **world**", 600);
    const worldFrom = editor.markdown.indexOf("world");
    editor.setSelection(worldFrom, worldFrom + "world".length);

    const view = editor.updateComposition("世界");

    expect(editor.markdown).toBe("Hello **world**");
    expect(view.virtualText).toBe("Hello **世界**");
    expect(editor.compositionView?.virtualText).toBe("Hello **世界**");

    editor.commitComposition();

    expect(editor.markdown).toBe("Hello **世界**");
    expect(editor.compositionView).toBeNull();
    expect(editor.selectionSourceRange).toEqual({
      from: worldFrom + "世界".length,
      to: worldFrom + "世界".length,
    });
  });

  it("resizes layout and keeps source mapping available", () => {
    const editor = createInMemoryEditorDocumentState(
      "A paragraph with **bold** text and a lot of words for wrapping.",
      520,
    );
    const initialLineCount = editor.layout.lines.length;

    editor.resize(140);

    expect(editor.layout.lines.length).toBeGreaterThanOrEqual(initialLineCount);
    const boldOffset = editor.markdown.indexOf("bold");
    const bold = editor.editableIndex.fragments.find(
      (fragment) =>
        fragment.sourceRange.from <= boldOffset && fragment.sourceRange.to >= boldOffset,
    );
    expect(bold).toBeDefined();
    expect(editor.editableIndex.sourceOffsetToCaretRect(boldOffset).rect.height).toBeGreaterThan(0);
  });
});
