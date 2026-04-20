export interface VisualParityFixture {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
  readonly caretNeedle: string;
  readonly selectionFromNeedle: string;
  readonly selectionToNeedle: string;
  readonly expectedText: readonly string[];
}

const inlineSvgImage =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='120'%20height='72'%3E%3Crect%20width='120'%20height='72'%20fill='%23d7efe5'/%3E%3Ccircle%20cx='36'%20cy='36'%20r='18'%20fill='%234a8f72'/%3E%3Cpath%20d='M68%2054%2098%2022%20114%2054z'%20fill='%232f5f8f'/%3E%3C/svg%3E";

export const visualParityFixtures: readonly VisualParityFixture[] = [
  {
    id: "headings-inline",
    title: "Headings And Inline",
    markdown:
      "# Heading one\n\n## Heading two\n\nParagraph with **bold**, _emphasis_, `code`, and ~~strike~~.",
    caretNeedle: "Heading two",
    selectionFromNeedle: "Paragraph",
    selectionToNeedle: "strike",
    expectedText: ["Heading one", "Heading two", "bold", "emphasis", "code", "strike"],
  },
  {
    id: "lists-quotes",
    title: "Lists And Quotes",
    markdown: [
      "- Alpha item",
      "- [x] Done task",
      "  - Nested item",
      "",
      "> Quote with **bold** text",
      "> and a second source line.",
    ].join("\n"),
    caretNeedle: "Nested item",
    selectionFromNeedle: "Alpha",
    selectionToNeedle: "second",
    expectedText: ["Alpha item", "Done task", "Nested item", "Quote", "second source line"],
  },
  {
    id: "code-table",
    title: "Code And Table",
    markdown: [
      "```ts",
      "const answer = 42;",
      "console.log(answer);",
      "```",
      "",
      "| Name | Value |",
      "| --- | ---: |",
      "| Alpha | 1 |",
      "| Beta | 22 |",
    ].join("\n"),
    caretNeedle: "answer",
    selectionFromNeedle: "const",
    selectionToNeedle: "Beta",
    expectedText: ["const answer", "console.log", "Name", "Value", "Alpha", "Beta"],
  },
  {
    id: "links-images",
    title: "Links And Images",
    markdown: `Open [docs](https://example.com) and inspect the image.\n\n![Tiny diagram](${inlineSvgImage})`,
    caretNeedle: "docs",
    selectionFromNeedle: "Open",
    selectionToNeedle: "image",
    expectedText: ["Open", "docs", "inspect", "image"],
  },
  {
    id: "emoji-cjk",
    title: "Emoji And CJK",
    markdown: "中文段落 with emoji 👨‍👩‍👧‍👦👩🏽‍💻🇯🇵 and combining marks café.\n\n第二行继续测试宽度。",
    caretNeedle: "👨‍👩‍👧‍👦",
    selectionFromNeedle: "中文",
    selectionToNeedle: "第二行",
    expectedText: ["中文段落", "emoji", "👨‍👩‍👧‍👦", "👩🏽‍💻", "🇯🇵", "第二行"],
  },
  {
    id: "bidi",
    title: "Bidi Text",
    markdown: "English עברית 123 **bold** عربي [קישור](https://example.com)\n\nNext visual line.",
    caretNeedle: "עברית",
    selectionFromNeedle: "English",
    selectionToNeedle: "عربي",
    expectedText: ["English", "עברית", "123", "bold", "عربي", "קישור"],
  },
];
