import { describe, expect, it } from "vite-plus/test";

import { createHighlighter } from "../../highlight/src/index.ts";

import { createLayoutEngine, measureGraphemeBoundaryXs } from "../src/index.ts";
import type { DocumentLayout } from "../src/types.ts";

describe("createLayoutEngine", () => {
  it("lays out headings and paragraphs", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const layout = engine.layout("# Hello\n\nWorld", 420);
    expect(layout.blocks).toHaveLength(2);
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);
    expect(layout.totalHeight).toBeGreaterThan(0);
  });

  it("produces inline fragments for rich text", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const layout = engine.layout("Hello **bold** and `code`", 420);
    const firstLine = layout.lines[0];
    expect(firstLine?.kind).toBe("text");
    if (firstLine?.kind === "text") {
      expect(firstLine.fragments.some((fragment) => fragment.type === "strong")).toBe(true);
      expect(firstLine.fragments.some((fragment) => fragment.type === "inline_code")).toBe(true);
    }
  });

  it("renders bare HTTP URLs as link fragments", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const url = "https://example.com";
    const layout = engine.layout(`Visit ${url} now`, 520);
    const textLine = layout.lines.find((line) => line.kind === "text");
    const linkFragment =
      textLine?.kind === "text"
        ? textLine.fragments.find((fragment) => fragment.text === url)
        : undefined;

    expect(linkFragment).toMatchObject({
      type: "link",
      meta: { type: "link", href: url },
    });
  });

  it("measures text boundaries at grapheme advances", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const text = `A ${emoji} B`;
    const font = 'normal 400 16px "Segoe UI", Helvetica, Arial, sans-serif';
    const boundaries = measureGraphemeBoundaryXs(text, font);
    const emojiFrom = text.indexOf(emoji);
    const emojiTo = emojiFrom + emoji.length;
    const bOffset = text.indexOf("B");

    expect(boundaries[emojiFrom + 2]).toBeCloseTo(boundaries[emojiFrom]!, 3);
    expect(boundaries[emojiTo]).toBeGreaterThan(boundaries[emojiFrom]!);
    expect(boundaries[bOffset]).toBeGreaterThan(boundaries[emojiTo]!);
  });

  it("preserves whitespace advances in text boundary measurement", () => {
    const font = 'normal 400 16px "Segoe UI", Helvetica, Arial, sans-serif';
    const boundaries = measureGraphemeBoundaryXs("   ", font);

    expect(boundaries[1]).toBeGreaterThan(boundaries[0]!);
    expect(boundaries[2]).toBeGreaterThan(boundaries[1]!);
    expect(boundaries[3]).toBeGreaterThan(boundaries[2]!);
  });

  it("uses Canvas-measured visual widths after pretext chooses text lines", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const markdown = `${emoji.repeat(3)}X`;
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout(markdown, 900);
    const line = layout.lines.find((candidate) => candidate.kind === "text");
    expect(line?.kind).toBe("text");
    if (line?.kind !== "text") return;

    const fragment = line.fragments[0]!;
    const boundaries = measureGraphemeBoundaryXs(fragment.text, fragment.font);
    const measuredWidth = boundaries.at(-1)!;
    expect(fragment.width).toBeCloseTo(measuredWidth, 5);
    expect(line.width).toBeCloseTo(measuredWidth, 5);
  });

  it("places rich inline fragments after Canvas-measured emoji advances", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const markdown = `${emoji}[docs](https://example.com)\`code\``;
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout(markdown, 900);
    const line = layout.lines.find((candidate) => candidate.kind === "text");
    expect(line?.kind).toBe("text");
    if (line?.kind !== "text") return;

    const emojiFragment = line.fragments.find((fragment) => fragment.text === emoji);
    const linkFragment = line.fragments.find((fragment) => fragment.text === "docs");
    const codeFragment = line.fragments.find((fragment) => fragment.text === "code");
    expect(emojiFragment).toBeDefined();
    expect(linkFragment).toBeDefined();
    expect(codeFragment).toBeDefined();

    const emojiWidth = measureGraphemeBoundaryXs(emojiFragment!.text, emojiFragment!.font).at(-1)!;
    const linkWidth = measureGraphemeBoundaryXs(linkFragment!.text, linkFragment!.font).at(-1)!;
    const codeTextWidth = measureGraphemeBoundaryXs(codeFragment!.text, codeFragment!.font).at(-1)!;
    expect(linkFragment!.x).toBeCloseTo(emojiFragment!.x + emojiWidth, 5);
    expect(codeFragment!.x).toBeCloseTo(linkFragment!.x + linkWidth, 5);
    expect(codeFragment!.width).toBeCloseTo(codeTextWidth + 12, 5);
  });

  it("returns opaque lines for code blocks and tables", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
    });
    const layout = engine.layout(
      "```ts\nconst x = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
      520,
    );
    expect(layout.lines.some((line) => line.kind === "opaque")).toBe(true);
  });

  it("keeps Markdown softbreaks collapsed by default", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const layout = engine.layout("abc\ndef", 420);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]?.width).toBeGreaterThan(0);
  });

  it("preserves source newlines as visual line advances when requested", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("abc\ndef\n\nghi", 420);
    const textLines = layout.lines.filter((line) => line.kind === "text");
    expect(textLines).toHaveLength(3);
    expect(textLines[1]?.y).toBe(textLines[0]!.y + textLines[0]!.height);
    expect(textLines[2]?.y).toBe(textLines[0]!.y + textLines[0]!.height * 3);
  });

  it("preserves multiple blank source lines between parsed blocks", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("a\n\nb\n\n\n\nc", 420);
    const textLines = layout.lines.filter((line) => line.kind === "text");
    expect(textLines).toHaveLength(3);
    expect(textLines[1]?.y).toBeCloseTo(textLines[0]!.y + textLines[0]!.height * 2, 5);
    expect(textLines[2]?.y).toBeCloseTo(textLines[0]!.y + textLines[0]!.height * 6, 5);
  });

  it("does not add Markdown block margins on top of source newline gaps", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("a\n\n\nb", 420);
    const textLines = layout.lines.filter((line) => line.kind === "text");
    const sourceLines = layout.sourceLines ?? [];
    const lineHeight = layout.sourceLineHeight ?? Number.NaN;

    expect(textLines).toHaveLength(2);
    expect(sourceLines).toHaveLength(4);
    expect(sourceLines.map((line) => line.kind)).toEqual([
      "rendered",
      "source-only",
      "source-only",
      "rendered",
    ]);
    expect(textLines[1]?.y).toBeCloseTo(textLines[0]!.y + lineHeight * 3, 5);
    for (let index = 1; index < sourceLines.length; index += 1) {
      expect(sourceLines[index]!.y, `source line ${index}`).toBeCloseTo(
        sourceLines[index - 1]!.y + sourceLines[index - 1]!.height,
        5,
      );
    }
  });

  it("preserves leading and trailing source newlines as visual line advances", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const plain = engine.layout("a", 420);
    const padded = engine.layout("\n\na\n\n", 420);
    const plainLine = plain.lines.find((line) => line.kind === "text");
    const paddedLine = padded.lines.find((line) => line.kind === "text");
    expect(plainLine).toBeDefined();
    expect(paddedLine).toBeDefined();
    expect(paddedLine!.y).toBeCloseTo(plainLine!.y + plainLine!.height * 2, 5);
    expect(padded.totalHeight).toBeCloseTo(plain.totalHeight + plainLine!.height * 4, 5);
  });

  it("preserves blank-only source documents as editable visual height", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const blank = engine.layout("\n\n", 420);
    expect(blank.blocks).toHaveLength(0);
    expect(blank.lines).toHaveLength(0);
    expect(blank.sourceLineHeight).toBeGreaterThan(0);
    expect(blank.totalHeight).toBeCloseTo(blank.sourceLineHeight! * 3, 5);
  });

  it("exposes source line layout for long blank runs between Markdown blocks", () => {
    const markdown = [
      "# Canvas native editor",
      "",
      "",
      "asdfsd",
      "",
      "",
      "",
      "",
      "## adddfasdfdsf",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Click text, drag across blocks, then type directly on the rendered canvas.",
      "",
      "- Selection is stored as source offsets.",
      "",
      "",
      "",
      "",
      "",
      "- The hidden textarea mirrors only the active source slice.",
      "- Cross-block replacement uses one source operation.",
      "",
      "Widths iiiii WWWW done.",
      "",
      "Try **bold text**, `inline code`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.",
    ].join("\n");
    const layout = createLayoutEngine({
      fontTheme: "modern",
      lineBreakMode: "source",
    }).layout(markdown, 724);

    expect(layout.sourceLines).toHaveLength(31);
    expect(layout.sourceLines?.filter((line) => line.kind === "source-only")).toHaveLength(22);
    expect(layout.sourceLines?.slice(9, 17).every((line) => line.kind === "source-only")).toBe(
      true,
    );
    expect(layout.sourceLines?.slice(20, 25).every((line) => line.kind === "source-only")).toBe(
      true,
    );

    const sourceLines = layout.sourceLines ?? [];
    for (let index = 1; index < sourceLines.length; index += 1) {
      const previous = sourceLines[index - 1]!;
      const current = sourceLines[index]!;
      expect(current.y, `line ${index}`).toBeCloseTo(previous.y + previous.height, 5);
    }
  });

  it("preserves source newlines inside styled inline content", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("**abc\ndef** and [ghi\njkl](https://example.com)", 420);
    const textLines = layout.lines.filter((line) => line.kind === "text");
    expect(textLines).toHaveLength(3);
    if (
      textLines[0]?.kind === "text" &&
      textLines[1]?.kind === "text" &&
      textLines[2]?.kind === "text"
    ) {
      expect(textLines[0].fragments[0]?.text).toBe("abc");
      expect(textLines[0].fragments[0]?.type).toBe("strong");
      expect(textLines[1].fragments[0]?.text).toBe("def");
      expect(textLines[1].fragments[0]?.type).toBe("strong");
      expect(textLines[1].fragments.some((fragment) => fragment.text === "ghi")).toBe(true);
      expect(textLines[1].fragments.some((fragment) => fragment.type === "link")).toBe(true);
      expect(textLines[2].fragments[0]?.text).toBe("jkl");
      expect(textLines[2].fragments[0]?.type).toBe("link");
    }
  });
});

