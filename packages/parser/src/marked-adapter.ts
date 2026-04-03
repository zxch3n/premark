import { marked, type Token, type Tokens, type TokensList } from "marked";

import type {
  CodeBlockNode,
  HtmlBlockNode,
  ListItemNode,
  MarkdownBlock,
  MarkdownInline,
  StreamParseSnapshot,
  TableCellNode,
} from "./types.ts";

const MARKED_OPTIONS = {
  gfm: true,
  breaks: false,
} as const;

function lexMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown, MARKED_OPTIONS);
}

function pushText(target: MarkdownInline[], text: string): void {
  const segments = text.split("\n");
  segments.forEach((segment, index) => {
    if (segment.length > 0) {
      target.push({
        type: "text",
        text: segment,
      });
    }

    if (index < segments.length - 1) {
      target.push({
        type: "softbreak",
      });
    }
  });
}

function convertInlineTokens(tokens: readonly Token[] | undefined): MarkdownInline[] {
  if (tokens === undefined || tokens.length === 0) {
    return [];
  }

  const output: MarkdownInline[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "text":
      case "escape":
        pushText(output, token.text);
        break;
      case "codespan":
        output.push({
          type: "code-span",
          text: token.text,
        });
        break;
      case "br":
        output.push({
          type: "hardbreak",
        });
        break;
      case "strong":
        output.push({
          type: "strong",
          children: convertInlineTokens(token.tokens),
        });
        break;
      case "em":
        output.push({
          type: "emphasis",
          children: convertInlineTokens(token.tokens),
        });
        break;
      case "del":
        output.push({
          type: "strikethrough",
          children: convertInlineTokens(token.tokens),
        });
        break;
      case "link":
        output.push({
          type: "link",
          href: token.href,
          title: token.title ?? undefined,
          children: convertInlineTokens(token.tokens),
        });
        break;
      case "image":
        output.push({
          type: "image",
          href: token.href,
          title: token.title ?? undefined,
          children:
            token.tokens !== undefined && token.tokens.length > 0
              ? convertInlineTokens(token.tokens)
              : token.text.length > 0
                ? [
                    {
                      type: "text",
                      text: token.text,
                    },
                  ]
                : [],
        });
        break;
      case "checkbox":
        pushText(output, token.checked ? "[x] " : "[ ] ");
        break;
      case "html":
        output.push({
          type: "html",
          content: token.text,
        });
        break;
      default:
        if ("text" in token && typeof token.text === "string" && token.text.length > 0) {
          pushText(output, token.text);
        }
        break;
    }
  }

  return output;
}

function convertParagraphFromText(token: Tokens.Text): MarkdownBlock[] {
  if (token.tokens !== undefined && token.tokens.length > 0) {
    return [
      {
        type: "paragraph",
        children: convertInlineTokens(token.tokens),
      },
    ];
  }

  if (token.text.trim().length === 0) {
    return [];
  }

  return [
    {
      type: "paragraph",
      children: convertInlineTokens([
        {
          ...token,
          tokens: undefined,
        },
      ]),
    },
  ];
}

function getUnorderedListMarker(raw: string): string {
  const match = raw.match(/^\s*([*+-])\s/u);
  return match?.[1] ?? "-";
}

function prependTaskMarker(children: MarkdownBlock[], checked: boolean): MarkdownBlock[] {
  const marker: MarkdownInline = {
    type: "text",
    text: checked ? "[x] " : "[ ] ",
  };

  if (children[0]?.type === "paragraph") {
    const [first, ...rest] = children;
    return [
      {
        ...first,
        children: [marker, ...first.children],
      },
      ...rest,
    ];
  }

  return [
    {
      type: "paragraph",
      children: [marker],
    },
    ...children,
  ];
}

function convertListItem(item: Tokens.ListItem): ListItemNode {
  const children: MarkdownBlock[] = [];

  for (const token of item.tokens) {
    if (token.type === "text") {
      children.push(...convertParagraphFromText(token as Tokens.Text));
      continue;
    }

    children.push(...convertBlockToken(token));
  }

  const normalizedChildren =
    item.task && item.checked !== undefined ? prependTaskMarker(children, item.checked) : children;

  return {
    type: "list-item",
    checked: item.task ? item.checked : undefined,
    children:
      normalizedChildren.length > 0
        ? normalizedChildren
        : [
            {
              type: "paragraph",
              children:
                item.text.length > 0
                  ? [
                      {
                        type: "text",
                        text: item.text,
                      },
                    ]
                  : [],
            },
          ],
  };
}

function convertTableCell(
  cell: Tokens.TableCell,
  align: "left" | "center" | "right" | null,
): TableCellNode {
  return {
    align,
    children: convertInlineTokens(cell.tokens),
  };
}

function convertHtmlBlock(token: Tokens.HTML): HtmlBlockNode {
  return {
    type: "html-block",
    content: token.raw.trimEnd(),
  };
}

