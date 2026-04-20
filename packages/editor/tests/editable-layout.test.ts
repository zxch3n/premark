import { createLayoutEngine } from "@pretext-md/layout";
import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import { createActiveMarkerRevealMarkdown, createEditableLayoutIndex } from "../src/index.ts";

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

  it("hit-tests supported inline and block fixtures", () => {
    const markdown = [
      "Latin 中文输入 emoji 👨‍👩‍👧‍👦 with `code` and [link](https://example.com).",
      "",
      "- List marker text",
      "",
      "> Quote block text",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 420);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    for (const text of [
      "Latin",
      "中文输入",
      "👨‍👩‍👧‍👦",
      "code",
      "link",
      "List marker",
      "Quote block",
      "const x",
    ]) {
      const fragment = index.fragments.find((candidate) => candidate.text.includes(text));
      expect(fragment, `fragment for ${text}`).toBeDefined();
      const startInFragment = fragment!.text.indexOf(text);
      const hit = index.hitTest(
        fragment!.rect.x +
          (fragment!.rect.width * (startInFragment + text.length / 2)) / fragment!.text.length,
        fragment!.rect.y + fragment!.rect.height / 2,
      );
      const sourceOffset = markdown.indexOf(text);
      expect(hit.fragment?.text).toContain(text);
      expect(hit.offset).toBeGreaterThanOrEqual(sourceOffset);
      expect(hit.offset).toBeLessThanOrEqual(sourceOffset + text.length);
    }
  });

  it("keeps source ranges aligned after normalized list item blocks", () => {
    const markdown = [
      "- Selection is stored as source offsets.",
      "- The hidden textarea mirrors only the active source slice.",
      "- Cross-block replacement uses one source operation.",
      "",
      "Try **bold text**, `inline code`, 中文输入.",
    ].join("\n");
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 720);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const hidden = index.fragments.find((fragment) => fragment.text.includes("hidden textarea"));
    const bold = index.fragments.find((fragment) => fragment.text === "bold text");
    const code = index.fragments.find((fragment) => fragment.text === "inline code");

    expect(markdown.slice(hidden?.sourceRange.from, hidden?.sourceRange.to)).toContain(
      "hidden textarea",
    );
    expect(markdown.slice(bold?.sourceRange.from, bold?.sourceRange.to)).toBe("bold text");
    expect(markdown.slice(bold?.tokenRange?.from, bold?.tokenRange?.to)).toBe("**bold text**");
    expect(markdown.slice(code?.sourceRange.from, code?.sourceRange.to)).toBe("inline code");
    expect(markdown.slice(code?.tokenRange?.from, code?.tokenRange?.to)).toBe("`inline code`");

    const hiddenCaret = index.sourceOffsetToCaretRect(markdown.indexOf("hidden") + 2);
    const boldCaret = index.sourceOffsetToCaretRect(markdown.indexOf("bold text") + 2);
    expect(hiddenCaret.fragment?.text).toContain("hidden textarea");
    expect(boldCaret.fragment?.text).toBe("bold text");
    expect(boldCaret.rect.y).toBeGreaterThan(hiddenCaret.rect.y);
  });

  it("maps hidden marker source offsets to visible token edges", () => {
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
    const strongToken = inlineSources.find((record) => record.type === "strong");
    const codeToken = inlineSources.find((record) => record.type === "code-span");
    const linkToken = inlineSources.find((record) => record.type === "link");

    expect(bold).toBeDefined();
    expect(code).toBeDefined();
    expect(docs).toBeDefined();
    expect(strongToken).toBeDefined();
    expect(codeToken).toBeDefined();
    expect(linkToken).toBeDefined();

    const hiddenStrongOpening = index.sourceOffsetToCaretRect(strongToken!.source.from + 1);
    const hiddenCodeOpening = index.sourceOffsetToCaretRect(codeToken!.source.from);
    const hiddenLinkUrl = index.sourceOffsetToCaretRect(markdown.indexOf("https://example.com"));

    expect(hiddenStrongOpening.rect.x).toBeCloseTo(bold!.rect.x, 0);
    expect(hiddenCodeOpening.rect.x).toBeCloseTo(code!.rect.x, 0);
    expect(hiddenLinkUrl.rect.x).toBeCloseTo(docs!.rect.x + docs!.rect.width, 0);
  });

  it("reveals active strong, code and link markers with source-addressable hit-test", () => {
    const markdown = "Hello **bold** and `code` plus [docs](https://example.com).";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layoutEngine = createLayoutEngine({ fontTheme: "github" });

    for (const [type, visibleSource] of [
      ["strong", "**bold**"],
      ["code-span", "`code`"],
      ["link", "[docs](https://example.com)"],
    ] as const) {
      const token = inlineSources.find((record) => record.type === type);
      expect(token, `token for ${type}`).toBeDefined();
      const markerOffset = type === "strong" ? token!.source.from + 1 : token!.source.from;
      const reveal = createActiveMarkerRevealMarkdown({
        markdown,
        inlineSources,
        selectionRange: {
          from: markerOffset,
          to: markerOffset,
        },
      });
      const layout = layoutEngine.layout(reveal.markdown, 800);
      const index = createEditableLayoutIndex({
        markdown,
        layout,
        blockSpans: state.blockSpans,
        inlineSources,
      });
      const fragment = index.fragments.find((candidate) => candidate.text.includes(visibleSource));
      expect(reveal.activeToken?.type).toBe(type);
      expect(fragment, `visible fragment for ${visibleSource}`).toBeDefined();
      expect(markdown.slice(fragment!.sourceRange.from, fragment!.sourceRange.to)).toContain(
        visibleSource,
      );

      const contentStart =
        type === "link"
          ? markdown.indexOf("docs")
          : type === "code-span"
            ? markdown.indexOf("code")
            : markdown.indexOf("bold");
      const markerCaret = index.sourceOffsetToCaretRect(markerOffset);
      const contentCaret = index.sourceOffsetToCaretRect(contentStart);
      expect(markerCaret.fragment?.text).toContain(visibleSource);
      expect(markerCaret.rect.x).toBeLessThan(contentCaret.rect.x);

      const hit = index.hitTest(markerCaret.rect.x + 0.5, markerCaret.rect.y + 1);
      expect(hit.offset).toBeGreaterThanOrEqual(token!.source.from);
      expect(hit.offset).toBeLessThan(contentStart);
    }
  });

  it("records limited bidi hit-test behavior with logical source offsets", () => {
    const markdown = "English עברית 123 **bold** عربي [קישור](https://example.com)";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 520);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    for (const text of ["English", "עברית", "123", "bold", "عربي", "קישור"]) {
      const fragment = index.fragments.find((candidate) => candidate.text.includes(text));
      expect(fragment, `bidi fragment for ${text}`).toBeDefined();
      const startInFragment = fragment!.text.indexOf(text);
      const hit = index.hitTest(
        fragment!.rect.x +
          (fragment!.rect.width * (startInFragment + text.length / 2)) / fragment!.text.length,
        fragment!.rect.y + fragment!.rect.height / 2,
      );
      const sourceOffset = markdown.indexOf(text);
      expect(hit.offset).toBeGreaterThanOrEqual(sourceOffset);
      expect(hit.offset).toBeLessThanOrEqual(sourceOffset + text.length);
    }
  });

  it("resolves character, word, line and block ranges from source offsets and hit-test points", () => {
    const markdown = [
      "# Heading",
      "",
      "Paragraph alpha beta gamma delta epsilon wraps for line ranges.",
      "",
      "- List item text",
      "",
      "> Quote line",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 220);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const betaOffset = markdown.indexOf("beta") + 1;
    const betaCaret = index.sourceOffsetToCaretRect(betaOffset);
    const betaWord = index.hitTestSourceRange(
      betaCaret.rect.x + 1,
      betaCaret.rect.y + betaCaret.rect.height / 2,
      "word",
    );
    expect(markdown.slice(betaWord.range.from, betaWord.range.to)).toBe("beta");
    expect(index.sourceRangeAtOffset(betaOffset, "character")).toEqual({
      from: betaOffset,
      to: betaOffset,
    });

    const betaLine = index.sourceRangeAtOffset(betaOffset, "line");
    expect(betaLine.from).toBeLessThanOrEqual(betaOffset);
    expect(betaLine.to).toBeGreaterThan(betaOffset);
    expect(markdown.slice(betaLine.from, betaLine.to)).toContain("beta");
    expect(markdown.slice(betaLine.from, betaLine.to)).not.toContain("List item");

    const listOffset = markdown.indexOf("List item");
    const listBlock = index.sourceRangeAtOffset(listOffset, "block");
    expect(markdown.slice(listBlock.from, listBlock.to)).toContain("- List item text");
    expect(markdown.slice(listBlock.from, listBlock.to)).not.toContain("> Quote line");

    const codeOffset = markdown.indexOf("const x");
    const codeBlock = index.sourceRangeAtOffset(codeOffset, "block");
    expect(markdown.slice(codeBlock.from, codeBlock.to)).toContain("const x = 1;");
    expect(markdown.slice(codeBlock.from, codeBlock.to)).toContain("```");
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
