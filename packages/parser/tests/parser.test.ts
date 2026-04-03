import { describe, expect, it } from "vite-plus/test";

import { parseMarkdown, StreamParser } from "../src/index.ts";

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists and code blocks", () => {
    const blocks = parseMarkdown(
      "# Hello\n\nParagraph.\n\n- one\n- two\n\n```ts\nconst x = 1\n```",
    );
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect(blocks[2]).toMatchObject({ type: "list" });
    expect(blocks[3]).toMatchObject({ type: "code-block" });
  });
});

describe("StreamParser", () => {
  it("emits only closed blocks while keeping partial blocks available", () => {
    const parser = new StreamParser();
    const first = parser.push("# Title\nParagraph");
    expect(first.emittedBlocks).toHaveLength(1);
    expect(first.closedBlocks).toHaveLength(1);
    expect(first.partialBlocks).toHaveLength(1);

    const second = parser.push(" tail\n\nAnother block");
    expect(second.emittedBlocks).toHaveLength(1);
    expect(second.closedBlocks).toHaveLength(2);
    expect(second.partialBlocks.length).toBeGreaterThanOrEqual(1);

    const final = parser.finish();
    expect(final.emittedBlocks).toHaveLength(1);
    expect(final.closedBlocks).toHaveLength(3);
    expect(final.partialBlocks).toHaveLength(0);
  });
});