function convertCodeBlock(token: Tokens.Code): CodeBlockNode {
  return {
    type: "code-block",
    content: token.text,
    info: token.lang ?? undefined,
  };
}

function convertBlockToken(token: Token): MarkdownBlock[] {
  switch (token.type) {
    case "space":
    case "def":
      return [];
    case "heading": {
      const heading = token as Tokens.Heading;
      return [
        {
          type: "heading",
          level: Math.min(6, Math.max(1, heading.depth)) as 1 | 2 | 3 | 4 | 5 | 6,
          children: convertInlineTokens(heading.tokens),
        },
      ];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return [
        {
          type: "paragraph",
          children: convertInlineTokens(paragraph.tokens),
        },
      ];
    }
    case "text":
      return convertParagraphFromText(token as Tokens.Text);
    case "code":
      return [convertCodeBlock(token as Tokens.Code)];
    case "blockquote": {
      const blockquote = token as Tokens.Blockquote;
      return [
        {
          type: "blockquote",
          children: convertBlockTokens(blockquote.tokens),
        },
      ];
    }
    case "list": {
      const list = token as Tokens.List;
      const ordered = list.ordered;
      const start = typeof list.start === "number" ? list.start : 1;
      return [
        {
          type: "list",
          kind: ordered ? "ordered" : "unordered",
          start,
          marker: ordered ? `${start}.` : getUnorderedListMarker(list.raw),
          items: list.items.map((item: Tokens.ListItem) => convertListItem(item)),
        },
      ];
    }
    case "table": {
      const table = token as Tokens.Table;
      return [
        {
          type: "table",
          head: {
            cells: table.header.map((cell: Tokens.TableCell, index: number) =>
              convertTableCell(cell, table.align[index] ?? cell.align ?? null),
            ),
          },
          body: {
            rows: table.rows.map((row: Tokens.TableCell[]) => ({
              cells: row.map((cell: Tokens.TableCell, index: number) =>
                convertTableCell(cell, table.align[index] ?? cell.align ?? null),
              ),
            })),
          },
        },
      ];
    }
    case "html": {
      const html = token as Tokens.HTML;
      return html.block ? [convertHtmlBlock(html)] : [];
    }
    case "hr":
      return [
        {
          type: "thematic-break",
        },
      ];
    default:
      return [];
  }
}

function convertBlockTokens(tokens: readonly Token[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const token of tokens) {
    blocks.push(...convertBlockToken(token));
  }
  return blocks;
}

function endsWithBlankLine(markdown: string): boolean {
  return /\n[ \t]*\n[ \t]*$/u.test(markdown);
}

function isClosedFencedCode(token: Tokens.Code): boolean {
  const openingFence = token.raw.match(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n/u);
  if (openingFence === null) {
    return false;
  }

  const fence = openingFence[1];
  const closingFence = token.raw.trimEnd().match(/(?:^|\n)[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/u);

  return (
    closingFence !== null &&
    closingFence[1][0] === fence[0] &&
    closingFence[1].length >= fence.length
  );
}

function isLastTokenClosed(token: Token): boolean {
  switch (token.type) {
    case "heading":
    case "hr":
      return true;
    case "code":
      return isClosedFencedCode(token as Tokens.Code);
    default:
      return false;
  }
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  return convertBlockTokens(lexMarkdown(markdown));
}

export function parseMarkdownStream(markdown: string): StreamParseSnapshot {
  const tokens = lexMarkdown(markdown);
  const allBlocks = convertBlockTokens(tokens);

  if (allBlocks.length === 0) {
    return {
      allBlocks,
      closedBlocks: [],
      partialBlocks: [],
      sourceLength: markdown.length,
    };
  }

  if (markdown.length === 0 || endsWithBlankLine(markdown)) {
    return {
      allBlocks,
      closedBlocks: allBlocks,
      partialBlocks: [],
      sourceLength: markdown.length,
    };
  }

  let lastSignificantIndex = tokens.length - 1;
  while (
    lastSignificantIndex >= 0 &&
    (tokens[lastSignificantIndex]?.type === "space" || tokens[lastSignificantIndex]?.type === "def")
  ) {
    lastSignificantIndex -= 1;
  }

  if (lastSignificantIndex < 0 || isLastTokenClosed(tokens[lastSignificantIndex])) {
    return {
      allBlocks,
      closedBlocks: allBlocks,
      partialBlocks: [],
      sourceLength: markdown.length,
    };
  }

  const closedBlocks = convertBlockTokens(tokens.slice(0, lastSignificantIndex));
  const partialBlocks = convertBlockTokens(tokens.slice(lastSignificantIndex));

  return {
    allBlocks,
    closedBlocks,
    partialBlocks,
    sourceLength: markdown.length,
  };
}
