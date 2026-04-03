import { describe, expect, it } from "vite-plus/test";

import { createHighlighter } from "../../highlight/src/index.ts";

import { createLayoutEngine } from "../src/index.ts";

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
});
