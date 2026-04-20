import { describe, expect, it } from "vite-plus/test";

import {
  appendIncrementalParse,
  createIncrementalParseState,
  createMarkdownInlineSourceMap,
  createMarkdownBlockRecords,
  findBlockSpanAtOffset,
  findBlockSpanById,
  findInlineSourceRecordsAtOffset,
  incrementalParse,
  parseMarkdown,
  StreamParser,
} from "../src/index.ts";
import type { MarkdownBlock, MarkdownInline } from "../src/types.ts";

const forceIncrementalOptions = {
  maxChangedChars: 100_000,
  maxChangedRatio: 1,
  maxChangedLines: 10_000,
} as const;

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

  it("captures heading inline content for ATX and Setext variants", () => {
    expect(parseMarkdown("# Hello World")[0]).toMatchObject({
      type: "heading",
      level: 1,
      children: [{ type: "text", text: "Hello World" }],
    });
    expect(parseMarkdown("# Closed ATX #")[0]).toMatchObject({
      type: "heading",
      level: 1,
      children: [{ type: "text", text: "Closed ATX" }],
    });
    expect(parseMarkdown("Hello\n=====")[0]).toMatchObject({
      type: "heading",
      level: 1,
      children: [{ type: "text", text: "Hello" }],
    });
    expect(parseMarkdown("Hello\n-----")[0]).toMatchObject({
      type: "heading",
      level: 2,
      children: [{ type: "text", text: "Hello" }],
    });
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

  it("promotes bare HTTP URLs to links without swallowing trailing punctuation", () => {
    const url = "https://example.com/path_(ok)?q=1";
    const blocks = parseMarkdown(`Visit ${url}.`);

    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "Visit " },
        {
          type: "link",
          href: url,
          children: [{ type: "text", text: url }],
        },
        { type: "text", text: "." },
      ],
    });
    expect(findLinkHref(blocks, url)).toBe(true);
  });

  it("does not promote bare URLs inside code spans or Markdown link labels", () => {
    const blocks = parseMarkdown("`https://code.example` [https://label.example](./target)");

    expect(findLinkHref(blocks, "https://code.example")).toBe(false);
    expect(findLinkHref(blocks, "https://label.example")).toBe(false);
    expect(findLinkHref(blocks, "./target")).toBe(true);
  });

  it("does not promote escaped URL-shaped control text", () => {
    const blocks = parseMarkdown("\\(https://example\\.com\\)");

    expect(findLinkHref(blocks, "https://example")).toBe(false);
    expect(JSON.stringify(blocks)).toContain("https://example");
  });

  it("emits block records and inline source records for bare URL links", () => {
    const url = "https://example.com?a=1&b=2";
    const markdown = `Visit ${url}.`;
    const state = createIncrementalParseState(markdown);
    const blockRecords = createMarkdownBlockRecords(state);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const linkSource = inlineSources.find((record) => record.type === "link");

    expect(blockRecords[0]).toMatchObject({
      type: "paragraph",
      renderedText: `Visit ${url}.`,
      links: [{ href: url, text: url, kind: "link" }],
    });
    expect(linkSource).toMatchObject({
      type: "link",
      source: { from: "Visit ".length, to: "Visit ".length + url.length },
      sourceText: url,
      renderedText: url,
    });
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("example"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "link", sourceText: url })]),
    );
  });

  it("preserves plaintext-visible inline source instead of dropping parser nodes", () => {
    const markdown = "A &amp; B &#x1F600; C <!-- note --> D";
    const blocks = parseMarkdown(markdown);
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);

    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "A " },
        { type: "text", text: "&" },
        { type: "text", text: " B " },
        { type: "text", text: "😀" },
        { type: "text", text: " C " },
        { type: "html", content: "<!-- note -->" },
        { type: "text", text: " D" },
      ],
    });
    expect(inlineSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          sourceText: "&amp;",
          renderedText: "&",
        }),
        expect.objectContaining({
          type: "text",
          sourceText: "&#x1F600;",
          renderedText: "😀",
        }),
        expect.objectContaining({
          type: "html",
          sourceText: "<!-- note -->",
          renderedText: "<!-- note -->",
        }),
      ]),
    );
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
  it("tracks source ranges and stable content ids in block spans", () => {
    const oldText = "# Title\n\nAlpha paragraph.\n\nBeta paragraph.";
    const newText = "# Title\n\nAlpha paragraph updated.\n\nBeta paragraph.";
    const oldState = createIncrementalParseState(oldText);
    const result = incrementalParse(oldState, newText);
    const betaSpan = result.state.blockSpans.at(-1);

    expect(result.state.blockSpans[0]).toMatchObject({
      from: 0,
      to: 7,
      type: "heading",
    });
    expect(result.state.blockSpans[0]?.id).toBe(oldState.blockSpans[0]?.id);
    expect(betaSpan?.id).toBe(oldState.blockSpans.at(-1)?.id);
    expect(betaSpan).toMatchObject({
      from: 35,
      to: 50,
      type: "paragraph",
    });
    expect(findBlockSpanAtOffset(result.state, 36)?.id).toBe(betaSpan?.id);
    expect(findBlockSpanById(result.state, betaSpan!.id)).toEqual(betaSpan);
  });

  it("derives rendered block records for search and canvas indexing", () => {
    const state = createIncrementalParseState(
      [
        "# Guide",
        "",
        "Paragraph with [docs](https://example.com) and ![image](./asset.png).",
        "",
        "## Details",
        "",
        "- task item",
      ].join("\n"),
    );
    const records = createMarkdownBlockRecords(state);

    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      type: "heading",
      renderedText: "Guide",
      headingPath: [{ level: 1, text: "Guide" }],
    });
    expect(records[1]).toMatchObject({
      type: "paragraph",
      renderedText: "Paragraph with docs and image.",
      headingPath: [{ level: 1, text: "Guide" }],
      links: [
        { href: "https://example.com", text: "docs", kind: "link" },
        { href: "./asset.png", text: "image", kind: "image" },
      ],
    });
    expect(records[2].headingPath.map((entry) => entry.text)).toEqual(["Guide", "Details"]);
    expect(records[3].headingPath.map((entry) => entry.text)).toEqual(["Guide", "Details"]);
  });

  it("tracks block and inline source ranges across Markdown structures", () => {
    const markdown = [
      "# Heading with `code`",
      "",
      "Paragraph with **strong** and [docs](https://example.com).",
      "",
      "- [x] done",
      "- nested [item](./item.md)",
      "",
      "> quote *emphasis*",
      "",
      "| A | B |",
      "| - | - |",
      "| cell `code` | [link](./table.md) |",
      "",
      "```ts",
      "const x = 1",
      "```",
    ].join("\n");
    const state = createIncrementalParseState(markdown);
    const inlineSources = createMarkdownInlineSourceMap(state);
    const blockSources = state.blockSpans.map((span) => markdown.slice(span.from, span.to));

    expect(blockSources).toEqual([
      "# Heading with `code`",
      "Paragraph with **strong** and [docs](https://example.com).",
      "- [x] done\n- nested [item](./item.md)",
      "> quote *emphasis*",
      "| A | B |\n| - | - |\n| cell `code` | [link](./table.md) |",
      "```ts\nconst x = 1\n```",
    ]);

    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("Heading"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          sourceText: "Heading with ",
          blockId: state.blockSpans[0]?.id,
        }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("code"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "code-span",
          sourceText: "`code`",
        }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("strong"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "strong", sourceText: "**strong**" }),
        expect.objectContaining({ type: "text", sourceText: "strong" }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("docs"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "link", sourceText: "[docs](https://example.com)" }),
        expect.objectContaining({ type: "text", sourceText: "docs" }),
      ]),
    );
    expect(inlineSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", sourceText: "[x]", renderedText: "[x]" }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("emphasis"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "emphasis", sourceText: "*emphasis*" }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("./table.md"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "link", sourceText: "[link](./table.md)" }),
      ]),
    );
    expect(findInlineSourceRecordsAtOffset(inlineSources, markdown.indexOf("const x"))).toEqual([]);
  });

  it("distinguishes content dirty blocks from reused blocks that only need layout movement", () => {
    const oldState = createIncrementalParseState("# Title\n\nAlpha\n\nBeta\n\nGamma");
    const result = incrementalParse(
      oldState,
      "# Title\n\nAlpha changed\n\nBeta\n\nGamma",
      forceIncrementalOptions,
    );

    expect(result.blockDirtyRanges).toEqual([
      { kind: "content", fromBlock: 1, toBlock: 2 },
      { kind: "layout", fromBlock: 2, toBlock: 4 },
    ]);
    expect(result.state.blocks[0]).toBe(oldState.blocks[0]);
    expect(result.state.blocks[2]).toBe(oldState.blocks[2]);
    expect(result.state.blocks[3]).toBe(oldState.blocks[3]);
  });

  it("keeps block ids stable across insertion, deletion, append and structural edits", () => {
    const base = createIncrementalParseState("# Title\n\nAlpha\n\nBeta");
    const inserted = incrementalParse(base, "# Title\n\nAlpha\n\nInserted\n\nBeta");

    expect(inserted.state.blockSpans[0]?.id).toBe(base.blockSpans[0]?.id);
    expect(inserted.state.blockSpans[1]?.id).toBe(base.blockSpans[1]?.id);
    expect(inserted.state.blockSpans[3]?.id).toBe(base.blockSpans[2]?.id);

    const deleted = incrementalParse(inserted.state, "# Title\n\nAlpha\n\nBeta");
    expect(deleted.state.blockSpans.map((span) => span.id)).toEqual(
      base.blockSpans.map((span) => span.id),
    );

    const appended = appendIncrementalParse(base, "\n\nGamma");
    expect(appended.state.blockSpans.slice(0, 3).map((span) => span.id)).toEqual(
      base.blockSpans.map((span) => span.id),
    );

    const structural = incrementalParse(base, "# Title\n\n## Alpha\n\nBeta");
    expect(structural.state.blockSpans[0]?.id).toBe(base.blockSpans[0]?.id);
    expect(structural.state.blockSpans[1]?.id).not.toBe(base.blockSpans[1]?.id);
    expect(structural.state.blockSpans[2]?.id).toBe(base.blockSpans[2]?.id);
  });

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

