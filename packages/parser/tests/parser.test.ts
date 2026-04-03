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
    expect(blocks[2]).toMatchObject({ type: "list", kind: "unordered" });
    expect(blocks[3]).toMatchObject({ type: "code-block", info: "ts" });
  });

  it("parses GFM table, blockquote, html block, image and inline styles", () => {
    const blocks = parseMarkdown(
      [
        "> quoted **strong** and ~~strike~~",
        "",
        "| a | b |",
        "| :- | -: |",
        "| c | d |",
        "",
        "<div>inline html block</div>",
        "",
        "![sample](./asset.png)",
      ].join("\n"),
    );

    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ type: "blockquote" });
    expect(blocks[0]).toMatchObject({
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", text: "quoted " },
            { type: "strong" },
            { type: "text", text: " and " },
            { type: "strikethrough" },
          ],
        },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: "table",
      head: {
        cells: [{ align: "left" }, { align: "right" }],
      },
      body: {
        rows: [{ cells: [{}, {}] }],
      },
    });
    expect(blocks[2]).toMatchObject({
      type: "html-block",
      content: "<div>inline html block</div>",
    });
    expect(blocks[3]).toMatchObject({
      type: "paragraph",
      children: [{ type: "image", href: "./asset.png" }],
    });
  });

  it("normalizes task list items into paragraph content", () => {
    const blocks = parseMarkdown("- [x] done\n- [ ] todo");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "list",
      items: [
        {
          checked: true,
          children: [
            {
              type: "paragraph",
              children: [
                { type: "text", text: "[x] " },
                { type: "text", text: "done" },
              ],
            },
          ],
        },
        {
          checked: false,
          children: [
            {
              type: "paragraph",
              children: [
                { type: "text", text: "[ ] " },
                { type: "text", text: "todo" },
              ],
            },
          ],
        },
      ],
    });
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
    expect(second.partialBlocks).toHaveLength(1);

    const final = parser.finish();
    expect(final.emittedBlocks).toHaveLength(1);
    expect(final.closedBlocks).toHaveLength(3);
    expect(final.partialBlocks).toHaveLength(0);
  });

  it("treats unfinished fenced code blocks as partial until finish", () => {
    const parser = new StreamParser();
    const first = parser.push("```ts\nconst x = 1\n");
    expect(first.closedBlocks).toHaveLength(0);
    expect(first.partialBlocks).toMatchObject([{ type: "code-block", info: "ts" }]);

    const second = parser.push("```\n");
    expect(second.closedBlocks).toMatchObject([{ type: "code-block", info: "ts" }]);
    expect(second.partialBlocks).toHaveLength(0);
  });
});