describe("LayoutStream", () => {
  it("matches the final full layout after streaming input", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
    });
    const markdown = "# Title\n\nA paragraph with **bold** text.\n\n```ts\nconst x = 1\n```";
    const stream = engine.createStream(480);

    stream.push("# Title\n\nA ");
    stream.push("paragraph with **bold** text.\n\n```ts\n");
    stream.push("const x = 1\n```");
    stream.finish();

    const streamedLayout = stream.getLayout();
    const fullLayout = engine.layout(markdown, 480);

    expect(streamedLayout.totalHeight).toBe(fullLayout.totalHeight);
    expect(streamedLayout.blocks).toHaveLength(fullLayout.blocks.length);
    expect(streamedLayout.lines).toHaveLength(fullLayout.lines.length);
  });

  it("matches full layout for incremental middle edits", () => {
    const highlighter = createHighlighter();
    const engine = createLayoutEngine({
      fontTheme: "github",
      highlighter,
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
      highlighter,
    });
    const oldMarkdown = "# Title\n\nParagraph one.\n\n- alpha\n- beta\n\n```ts\nconst x = 1\n```";
    const newMarkdown =
      "# Title\n\nParagraph one updated.\n\n- alpha\n- beta\n\n```ts\nconst x = 1\n```";

    engine.layout(oldMarkdown, 480);
    const incrementalLayout = engine.layout(newMarkdown, 480);
    const fullLayout = freshEngine.layout(newMarkdown, 480);

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
    expect(engine.getLastDirtyFromLayoutBlock()).toBeGreaterThanOrEqual(1);
    expect(incrementalLayout.update).toMatchObject({
      mode: "incremental",
      dirtyFromBlock: expect.any(Number),
      dirtyToBlock: expect.any(Number),
      sourceChange: expect.objectContaining({
        changedChars: expect.any(Number),
      }),
    });
    expect(incrementalLayout.update?.dirtyToBlock).toBeGreaterThan(
      incrementalLayout.update?.dirtyFromBlock ?? -1,
    );
  });

  it("keeps list-heavy incremental layouts equivalent to full layout", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
    });
    const oldMarkdown = "- one\n  - nested item\n- two\n\n> quote";
    const newMarkdown = "- one\n  - nested item updated\n- two\n\n> quote";

    engine.layout(oldMarkdown, 420);
    const incrementalLayout = engine.layout(newMarkdown, 420);
    const fullLayout = freshEngine.layout(newMarkdown, 420);

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
  });

  it("keeps structural block changes equivalent to full layout", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
    });
    const oldMarkdown = [
      "# Title",
      "",
      "A long paragraph keeps the ratio threshold low enough for incremental layout checks.",
      "",
      "| a | b |",
      "| c | d |",
    ].join("\n");
    const newMarkdown = [
      "# Title",
      "",
      "A long paragraph keeps the ratio threshold low enough for incremental layout checks.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| c | d |",
    ].join("\n");

    engine.layout(oldMarkdown, 520);
    const incrementalLayout = engine.layout(newMarkdown, 520);
    const fullLayout = freshEngine.layout(newMarkdown, 520);

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
    expect(engine.getLastDirtyFromLayoutBlock()).toBeGreaterThanOrEqual(1);
  });

  it("keeps source newline gaps equivalent after incremental separator edits", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const oldMarkdown = "a\n\nb";
    const newMarkdown = "a\n\n\nb";

    engine.layout(oldMarkdown, 420);
    const incrementalLayout = engine.layout(newMarkdown, 420);
    const fullLayout = freshEngine.layout(newMarkdown, 420);
    const textLines = incrementalLayout.lines.filter((line) => line.kind === "text");
    const lineHeight = incrementalLayout.sourceLineHeight ?? Number.NaN;

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
    expect(textLines[1]?.y).toBeCloseTo(textLines[0]!.y + lineHeight * 3, 5);
  });

  it("updates reused suffix source block indexes after incremental insertions", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const oldMarkdown = "a\n\nb";
    const newMarkdown = "a\n\ninserted\n\nb";

    engine.layout(oldMarkdown, 420);
    const incrementalLayout = engine.layout(newMarkdown, 420);
    const fullLayout = freshEngine.layout(newMarkdown, 420);

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
    expect(incrementalLayout.blocks.map((block) => block.sourceBlockIndex)).toEqual([0, 1, 2]);
    expect(incrementalLayout.sourceLines?.map((line) => line.kind)).toEqual([
      "rendered",
      "source-only",
      "rendered",
      "source-only",
      "rendered",
    ]);
  });

  it("preserves blank-only source height after incremental deletion", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const freshEngine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const newMarkdown = "\n\n\n";

    engine.layout("a\n\nb", 420);
    const incrementalLayout = engine.layout(newMarkdown, 420);
    const fullLayout = freshEngine.layout(newMarkdown, 420);

    expect(stripVersion(incrementalLayout)).toEqual(stripVersion(fullLayout));
    expect(incrementalLayout.sourceLines).toHaveLength(4);
    expect(incrementalLayout.totalHeight).toBeCloseTo(
      (incrementalLayout.sourceLineHeight ?? 0) * 4,
      5,
    );
  });
});

function stripVersion(layout: DocumentLayout): DocumentLayout {
  return {
    ...layout,
    version: 0,
    update: undefined,
  };
}
