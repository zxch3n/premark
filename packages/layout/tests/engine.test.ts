import { describe, expect, it } from "vite-plus/test";

import { createHighlighter } from "../../highlight/src/index.ts";

import { createLayoutEngine } from "../src/index.ts";
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
});

function stripVersion(layout: DocumentLayout): DocumentLayout {
  return {
    ...layout,
    version: 0,
  };
}
