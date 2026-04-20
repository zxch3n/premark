import { createLayoutEngine, measureGraphemeBoundaryXs } from "@pretext-md/layout";
import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import { createActiveMarkerRevealMarkdown, createEditableLayoutIndex } from "../src/index.ts";

installNodeCanvas();

function measuredTextWidth(text: string, font: string): number {
  const context = new OffscreenCanvas(1, 1).getContext("2d");
  if (context === null) {
    throw new Error("Missing measurement context");
  }
  context.font = font;
  return context.measureText(text).width;
}

function createTestIndex(markdown: string, width = 800) {
  const state = createIncrementalParseState(markdown);
  const inlineSources = createMarkdownInlineSourceMap(state);
  const layout = createLayoutEngine({ fontTheme: "github", lineBreakMode: "source" }).layout(
    markdown,
    width,
  );
  return {
    state,
    inlineSources,
    layout,
    index: createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    }),
  };
}

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

  it("keeps plaintext-visible parser nodes visible and source-addressable", () => {
    const markdown = "A &amp; B &#x1F600; C <!-- note --> D";
    const { index, inlineSources } = createTestIndex(markdown);
    const visible = index.fragments.map((fragment) => fragment.text).join("");
    const amp = index.sourceOffsetToCaretRect(markdown.indexOf("&amp;") + 1);
    const comment = index.sourceOffsetToCaretRect(markdown.indexOf("note"));

    expect(visible).toContain("A & B 😀 C <!-- note --> D");
    expect(inlineSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceText: "&amp;", renderedText: "&" }),
        expect.objectContaining({ sourceText: "&#x1F600;", renderedText: "😀" }),
        expect.objectContaining({ sourceText: "<!-- note -->", renderedText: "<!-- note -->" }),
      ]),
    );
    expect(amp.fragment?.text).toContain("&");
    expect(comment.fragment?.text).toContain("<!-- note -->");
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
    expect(hiddenCodeOpening.rect.x).toBeCloseTo(code!.rect.x + 6, 0);
    expect(hiddenLinkUrl.rect.x).toBeCloseTo(docs!.rect.x + docs!.rect.width, 0);
  });

  it("uses measured inline text widths for caret and hit-test placement", () => {
    const markdown = "iiiiiiii WWWW done";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const fragment = index.fragments.find((candidate) => candidate.text.includes("WWWW"));
    expect(fragment).toBeDefined();
    const wOffset = markdown.indexOf("WWWW");
    const localOffset = wOffset - fragment!.sourceRange.from;
    const measuredPrefixWidth = measuredTextWidth(
      fragment!.text.slice(0, localOffset),
      fragment!.font,
    );
    const measuredFullWidth = measuredTextWidth(fragment!.text, fragment!.font);
    const expectedX =
      fragment!.rect.x + (measuredPrefixWidth / measuredFullWidth) * fragment!.rect.width;
    const proportionalX =
      fragment!.rect.x + (fragment!.rect.width * localOffset) / fragment!.text.length;

    const caret = index.sourceOffsetToCaretRect(wOffset);
    expect(caret.rect.x).toBeCloseTo(expectedX, 0);
    expect(Math.abs(caret.rect.x - proportionalX)).toBeGreaterThan(8);

    const nextCaret = index.sourceOffsetToCaretRect(wOffset + 1);
    const hit = index.hitTest((caret.rect.x + nextCaret.rect.x) / 2, caret.rect.y + 1);
    expect(hit.offset).toBe(wOffset);
  });

  it("uses grapheme boundaries for emoji caret and hit-test placement", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const markdown = `A ${emoji} B`;
    const { index } = createTestIndex(markdown);
    const fragment = index.fragments.find((candidate) => candidate.text.includes(emoji));
    expect(fragment).toBeDefined();

    const emojiFrom = markdown.indexOf(emoji);
    const emojiTo = emojiFrom + emoji.length;
    const localEmojiTo = emojiTo - fragment!.sourceRange.from;
    const boundaryXs = measureGraphemeBoundaryXs(fragment!.text, fragment!.font);
    const measuredFullWidth = boundaryXs.at(-1)!;
    const measuredEmojiEndWidth = boundaryXs[localEmojiTo]!;
    const expectedEmojiEndX =
      fragment!.rect.x + (measuredEmojiEndWidth / measuredFullWidth) * fragment!.rect.width;

    const before = index.sourceOffsetToCaretRect(emojiFrom, "before");
    const insideBefore = index.sourceOffsetToCaretRect(emojiFrom + 2, "before");
    const insideAfter = index.sourceOffsetToCaretRect(emojiFrom + 2, "after");
    const after = index.sourceOffsetToCaretRect(emojiTo, "after");

    expect(insideBefore.rect.x).toBeCloseTo(before.rect.x, 0);
    expect(insideAfter.rect.x).toBeCloseTo(after.rect.x, 0);
    expect(after.rect.x).toBeCloseTo(expectedEmojiEndX, 0);

    const beforeNextText = index.sourceOffsetToCaretRect(markdown.indexOf("B"), "before");
    expect(beforeNextText.rect.x).toBeGreaterThan(after.rect.x);

    const leftHit = index.hitTest(before.rect.x + 1, before.rect.y + 1);
    const rightHit = index.hitTest(after.rect.x - 1, after.rect.y + 1);
    expect(leftHit.offset).toBe(emojiFrom);
    expect(rightHit.offset).toBe(emojiTo);
  });

  it("keeps inline-code caret positions inside the code pill padding", () => {
    const markdown = "Try `code` now";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
    });

    const code = index.fragments.find((fragment) => fragment.text === "code");
    expect(code).toBeDefined();

    const start = index.sourceOffsetToCaretRect(markdown.indexOf("code"));
    const end = index.sourceOffsetToCaretRect(markdown.indexOf("code") + "code".length);
    expect(start.rect.x).toBeCloseTo(code!.rect.x + 6, 0);
    expect(end.rect.x).toBeCloseTo(code!.rect.x + code!.rect.width - 6, 0);

    const selectionRects = index.sourceRangeToSelectionRects({
      from: markdown.indexOf("code"),
      to: markdown.indexOf("code") + "code".length,
    });
    expect(selectionRects[0]?.x).toBeCloseTo(start.rect.x, 0);
    expect(selectionRects[0]?.width).toBeCloseTo(end.rect.x - start.rect.x, 0);
  });

  it("reveals active strong, code and link markers with source-addressable hit-test", () => {
    const markdown = "Hello **bold** and `code` plus [docs](https://example.com).";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const layoutEngine = createLayoutEngine({ fontTheme: "github" });

    for (const [type, content, expectedFragmentType] of [
      ["strong", "bold", "strong"],
      ["code-span", "code", "inline_code"],
      ["link", "docs", "link"],
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
        sourceMap: reveal.sourceMap,
      });
      const fragment = index.fragments.find(
        (candidate) => candidate.text === content && candidate.type === expectedFragmentType,
      );
      expect(reveal.activeToken?.type).toBe(type);
      expect(fragment, `styled content fragment for ${content}`).toBeDefined();
      expect(markdown.slice(fragment!.sourceRange.from, fragment!.sourceRange.to)).toBe(content);

      const contentStart =
        type === "link"
          ? markdown.indexOf("docs")
          : type === "code-span"
            ? markdown.indexOf("code")
            : markdown.indexOf("bold");
      const markerCaret = index.sourceOffsetToCaretRect(markerOffset);
      const contentCaret = index.sourceOffsetToCaretRect(contentStart);
      expect(markerCaret.rect.x).toBeLessThan(contentCaret.rect.x);

      const hit = index.hitTest(markerCaret.rect.x + 0.5, markerCaret.rect.y + 1);
      expect(hit.offset).toBeGreaterThanOrEqual(token!.source.from);
      expect(hit.offset).toBeLessThan(contentStart);
    }
  });

  it("places carets inside revealed wrapping marker characters", () => {
    const markdown = "**abc**";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const reveal = createActiveMarkerRevealMarkdown({
      markdown,
      inlineSources,
      blockSpans: state.blockSpans,
      selectionRange: { from: 1, to: 1 },
    });
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(reveal.markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
      sourceMap: reveal.sourceMap,
    });

    const openingStart = index.sourceOffsetToCaretRect(0);
    const openingMiddle = index.sourceOffsetToCaretRect(1);
    const contentStart = index.sourceOffsetToCaretRect(2);
    const closingStart = index.sourceOffsetToCaretRect(5);
    const closingMiddle = index.sourceOffsetToCaretRect(6);
    const closingEnd = index.sourceOffsetToCaretRect(7);

    expect(openingStart.fragment?.text).toBe("**");
    expect(openingMiddle.fragment?.text).toBe("**");
    expect(openingMiddle.rect.x).toBeGreaterThan(openingStart.rect.x);
    expect(contentStart.rect.x).toBeGreaterThan(openingMiddle.rect.x);

    expect(closingStart.fragment?.text).toBe("**");
    expect(closingMiddle.fragment?.text).toBe("**");
    expect(closingMiddle.rect.x).toBeGreaterThan(closingStart.rect.x);
    expect(closingEnd.rect.x).toBeGreaterThanOrEqual(closingMiddle.rect.x);
  });

  it("places carets inside revealed link suffix characters", () => {
    const markdown = "[hello](https://example.com)";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const reveal = createActiveMarkerRevealMarkdown({
      markdown,
      inlineSources,
      blockSpans: state.blockSpans,
      selectionRange: { from: markdown.indexOf("https") + 1, to: markdown.indexOf("https") + 1 },
    });
    const layout = createLayoutEngine({ fontTheme: "github" }).layout(reveal.markdown, 800);
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
      sourceMap: reveal.sourceMap,
    });

    const suffixStart = markdown.indexOf("]");
    const suffixCarets = Array.from({ length: markdown.length - suffixStart + 1 }, (_, offset) =>
      index.sourceOffsetToCaretRect(suffixStart + offset, "before"),
    );

    for (let index = 1; index < suffixCarets.length - 1; index += 1) {
      expect(suffixCarets[index]?.fragment?.text, `suffix offset ${index}`).toBe(
        "](https://example.com)",
      );
      if (index > 1) {
        expect(suffixCarets[index]!.rect.x, `suffix offset ${index}`).toBeGreaterThan(
          suffixCarets[index - 1]!.rect.x,
        );
      }
    }
  });

  it("places carets inside revealed link suffix after preceding inline content", () => {
    const markdown =
      "Try **bold text**, `inline code`, [docs](https://example.com), 中文输入, and emoji";
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const suffixStart = markdown.indexOf("](https://example.com)");
    const reveal = createActiveMarkerRevealMarkdown({
      markdown,
      inlineSources,
      blockSpans: state.blockSpans,
      selectionRange: { from: suffixStart + 9, to: suffixStart + 9 },
    });
    const layout = createLayoutEngine({ fontTheme: "modern", lineBreakMode: "source" }).layout(
      reveal.markdown,
      724,
    );
    const index = createEditableLayoutIndex({
      markdown,
      layout,
      blockSpans: state.blockSpans,
      inlineSources,
      sourceMap: reveal.sourceMap,
    });

    const firstSlash = index.sourceOffsetToCaretRect(suffixStart + 9, "before");
    const secondSlash = index.sourceOffsetToCaretRect(suffixStart + 10, "before");
    expect(secondSlash.fragment?.text).toContain("](https://example.com)");
    expect(secondSlash.rect.x).toBeGreaterThan(firstSlash.rect.x);
  });

  it("keeps heading caret positions aligned after H1-H6 block control reveal", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const marker = "#".repeat(level);
      const markdown = `${marker} Native rendered Markdown`;
      const escapedMarker = marker
        .split("")
        .map((char) => `\\${char}`)
        .join("");
      const state = createIncrementalParseState(markdown);
      const inlineSources = createMarkdownInlineSourceMap(state);
      const reveal = createActiveMarkerRevealMarkdown({
        markdown,
        inlineSources,
        blockSpans: state.blockSpans,
        selectionRange: {
          from: markdown.indexOf("rendered"),
          to: markdown.indexOf("rendered"),
        },
      });
      const layout = createLayoutEngine({ fontTheme: "github" }).layout(reveal.markdown, 800);
      const index = createEditableLayoutIndex({
        markdown,
        layout,
        blockSpans: state.blockSpans,
        inlineSources,
        sourceMap: reveal.sourceMap,
      });

      const titleStartOffset = markdown.indexOf("Native");
      const titleStart = index.sourceOffsetToCaretRect(titleStartOffset);
      const renderedStart = index.sourceOffsetToCaretRect(markdown.indexOf("rendered"));
      const markdownEnd = index.sourceOffsetToCaretRect(markdown.length);
      const headingFragment = titleStart.fragment!;
      const measuredControlWidth =
        (measuredTextWidth(`${marker} `, headingFragment.font) /
          measuredTextWidth(headingFragment.text, headingFragment.font)) *
        headingFragment.rect.width;

      expect(reveal.markdown, `H${level}`).toBe(
        `${marker} ${escapedMarker} Native rendered Markdown`,
      );
      expect(titleStart.fragment?.text, `H${level}`).toContain(
        `${marker} Native rendered Markdown`,
      );
      expect(index.sourceOffsetToCaretRect(0).rect.x, `H${level}`).toBeCloseTo(
        headingFragment.rect.x,
        0,
      );
      expect(index.sourceOffsetToCaretRect(level).rect.x, `H${level}`).toBeGreaterThan(
        headingFragment.rect.x,
      );
      expect(titleStart.rect.x, `H${level}`).toBeCloseTo(
        headingFragment.rect.x + measuredControlWidth,
        0,
      );
      expect(renderedStart.rect.x, `H${level}`).toBeGreaterThan(titleStart.rect.x);
      expect(markdownEnd.rect.x, `H${level}`).toBeCloseTo(
        headingFragment.rect.x + headingFragment.rect.width,
        0,
      );

      const titleHit = index.hitTest(titleStart.rect.x + 0.5, titleStart.rect.y + 1);
      expect(titleHit.offset, `H${level}`).toBe(titleStartOffset);
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
    const fragment = index.fragments[0]!;
    const boundaries = measureGraphemeBoundaryXs(fragment.text, fragment.font);
    const scale = fragment.rect.width / boundaries.at(-1)!;
    const expectedX = boundaries[1]! * scale;
    const expectedWidth = (boundaries[4]! - boundaries[1]!) * scale;

    expect(selectionRects).toHaveLength(1);
    expect(selectionRects[0]?.x).toBeCloseTo(expectedX, 5);
    expect(selectionRects[0]?.y).toBe(0);
    expect(selectionRects[0]?.width).toBeCloseTo(expectedWidth, 5);
    expect(selectionRects[0]?.height).toBe(20);
    expect(selectionRects.length).toBeGreaterThan(0);
    expect(selectionRects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
  });

  it("places caret on explicit blank visual lines between source blocks", () => {
    const markdown = "abc\n\ndef";
    const { index } = createTestIndex(markdown);
    const first = index.fragments.find((fragment) => fragment.text === "abc");
    const second = index.fragments.find((fragment) => fragment.text === "def");
    const blank = index.fragments.find((fragment) => fragment.sourceRange.from === 4);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(blank).toBeDefined();

    const lineEnd = index.sourceOffsetToCaretRect(markdown.indexOf("\n"));
    const blankLineOffset = index.sourceOffsetToCaretRect(markdown.indexOf("\n") + 1);
    const nextBlockStart = index.sourceOffsetToCaretRect(markdown.indexOf("def"));

    expect(lineEnd.fragment).toBe(first);
    expect(lineEnd.rect.x).toBeCloseTo(first!.rect.x + first!.rect.width, 0);
    expect(lineEnd.rect.y).toBe(first!.rect.y);

    expect(blankLineOffset.fragment).toBe(blank);
    expect(blankLineOffset.rect.x).toBe(0);
    expect(blankLineOffset.rect.y).toBe(first!.rect.y + first!.rect.height);

    expect(nextBlockStart.fragment).toBe(second);
    expect(nextBlockStart.rect.x).toBeCloseTo(second!.rect.x, 0);
    expect(nextBlockStart.rect.y).toBe(first!.rect.y + first!.rect.height * 2);
  });

  it("preserves every source newline as a visual line break in editor layout", () => {
    const markdown = "abc\ndef\n\nghi";
    const { index } = createTestIndex(markdown);
    const first = index.fragments.find((fragment) => fragment.text === "abc");
    const second = index.fragments.find((fragment) => fragment.text === "def");
    const blank = index.fragments.find((fragment) => fragment.sourceRange.from === 8);
    const third = index.fragments.find((fragment) => fragment.text === "ghi");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(blank).toBeDefined();
    expect(third).toBeDefined();

    expect(second!.rect.y).toBe(first!.rect.y + first!.rect.height);
    expect(blank!.rect.y).toBe(first!.rect.y + first!.rect.height * 2);
    expect(third!.rect.y).toBe(first!.rect.y + first!.rect.height * 3);

    expect(index.sourceOffsetToCaretRect(markdown.indexOf("\n")).fragment).toBe(first);
    expect(index.sourceOffsetToCaretRect(markdown.indexOf("def")).fragment).toBe(second);
    expect(index.sourceOffsetToCaretRect(8).fragment).toBe(blank);
    expect(index.sourceOffsetToCaretRect(markdown.indexOf("ghi")).fragment).toBe(third);
  });

  it("keeps styled softbreak content source-addressable across visual lines", () => {
    const markdown = "**abc\ndef** and [ghi\njkl](https://example.com)";
    const { index } = createTestIndex(markdown);
    const abc = index.fragments.find((fragment) => fragment.text === "abc");
    const def = index.fragments.find((fragment) => fragment.text === "def");
    const ghi = index.fragments.find((fragment) => fragment.text === "ghi");
    const jkl = index.fragments.find((fragment) => fragment.text === "jkl");
    expect(abc).toBeDefined();
    expect(def).toBeDefined();
    expect(ghi).toBeDefined();
    expect(jkl).toBeDefined();

    expect(abc!.type).toBe("strong");
    expect(def!.type).toBe("strong");
    expect(ghi!.type).toBe("link");
    expect(jkl!.type).toBe("link");
    expect(def!.rect.y).toBe(abc!.rect.y + abc!.rect.height);
    expect(jkl!.rect.y).toBeGreaterThan(ghi!.rect.y);

    expect(index.sourceOffsetToCaretRect(markdown.indexOf("abc")).fragment).toBe(abc);
    expect(index.sourceOffsetToCaretRect(markdown.indexOf("def")).fragment).toBe(def);
    expect(index.sourceOffsetToCaretRect(markdown.indexOf("ghi")).fragment).toBe(ghi);
    expect(index.sourceOffsetToCaretRect(markdown.indexOf("jkl")).fragment).toBe(jkl);
  });

  it("does not collapse real next-block starts into the previous line end", () => {
    for (const markdown of ["abc\n- item", "abc\n> quote", "abc\n# Heading"]) {
      const { index, state } = createTestIndex(markdown);
      const first = index.fragments.find((fragment) => fragment.text === "abc");
      const nextBlock = state.blockSpans[1];
      expect(first, markdown).toBeDefined();
      expect(nextBlock, markdown).toBeDefined();

      const newlineCaret = index.sourceOffsetToCaretRect(markdown.indexOf("\n"));
      const nextBlockCaret = index.sourceOffsetToCaretRect(nextBlock!.from);

      expect(newlineCaret.fragment, markdown).toBe(first);
      expect(newlineCaret.rect.y, markdown).toBe(first!.rect.y);
      expect(nextBlockCaret.rect.y, markdown).toBeGreaterThan(first!.rect.y);
    }
  });

  it("uses layout y positions and measured x positions for wrapped visual line boundaries", () => {
    const markdown = "Alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const { index } = createTestIndex(markdown, 160);
    expect(index.fragments.length).toBeGreaterThanOrEqual(3);

    for (const fragment of index.fragments) {
      const start = index.sourceOffsetToCaretRect(fragment.sourceRange.from, "after");
      const end = index.sourceOffsetToCaretRect(fragment.sourceRange.to, "before");
      expect(start.rect.y).toBe(fragment.rect.y);
      expect(end.rect.y).toBe(fragment.rect.y);
      expect(start.rect.x).toBeCloseTo(fragment.rect.x, 0);
      expect(end.rect.x).toBeCloseTo(fragment.rect.x + fragment.rect.width, 0);
    }

    const first = index.fragments[0]!;
    const second = index.fragments[1]!;
    expect(first.sourceRange.to).toBe(second.sourceRange.from);
    expect(index.sourceOffsetToCaretRect(first.sourceRange.to, "before").rect.y).toBe(first.rect.y);
    expect(index.sourceOffsetToCaretRect(first.sourceRange.to, "after").rect.y).toBe(second.rect.y);
  });

  it("hit-tests visual line y boundaries into the lower line", () => {
    const markdown = "Alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const { index } = createTestIndex(markdown, 160);
    const first = index.fragments[0]!;
    const second = index.fragments[1]!;

    const lastPixelOnFirst = index.hitTest(
      first.rect.x + first.rect.width - 1,
      first.rect.y + first.rect.height - 0.01,
    );
    const firstPixelOnSecond = index.hitTest(second.rect.x + 1, second.rect.y);

    expect(lastPixelOnFirst.fragment).toBe(first);
    expect(firstPixelOnSecond.fragment).toBe(second);
    expect(firstPixelOnSecond.offset).toBe(second.sourceRange.from);
  });

  it("places caret and hit-test on the correct source line inside multiline code blocks", () => {
    const markdown = ["```ts", "const x = 1;", "const y = 2;", "```"].join("\n");
    const { index } = createTestIndex(markdown);
    const firstCodeLine = index.fragments.find((fragment) => fragment.text === "const x = 1;");
    const secondCodeLine = index.fragments.find((fragment) => fragment.text === "const y = 2;");
    expect(firstCodeLine).toBeDefined();
    expect(secondCodeLine).toBeDefined();

    const firstStart = index.sourceOffsetToCaretRect(markdown.indexOf("const x"));
    const firstEnd = index.sourceOffsetToCaretRect(markdown.indexOf("const x") + "const x".length);
    const secondStart = index.sourceOffsetToCaretRect(markdown.indexOf("const y"));
    const secondEnd = index.sourceOffsetToCaretRect(markdown.indexOf("const y") + "const y".length);

    expect(firstStart.fragment).toBe(firstCodeLine);
    expect(secondStart.fragment).toBe(secondCodeLine);
    expect(secondStart.rect.y).toBeGreaterThan(firstStart.rect.y);
    expect(secondStart.rect.x).toBeCloseTo(firstStart.rect.x, 0);
    expect(firstEnd.rect.x).toBeCloseTo(
      firstStart.rect.x + measuredTextWidth("const x", firstCodeLine!.font),
      0,
    );
    expect(secondEnd.rect.x).toBeCloseTo(
      secondStart.rect.x + measuredTextWidth("const y", secondCodeLine!.font),
      0,
    );

    const hitSecond = index.hitTest(secondStart.rect.x + 1, secondStart.rect.y);
    expect(hitSecond.fragment).toBe(secondCodeLine);
    expect(hitSecond.offset).toBe(markdown.indexOf("const y"));

    const rects = index.sourceRangeToSelectionRects({
      from: markdown.indexOf("x = 1"),
      to: markdown.indexOf("y = 2") + "y = 2".length,
    });
    expect(rects.length).toBe(2);
    expect(rects[0]?.y).toBe(firstCodeLine!.rect.y);
    expect(rects[1]?.y).toBe(secondCodeLine!.rect.y);
  });
});
