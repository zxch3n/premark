import { describe, expect, it } from "vite-plus/test";

import {
  createIncrementalParseState,
  incrementalParse,
  parseMarkdown,
  StreamParser,
} from "../src/index.ts";
import type { MarkdownBlock, MarkdownInline } from "../src/types.ts";

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
    expectFrozenBlockTree(blocks);
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

  it("covers commonmark and gfm fixture blocks and inline nodes", () => {
    const markdown = [
      "Setext heading",
      "=======",
      "",
      "Paragraph plain 中文 😀 with **strong** and *emphasis* and ***both*** and ~~strike~~ and `code` and [link](https://example.com) and <https://example.org> and ![inline image](./inline.png) and <kbd>html</kbd>",
      "soft line\\",
      "hard line",
      "",
      "---",
      "",
      "    const indented = true",
      "",
      "1. ordered",
      "2. second",
      "   - nested unordered",
      "",
      "- [x] task item",
      "",
      "> quoted block",
      "",
      "| a | b |",
      "| :- | -: |",
      "| c | d |",
      "",
      "<section>block html</section>",
      "",
      "![only image](./asset.png)",
    ].join("\n");

    const blocks = parseMarkdown(markdown);
    const blockTypes = blocks.map((block) => block.type);
    const inlineTypes = collectInlineTypes(blocks);

    expect(blockTypes).toEqual(
      expect.arrayContaining([
        "heading",
        "paragraph",
        "thematic-break",
        "code-block",
        "list",
        "blockquote",
        "table",
        "html-block",
      ]),
    );
    expect(blocks.some((block) => block.type === "list" && block.kind === "ordered")).toBe(true);
    expect(blocks.some((block) => block.type === "list" && block.kind === "unordered")).toBe(true);
    expect(blocks.some(isImageOnlyParagraph)).toBe(true);
    expect(inlineTypes).toEqual(
      expect.arrayContaining([
        "text",
        "strong",
        "emphasis",
        "strikethrough",
        "code-span",
        "link",
        "image",
        "softbreak",
        "hardbreak",
        "html",
      ]),
    );
    expect(hasNestedStrongAndEmphasis(blocks)).toBe(true);
    expect(findLinkHref(blocks, "https://example.org")).toBe(true);
    expect(JSON.stringify(blocks)).toContain("中文");
    expect(JSON.stringify(blocks)).toContain("😀");
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

describe("incrementalParse", () => {
  const forceIncrementalOptions = {
    maxChangedChars: 100_000,
    maxChangedRatio: 1,
    maxChangedLines: 10_000,
  } as const;

  it("reuses unchanged prefix and suffix blocks for a middle edit", () => {
    const oldText = "# Title\n\nAlpha paragraph.\n\nBeta paragraph.\n\n```ts\nconst x = 1\n```";
    const newText =
      "# Title\n\nAlpha paragraph updated.\n\nBeta paragraph.\n\n```ts\nconst x = 1\n```";
    const oldState = createIncrementalParseState(oldText);
    const result = incrementalParse(oldState, newText);

    expect(result.mode).toBe("incremental");
    expect(result.state.blocks).toEqual(parseMarkdown(newText));
    expect(result.state.blocks[0]).toBe(oldState.blocks[0]);
    expect(result.state.blocks.at(-1)).toBe(oldState.blocks.at(-1));
    expect(result.reusedPrefixCount).toBeGreaterThan(0);
    expect(result.reusedSuffixCount).toBeGreaterThan(0);
    expectFrozenBlockTree(result.state.blocks);
  });

  it("falls back to full parse for large edits", () => {
    const oldText = `${"# Title\n\n"}${"paragraph\n\n".repeat(800)}`;
    const newText = `${"# Title\n\n"}${"rewritten\n\n".repeat(800)}`;
    const oldState = createIncrementalParseState(oldText);
    const result = incrementalParse(oldState, newText);

    expect(result.mode).toBe("full");
    expect(result.state.blocks).toEqual(parseMarkdown(newText));
  });

  it("matches full parse across repeated random edits", () => {
    let state = createIncrementalParseState(
      "# Title\n\nParagraph with **bold** text.\n\n- one\n- two\n\n```ts\nconst x = 1\n```",
    );
    const random = createRandom(7);

    for (let iteration = 0; iteration < 25; iteration += 1) {
      const nextText = mutateMarkdown(state.text, random);
      const result = incrementalParse(state, nextText);
      expect(result.state.blocks).toEqual(parseMarkdown(nextText));
      state = result.state;
    }
  });

  it("keeps incremental edits equivalent to full parse across structural cases", () => {
    const cases = [
      {
        name: "append text to paragraph tail",
        oldText: "# Title\n\nAlpha paragraph.",
        newText: "# Title\n\nAlpha paragraph extended.",
      },
      {
        name: "insert text in paragraph middle",
        oldText: "# Title\n\nAlpha paragraph.",
        newText: "# Title\n\nAlpha inserted paragraph.",
      },
      {
        name: "delete text in paragraph middle",
        oldText: "# Title\n\nAlpha redundant paragraph.",
        newText: "# Title\n\nAlpha paragraph.",
      },
      {
        name: "add blank line between paragraphs",
        oldText: "First line\nSecond line",
        newText: "First line\n\nSecond line",
      },
      {
        name: "remove blank line between paragraphs",
        oldText: "First line\n\nSecond line",
        newText: "First line\nSecond line",
      },
      {
        name: "open fenced code block",
        oldText: "Paragraph before code",
        newText: "```ts\nconst x = 1\n",
      },
      {
        name: "close fenced code block",
        oldText: "```ts\nconst x = 1\n",
        newText: "```ts\nconst x = 1\n```",
      },
      {
        name: "turn paragraph into table",
        oldText: "| a | b |\n| c | d |",
        newText: "| a | b |\n| --- | --- |\n| c | d |",
      },
      {
        name: "turn table back into paragraph",
        oldText: "| a | b |\n| --- | --- |\n| c | d |",
        newText: "| a | b |\n| c | d |",
      },
      {
        name: "increase list indentation",
        oldText: "- one\n- two",
        newText: "- one\n  - two",
      },
      {
        name: "decrease list indentation",
        oldText: "- one\n  - two",
        newText: "- one\n- two",
      },
      {
        name: "add blockquote marker",
        oldText: "quoted line",
        newText: "> quoted line",
      },
      {
        name: "remove blockquote marker",
        oldText: "> quoted line",
        newText: "quoted line",
      },
      {
        name: "toggle task checkbox",
        oldText: "- [ ] todo",
        newText: "- [x] todo",
      },
      {
        name: "change code fence info string",
        oldText: "```ts\nconst x = 1\n```",
        newText: "```tsx\nconst x = 1\n```",
      },
    ] satisfies Array<{
      name: string;
      oldText: string;
      newText: string;
    }>;

    for (const testCase of cases) {
      const oldState = createIncrementalParseState(testCase.oldText);
      const result = incrementalParse(oldState, testCase.newText, forceIncrementalOptions);

      expect(result.mode, testCase.name).toBe("incremental");
      expect(result.state.blocks, testCase.name).toEqual(parseMarkdown(testCase.newText));
    }
  });
});

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function mutateMarkdown(text: string, random: () => number): string {
  const operations = [
    () => insertSnippet(text, random),
    () => replaceSnippet(text, random),
    () => removeSnippet(text, random),
  ];
  return operations[Math.floor(random() * operations.length)]();
}

function insertSnippet(text: string, random: () => number): string {
  const snippets = [" more", "\n\nNew paragraph.", "**bold**", "`code`", "\n- item"];
  const index = Math.floor(random() * (text.length + 1));
  const snippet = snippets[Math.floor(random() * snippets.length)];
  return `${text.slice(0, index)}${snippet}${text.slice(index)}`;
}

function replaceSnippet(text: string, random: () => number): string {
  if (text.length === 0) {
    return insertSnippet(text, random);
  }

  const start = Math.floor(random() * text.length);
  const end = Math.min(text.length, start + Math.floor(random() * 8) + 1);
  const replacement = ["X", " update", "~~gone~~", "\n\n## Heading", " [link](https://e.com)"][
    Math.floor(random() * 5)
  ];
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function removeSnippet(text: string, random: () => number): string {
  if (text.length < 4) {
    return text;
  }

  const start = Math.floor(random() * (text.length - 1));
  const end = Math.min(text.length, start + Math.floor(random() * 6) + 1);
  return `${text.slice(0, start)}${text.slice(end)}`;
}

function collectInlineTypes(blocks: readonly MarkdownBlock[]): string[] {
  const output: string[] = [];

  const visitBlocks = (nodes: readonly MarkdownBlock[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case "heading":
        case "paragraph":
          visitInline(node.children);
          break;
        case "list":
          for (const item of node.items) {
            visitBlocks(item.children);
          }
          break;
        case "blockquote":
          visitBlocks(node.children);
          break;
        case "table":
          for (const cell of node.head.cells) {
            visitInline(cell.children);
          }
          for (const row of node.body.rows) {
            for (const cell of row.cells) {
              visitInline(cell.children);
            }
          }
          break;
        default:
          break;
      }
    }
  };

  const visitInline = (nodes: readonly MarkdownInline[]) => {
    for (const node of nodes) {
      output.push(node.type);
      switch (node.type) {
        case "strong":
        case "emphasis":
        case "strikethrough":
        case "link":
        case "image":
          visitInline(node.children);
          break;
        default:
          break;
      }
    }
  };

  visitBlocks(blocks);
  return output;
}

function hasNestedStrongAndEmphasis(blocks: readonly MarkdownBlock[]): boolean {
  const visitInline = (nodes: readonly MarkdownInline[]): boolean =>
    nodes.some((node) => {
      switch (node.type) {
        case "strong":
          return (
            node.children.some((child) => child.type === "emphasis") || visitInline(node.children)
          );
        case "emphasis":
          return (
            node.children.some((child) => child.type === "strong") || visitInline(node.children)
          );
        case "strikethrough":
        case "link":
        case "image":
          return visitInline(node.children);
        default:
          return false;
      }
    });

  return blocks.some((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return visitInline(block.children);
      case "list":
        return block.items.some((item) => hasNestedStrongAndEmphasis(item.children));
      case "blockquote":
        return hasNestedStrongAndEmphasis(block.children);
      case "table":
        return (
          block.head.cells.some((cell) => visitInline(cell.children)) ||
          block.body.rows.some((row) => row.cells.some((cell) => visitInline(cell.children)))
        );
      default:
        return false;
    }
  });
}

function isImageOnlyParagraph(block: MarkdownBlock): boolean {
  return (
    block.type === "paragraph" && block.children.length === 1 && block.children[0]?.type === "image"
  );
}

function findLinkHref(blocks: readonly MarkdownBlock[], href: string): boolean {
  const visitInline = (nodes: readonly MarkdownInline[]): boolean =>
    nodes.some((node) => {
      switch (node.type) {
        case "link":
          return node.href === href || visitInline(node.children);
        case "strong":
        case "emphasis":
        case "strikethrough":
        case "image":
          return visitInline(node.children);
        default:
          return false;
      }
    });

  return blocks.some((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return visitInline(block.children);
      case "list":
        return block.items.some((item) => findLinkHref(item.children, href));
      case "blockquote":
        return findLinkHref(block.children, href);
      case "table":
        return (
          block.head.cells.some((cell) => visitInline(cell.children)) ||
          block.body.rows.some((row) => row.cells.some((cell) => visitInline(cell.children)))
        );
      default:
        return false;
    }
  });
}

