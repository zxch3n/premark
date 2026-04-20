import { createLayoutEngine } from "@pretext-md/layout";
import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import { createEditableLayoutIndex } from "../src/index.ts";

installNodeCanvas();

describe("EditableLayoutIndex", () => {
  it("maps rendered strong, code and link fragments back to raw source ranges", () => {
    const markdown = "Hello **bold** and `code` plus [docs](https://example.com).";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const bold = index.fragments.find((fragment) => fragment.text === "bold");
    const code = index.fragments.find((fragment) => fragment.text === "code");
    const docs = index.fragments.find((fragment) => fragment.text === "docs");

    expect(markdown.slice(bold?.sourceRange.from, bold?.sourceRange.to)).toBe("bold");
    expect(markdown.slice(bold?.tokenRange?.from, bold?.tokenRange?.to)).toBe("**bold**");
    expect(markdown.slice(code?.sourceRange.from, code?.sourceRange.to)).toBe("code");
    expect(markdown.slice(code?.tokenRange?.from, code?.tokenRange?.to)).toBe("`code`");
    expect(markdown.slice(docs?.sourceRange.from, docs?.sourceRange.to)).toBe("docs");
    expect(markdown.slice(docs?.tokenRange?.from, docs?.tokenRange?.to)).toBe(
      "[docs](https://example.com)",
    );
  });

  it("hit-tests visible text into UTF-16 source offsets", () => {
    const markdown = "Hello **bold** and `code`";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });
    const bold = index.fragments.find((fragment) => fragment.text === "bold");
    expect(bold).toBeDefined();

    const hit = index.hitTest(
      bold!.rect.x + bold!.rect.width / 2,
      bold!.rect.y + bold!.rect.height / 2,
    );

    expect(hit.fragment?.text).toBe("bold");
    expect(hit.offset).toBeGreaterThanOrEqual(markdown.indexOf("bold"));
    expect(hit.offset).toBeLessThanOrEqual(markdown.indexOf("bold") + "bold".length);
  });

  it("returns caret and multi-line selection rects from source ranges", () => {
    const markdown = "First line with **bold** text that should wrap before `code` appears.";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 180);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const boldOffset = markdown.indexOf("bold") + 2;
    const caret = index.sourceOffsetToCaretRect(boldOffset);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(caret.rect.height).toBeGreaterThan(0);
  });

  it("cuts selection rects from editable fragments", () => {
    const index = createEditableLayoutIndex({
      markdown: "Hello",
      blockSpans: [{ id: "block-1", from: 0, to: 5, type: "paragraph", signature: 1 }],
      inlineSources: [],
      layout: {
        version: 1,
        containerWidth: 200,
        totalHeight: 20,
        blocks: [
          {
            index: 0,
            type: "paragraph",
            firstLineIndex: 0,
            lineCount: 1,
            y: 0,
            height: 20,
            contentBox: { x: 0, y: 0, width: 200, height: 20 },
            meta: { type: "paragraph" },
            context: { quoteDepth: 0, listDepth: 0 },
          },
        ],
        lines: [
          {
            kind: "text",
            index: 0,
            blockIndex: 0,
            lineIndexInBlock: 0,
            x: 0,
            y: 0,
            height: 20,
            width: 50,
            fragments: [{ text: "Hello", x: 0, width: 50, font: "16px sans-serif", type: "text" }],
          },
        ],
      },
    });

    expect(index.fragments).toHaveLength(1);
    expect(index.fragments[0]?.sourceRange).toEqual({ from: 0, to: 5 });
    const selectionRects = index.sourceRangeToSelectionRects({ from: 1, to: 4 });

    expect(selectionRects).toEqual([{ x: 10, y: 0, width: 30, height: 20 }]);
    expect(selectionRects.length).toBeGreaterThan(0);
    expect(selectionRects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
  });
});
