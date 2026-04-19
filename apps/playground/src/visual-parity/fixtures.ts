export interface VisualParityFixture {
  id: string;
  name: string;
  markdown: string;
  width?: number;
  category: string;
  parityStatus?: VisualParityStatus;
}

export type VisualParityStatus = "pass" | "acceptable-mismatch" | "known-blocker";

const wrappingText =
  "This paragraph wraps across multiple lines so the harness can compare line breaks, line height, and block height between Premark and the CodeMirror overlay.";

export const visualParityFixtures: VisualParityFixture[] = [
  {
    id: "paragraph-short",
    name: "Paragraph short",
    category: "paragraph",
    markdown: "A short paragraph with plain text.",
  },
  {
    id: "paragraph-wrapping",
    name: "Paragraph wrapping",
    category: "paragraph",
    markdown: wrappingText,
    width: 420,
  },
  {
    id: "paragraph-softbreak",
    name: "Paragraph soft break",
    category: "paragraph",
    markdown: "First line\nsecond line in the same paragraph.",
  },
  {
    id: "paragraph-hardbreak",
    name: "Paragraph hard break",
    category: "paragraph",
    markdown: "First line\\\nsecond line after a hard break.",
  },
  {
    id: "text-cjk-mixed",
    name: "Mixed CJK and Latin",
    category: "text",
    markdown: "中文段落 mixed with Latin words and numbers 12345, used to check font fallback.",
    width: 420,
  },
  {
    id: "text-emoji-combining",
    name: "Emoji and combining marks",
    category: "text",
    markdown: "Emoji 😀😄 and combining marks cafe\u0301 nai\u0308ve should keep stable widths.",
    width: 420,
  },
  {
    id: "heading-h1",
    name: "Heading H1",
    category: "heading",
    markdown: "# Heading Level One",
  },
  {
    id: "heading-h2-wrap",
    name: "Heading H2 wrapping",
    category: "heading",
    markdown: "## A long heading that wraps across multiple visual lines in a narrow container",
    width: 420,
  },
  {
    id: "heading-h3",
    name: "Heading H3",
    category: "heading",
    markdown: "### Heading Level Three",
  },
  {
    id: "inline-strong-emphasis",
    name: "Strong and emphasis",
    category: "inline",
    markdown: "This line has **strong text**, _emphasis_, and ***both styles*** together.",
    width: 520,
  },
  {
    id: "inline-code-link",
    name: "Inline code and link",
    category: "inline",
    markdown: "Use `inlineCode(value)` and visit [the docs](https://example.com/docs).",
    width: 520,
  },
  {
    id: "inline-strikethrough",
    name: "Strikethrough",
    category: "inline",
    markdown: "Keep current text and ~~remove this phrase~~ in the rendered view.",
  },
  {
    id: "list-unordered",
    name: "Unordered list",
    category: "list",
    markdown:
      "- First item\n- Second item with enough content to wrap onto another line in the editor",
    width: 420,
  },
  {
    id: "list-ordered",
    name: "Ordered list",
    category: "list",
    markdown: "1. First ordered item\n2. Second ordered item with wrapping content for comparison",
    width: 420,
  },
  {
    id: "list-task",
    name: "Task list",
    category: "list",
    markdown: "- [x] Completed item\n- [ ] Pending item",
  },
  {
    id: "blockquote-basic",
    name: "Blockquote",
    category: "blockquote",
    markdown: "> A quoted paragraph with **strong text** and enough words to wrap in the viewport.",
    width: 420,
  },
  {
    id: "blockquote-nested",
    name: "Nested blockquote",
    category: "blockquote",
    markdown: "> Outer quote\n>\n> > Nested quote content",
  },
  {
    id: "code-fenced",
    name: "Fenced code",
    category: "code",
    markdown: "```ts\nconst value = 1\nconsole.log(value)\n```",
  },
  {
    id: "table-basic",
    name: "Basic table",
    category: "table",
    markdown: "| Name | Value |\n| --- | ---: |\n| Alpha | 10 |\n| Beta | 20 |",
    width: 520,
  },
  {
    id: "image-only",
    name: "Image-only paragraph",
    category: "image",
    markdown: "![Sample image](https://example.com/sample.png)",
    width: 520,
  },
  {
    id: "mixed-document",
    name: "Mixed document",
    category: "mixed",
    markdown: [
      "# Mixed Document",
      "",
      "A paragraph with **bold**, _italic_, `code`, and [link](https://example.com).",
      "",
      "- First item",
      "- Second item with wrapping content",
      "",
      "> Quoted note",
      "",
      "```js",
      "console.log('hello')",
      "```",
    ].join("\n"),
    width: 560,
  },
  {
    id: "paragraph-two-blocks",
    name: "Two paragraphs",
    category: "paragraph",
    markdown: "First paragraph with short text.\n\nSecond paragraph with short text.",
  },
  {
    id: "paragraph-narrow-wrap",
    name: "Narrow paragraph wrap",
    category: "paragraph",
    markdown: `${wrappingText} Another sentence keeps the wrap stable.`,
    width: 460,
  },
  {
    id: "paragraph-punctuation",
    name: "Punctuation and symbols",
    category: "text",
    markdown: "Punctuation: comma, period. Symbols: + - = / % # @ & should keep steady spacing.",
    width: 420,
  },
  {
    id: "text-cjk-dense",
    name: "Dense CJK",
    category: "text",
    markdown: "这是一个更长的中文段落，用来检查连续中文字符在窄容器中的换行和行高是否稳定。",
    width: 360,
  },
  {
    id: "text-mixed-numbers",
    name: "Mixed numbers",
    category: "text",
    markdown: "Version 1.2.3, dates 2026-04-19, and values 3.14159 / 100% need predictable width.",
  },
  {
    id: "text-japanese-fallback",
    name: "Japanese font fallback",
    category: "text",
    markdown: "日本語の文章 mixed with Latin text checks fallback font metrics and wrapping.",
    width: 420,
  },
  {
    id: "text-korean-fallback",
    name: "Korean font fallback",
    category: "text",
    markdown: "한국어 문장 mixed with English words checks fallback font metrics.",
    width: 420,
  },
  {
    id: "text-cjk-emoji-fallback",
    name: "CJK emoji fallback",
    category: "text",
    markdown: "中文 日本語 한국어 emoji 😀 plus Latin text should stay measurable.",
    width: 420,
  },
  {
    id: "heading-h4",
    name: "Heading H4",
    category: "heading",
    markdown: "#### Heading Level Four",
  },
  {
    id: "heading-h5",
    name: "Heading H5",
    category: "heading",
    markdown: "##### Heading Level Five",
  },
  {
    id: "heading-h6",
    name: "Heading H6",
    category: "heading",
    markdown: "###### Heading Level Six",
  },
  {
    id: "heading-multiple",
    name: "Multiple headings",
    category: "heading",
    markdown: "# One\n\n## Two\n\n### Three",
  },
  {
    id: "inline-nested",
    name: "Nested inline styles",
    category: "inline",
    markdown: "Nested ***strong emphasis*** plus **bold `code` text** in one paragraph.",
    width: 520,
  },
  {
    id: "inline-many-code",
    name: "Many inline code spans",
    category: "inline",
    markdown: "Use `parse()`, `layout()`, and `render()` in the same sentence.",
  },
  {
    id: "inline-two-links",
    name: "Two links",
    category: "inline",
    markdown: "Open [alpha](https://a.example) and [beta](https://b.example) links.",
  },
  {
    id: "list-single-item",
    name: "Single list item",
    category: "list",
    markdown: "- Single unordered item",
  },
  {
    id: "list-nested-unordered",
    name: "Nested unordered list",
    category: "list",
    markdown: "- Parent item\n  - Nested item\n- Sibling item",
    width: 420,
  },
  {
    id: "list-long-marker",
    name: "Long ordered marker",
    category: "list",
    markdown: "98. Ninety eight\n99. Ninety nine\n100. One hundred wraps with extra content",
    width: 420,
  },
  {
    id: "blockquote-two-lines",
    name: "Blockquote two lines",
    category: "blockquote",
    markdown: "> First quoted line\n> second quoted line in same quote",
    width: 420,
  },
  {
    id: "blockquote-with-list",
    name: "Blockquote with list",
    category: "blockquote",
    markdown: "> - quoted item\n> - another quoted item",
    width: 420,
  },
  {
    id: "code-no-language",
    name: "Code block without language",
    category: "code",
    markdown: "```\nplain code line\nanother line\n```",
  },
  {
    id: "code-long-line",
    name: "Code block long line",
    category: "code",
    markdown:
      "```txt\nconst longLine = 'this code line wraps inside the same opaque code block comparison surface'\n```",
    width: 420,
  },
  {
    id: "table-alignment",
    name: "Table alignment",
    category: "table",
    markdown: "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |",
    width: 560,
  },
  {
    id: "table-inline",
    name: "Table inline content",
    category: "table",
    markdown: "| Inline | Value |\n| --- | --- |\n| **bold** | `code` |",
    width: 560,
  },
  {
    id: "table-wrapping",
    name: "Table wrapping cells",
    category: "table",
    markdown:
      "| Column | Description |\n| --- | --- |\n| Alpha | A longer cell that should wrap when measured by the renderer |",
    width: 420,
  },
  {
    id: "image-with-alt",
    name: "Image with longer alt",
    category: "image",
    markdown: "![A longer image description](https://example.com/asset.png)",
    width: 520,
  },
  {
    id: "thematic-break",
    name: "Thematic break",
    category: "deferred",
    markdown: "Before\n\n---\n\nAfter",
  },
  {
    id: "html-block",
    name: "HTML block",
    category: "deferred",
    markdown: "<section><strong>HTML block</strong> content</section>",
  },
  {
    id: "setext-heading",
    name: "Setext heading",
    category: "deferred",
    markdown: "Setext Heading\n==============",
  },
  {
    id: "reference-link",
    name: "Reference link",
    category: "deferred",
    markdown: "Read [the docs][docs].\n\n[docs]: https://example.com/docs",
  },
  {
    id: "autolink",
    name: "Autolink",
    category: "deferred",
    markdown: "Visit <https://example.com/autolink> for details.",
  },
  {
    id: "mixed-long",
    name: "Long mixed document",
    category: "mixed",
    markdown: [
      "# Long Mixed",
      "",
      wrappingText,
      "",
      "## Details",
      "",
      "1. Ordered item with `code`",
      "2. Ordered item with [link](https://example.com)",
      "",
      "> Quote with **bold** text",
      "",
      "| Key | Value |",
      "| --- | --- |",
      "| one | two |",
    ].join("\n"),
    width: 560,
  },
  {
    id: "mixed-cjk-list",
    name: "Mixed CJK list",
    category: "mixed",
    markdown: "## 任务\n\n- 第一项 mixed text\n- 第二项 with `code`\n\n段落继续显示中文和 English.",
    width: 460,
  },
  {
    id: "mixed-code-quote",
    name: "Mixed code quote",
    category: "mixed",
    markdown: "> Quote before code\n\n```ts\nconst inside = true\n```\n\nAfter code paragraph.",
    width: 520,
  },
];

export function getVisualParityFixture(id: string | null): VisualParityFixture {
  return visualParityFixtures.find((fixture) => fixture.id === id) ?? visualParityFixtures[0]!;
}

export function getVisualParityStatus(fixture: VisualParityFixture): VisualParityStatus {
  return fixture.parityStatus ?? (fixture.category === "deferred" ? "known-blocker" : "pass");
}