describe("appendIncrementalParse", () => {
  it("matches full parse for append-only updates while reusing the stable prefix", () => {
    const oldText = "# Title\n\nAlpha paragraph.";
    const chunk = " Extended with **bold** text.\n\n```ts\nconst x = 1\n```";
    const oldState = createIncrementalParseState(oldText);
    const result = appendIncrementalParse(oldState, chunk, forceIncrementalOptions);

    expect(result.mode).toBe("incremental");
    expect(result.state.blocks).toEqual(parseMarkdown(oldText + chunk));
    expect(result.reusedPrefixCount).toBeGreaterThan(0);
    expect(result.reusedSuffixCount).toBe(0);
    expect(result.state.blocks[0]).toBe(oldState.blocks[0]);
  });

  it("keeps append and replace paths equivalent for the same appended text", () => {
    const oldText = "# Title\n\nAlpha paragraph.";
    const chunk = "\n\nAnother paragraph with `code`.";
    const oldState = createIncrementalParseState(oldText);
    const appendResult = appendIncrementalParse(oldState, chunk, forceIncrementalOptions);
    const replaceResult = incrementalParse(oldState, oldText + chunk, forceIncrementalOptions);

    expect(appendResult.state.blocks).toEqual(replaceResult.state.blocks);
    expect(appendResult.mode).toBe("incremental");
    expect(replaceResult.mode).toBe("incremental");
  });

  it("extends the tail heading as characters stream in", () => {
    const text = "# Building a High-Performance Pipeline\n\nBody paragraph.";
    let state = createIncrementalParseState("");
    for (let i = 0; i < text.length; i += 3) {
      state = appendIncrementalParse(state, text.slice(i, i + 3), forceIncrementalOptions).state;
    }
    expect(state.blocks).toEqual(parseMarkdown(text));
  });

  it("extends a setext heading as its underline streams in", () => {
    const text = "Heading text\n=====\n\nBody paragraph.";
    let state = createIncrementalParseState("");
    for (const char of text) {
      state = appendIncrementalParse(state, char, forceIncrementalOptions).state;
    }
    expect(state.blocks).toEqual(parseMarkdown(text));
  });

  it("keeps mid-document headings intact when streamed character by character", () => {
    const text = [
      "Intro paragraph.",
      "",
      "# First Heading",
      "",
      "Body after first.",
      "",
      "## Second Heading",
      "",
      "Body after second.",
      "",
      "### Third Heading",
      "",
      "Body after third.",
      "",
      "---",
      "",
      "Subtitle",
      "========",
      "",
      "Final body.",
    ].join("\n");

    let state = createIncrementalParseState("");
    for (const char of text) {
      state = appendIncrementalParse(state, char, forceIncrementalOptions).state;
    }
    expect(state.blocks).toEqual(parseMarkdown(text));
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
