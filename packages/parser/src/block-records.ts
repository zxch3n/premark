import type {
  HeadingPathEntry,
  IncrementalParseState,
  LinkRef,
  MarkdownBlock,
  MarkdownBlockRecord,
  MarkdownInline,
} from "./types.ts";

export function createMarkdownBlockRecords(
  state: Pick<IncrementalParseState, "blocks" | "blockSpans">,
): MarkdownBlockRecord[] {
  const headingPath: HeadingPathEntry[] = [];

  return state.blocks.map((block, index) => {
    const span = state.blockSpans[index];
    if (span === undefined) {
      throw new Error(`Missing block span for block index ${index}`);
    }

    if (block.type === "heading") {
      const heading: HeadingPathEntry = {
        id: span.id,
        level: block.level,
        text: inlineText(block.children),
      };
      while (headingPath.at(-1) !== undefined && headingPath.at(-1)!.level >= heading.level) {
        headingPath.pop();
      }
      headingPath.push(heading);
    }

    return {
      id: span.id,
      index,
      type: block.type,
      source: {
        from: span.from,
        to: span.to,
      },
      renderedText: blockText(block),
      headingPath: [...headingPath],
      links: collectBlockLinks(block),
    };
  });
}

export function blockText(block: MarkdownBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return inlineText(block.children);
    case "code-block":
      return block.content;
    case "list":
      return block.items.map((item) => item.children.map(blockText).join(" ")).join(" ");
    case "blockquote":
      return block.children.map(blockText).join(" ");
    case "table":
      return [
        ...block.head.cells.map((cell) => inlineText(cell.children)),
        ...block.body.rows.flatMap((row) => row.cells.map((cell) => inlineText(cell.children))),
      ].join(" ");
    case "html-block":
      return block.content;
    case "thematic-break":
      return "";
  }
}

function inlineText(nodes: readonly MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code-span":
          return node.text;
        case "softbreak":
        case "hardbreak":
          return " ";
        case "strong":
        case "emphasis":
        case "strikethrough":
        case "link":
        case "image":
          return inlineText(node.children);
        case "html":
          return node.content;
      }
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
}

function collectBlockLinks(block: MarkdownBlock): LinkRef[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return collectInlineLinks(block.children);
    case "list":
      return block.items.flatMap((item) => item.children.flatMap(collectBlockLinks));
    case "blockquote":
      return block.children.flatMap(collectBlockLinks);
    case "table":
      return [
        ...block.head.cells.flatMap((cell) => collectInlineLinks(cell.children)),
        ...block.body.rows.flatMap((row) =>
          row.cells.flatMap((cell) => collectInlineLinks(cell.children)),
        ),
      ];
    default:
      return [];
  }
}

function collectInlineLinks(nodes: readonly MarkdownInline[]): LinkRef[] {
  return nodes.flatMap((node): LinkRef[] => {
    switch (node.type) {
      case "link":
      case "image":
        return [
          {
            href: node.href,
            title: node.title,
            text: inlineText(node.children),
            kind: node.type === "image" ? "image" : "link",
          },
          ...collectInlineLinks(node.children),
        ];
      case "strong":
      case "emphasis":
      case "strikethrough":
        return collectInlineLinks(node.children);
      default:
        return [];
    }
  });
}