function expectFrozenBlockTree(blocks: readonly MarkdownBlock[]): void {
  expect(Object.isFrozen(blocks)).toBe(true);

  const visitInline = (nodes: readonly MarkdownInline[]) => {
    expect(Object.isFrozen(nodes)).toBe(true);

    for (const node of nodes) {
      expect(Object.isFrozen(node)).toBe(true);
      switch (node.type) {
        case "strong":
        case "emphasis":
        case "strikethrough":
        case "link":
        case "image":
          visitInline(node.children);
          break;
        default:
          break;
      }
    }
  };

  for (const block of blocks) {
    expect(Object.isFrozen(block)).toBe(true);
    switch (block.type) {
      case "heading":
      case "paragraph":
        visitInline(block.children);
        break;
      case "list":
        expect(Object.isFrozen(block.items)).toBe(true);
        for (const item of block.items) {
          expect(Object.isFrozen(item)).toBe(true);
          expectFrozenBlockTree(item.children);
        }
        break;
      case "blockquote":
        expectFrozenBlockTree(block.children);
        break;
      case "table":
        expect(Object.isFrozen(block.head)).toBe(true);
        expect(Object.isFrozen(block.body)).toBe(true);
        expect(Object.isFrozen(block.head.cells)).toBe(true);
        for (const cell of block.head.cells) {
          expect(Object.isFrozen(cell)).toBe(true);
          visitInline(cell.children);
        }
        expect(Object.isFrozen(block.body.rows)).toBe(true);
        for (const row of block.body.rows) {
          expect(Object.isFrozen(row)).toBe(true);
          expect(Object.isFrozen(row.cells)).toBe(true);
          for (const cell of row.cells) {
            expect(Object.isFrozen(cell)).toBe(true);
            visitInline(cell.children);
          }
        }
        break;
      default:
        break;
    }
  }
}
