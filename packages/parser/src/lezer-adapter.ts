import { type SyntaxNode, type Tree } from "@lezer/common";
import { GFM, parser as baseParser } from "@lezer/markdown";

import { decodeMarkdownEntity } from "./entities.ts";
import { freezeBlockSpans, freezeMarkdownBlocks } from "./immutable.ts";
import { findPlainUrlMatchAt, findPlainUrlMatches } from "./plain-url.ts";
import type {
  BlockSpan,
  CodeBlockNode,
  ListItemNode,
  MarkdownBlock,
  MarkdownInline,
  TableCellNode,
} from "./types.ts";

interface ReferenceDefinition {
  href: string;
  title?: string;
}

interface TopLevelBlockEntry {
  node: SyntaxNode;
  span: BlockSpan;
}

interface InlineConversionOptions {
  readonly plainUrls: boolean;
}

interface ConvertedInlineNode {
  readonly nodes: readonly MarkdownInline[];
  readonly to: number;
}

export interface ParsedMarkdownDocument {
  tree: Tree;
  blocks: readonly MarkdownBlock[];
  blockSpans: readonly BlockSpan[];
}

const markdownParser = baseParser.configure(GFM);
const defaultInlineConversionOptions: InlineConversionOptions = {
  plainUrls: true,
};
const linkLabelInlineConversionOptions: InlineConversionOptions = {
  plainUrls: false,
};

export function parseMarkdown(markdown: string): readonly MarkdownBlock[] {
  return parseMarkdownDocument(markdown).blocks;
}

export function parseMarkdownDocument(markdown: string): ParsedMarkdownDocument {
  const tree = markdownParser.parse(markdown);
  const { entries, definitions } = extractTopLevelBlockEntries(tree, markdown);
  return {
    tree,
    blocks: materializeBlocks(entries, markdown, definitions),
    blockSpans: freezeBlockSpans(entries.map((entry) => entry.span)),
  };
}

export function getMarkdownParser() {
  return markdownParser;
}

export function extractTopLevelBlockEntries(
  tree: Tree,
  markdown: string,
  startBlockIndex = 0,
): {
  entries: TopLevelBlockEntry[];
  definitions: Map<string, ReferenceDefinition>;
} {
  const topNode = tree.topNode;
  const definitions = collectReferenceDefinitions(topNode, markdown);
  const entries: TopLevelBlockEntry[] = [];
  let blockIndex = 0;

  forEachChild(topNode, (child) => {
    if (child.type.name === "LinkReference") {
      return;
    }

    const blockType = toBlockTypeName(child.type.name);
    if (blockType === null) {
      return;
    }

    if (blockIndex < startBlockIndex) {
      blockIndex += 1;
      return;
    }

    entries.push({
      node: child,
      span: {
        from: child.from,
        to: child.to,
        id: createBlockId(blockType, markdown, child.from, child.to),
        type: blockType,
        signature: hashTextRangeWithPrefix(markdown, child.from, child.to, blockType),
      },
    });
    blockIndex += 1;
  });

  return {
    entries,
    definitions,
  };
}

export function materializeBlocks(
  entries: readonly TopLevelBlockEntry[],
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): readonly MarkdownBlock[] {
  return freezeMarkdownBlocks(
    entries.map((entry) => convertBlockNode(entry.node, markdown, definitions)),
  );
}

function convertBlockNode(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): MarkdownBlock {
  const name = node.type.name;

  if (name.startsWith("ATXHeading")) {
    return convertHeading(node, markdown, definitions, Number.parseInt(name.slice(-1), 10) as 1);
  }

  if (name === "SetextHeading1") {
    return convertHeading(node, markdown, definitions, 1);
  }

  if (name === "SetextHeading2") {
    return convertHeading(node, markdown, definitions, 2);
  }

  switch (name) {
    case "Paragraph":
      return {
        type: "paragraph",
        children: convertInlineRange(node, markdown, definitions),
      };
    case "FencedCode":
    case "CodeBlock":
      return convertCodeBlock(node, markdown);
    case "BulletList":
    case "OrderedList":
      return convertList(node, markdown, definitions);
    case "Blockquote":
      return {
        type: "blockquote",
        children: convertContainerChildren(node, markdown, definitions, new Set(["QuoteMark"])),
      };
    case "Table":
      return convertTable(node, markdown, definitions);
    case "HTMLBlock":
      return {
        type: "html-block",
        content: markdown.slice(node.from, node.to).trimEnd(),
      };
    case "HorizontalRule":
      return {
        type: "thematic-break",
      };
    default:
      throw new Error(`Unsupported markdown block node: ${name}`);
  }
}

function convertHeading(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  level: 1 | 2 | 3 | 4 | 5 | 6,
): MarkdownBlock {
  let contentFrom = node.from;
  let contentTo = node.to;
  const children = getChildren(node);
  const firstChild = children[0];
  const lastChild = children.at(-1);

  if (firstChild?.type.name === "HeaderMark" && firstChild.from === node.from) {
    contentFrom = firstChild.to;
  }

  if (
    lastChild?.type.name === "HeaderMark" &&
    lastChild.to === node.to &&
    lastChild !== firstChild
  ) {
    contentTo = lastChild.from;
  } else if (
    lastChild?.type.name === "HeaderMark" &&
    lastChild.to === node.to &&
    /^[=-]+$/u.test(markdown.slice(lastChild.from, lastChild.to))
  ) {
    contentTo = lastChild.from;
  }

  const [trimmedFrom, trimmedTo] = trimWhitespaceRange(markdown, contentFrom, contentTo);

  return {
    type: "heading",
    level,
    children: convertInlineRange(node, markdown, definitions, trimmedFrom, trimmedTo),
  };
}

function convertCodeBlock(node: SyntaxNode, markdown: string): CodeBlockNode {
  let info: string | undefined;
  let content = "";

  forEachChild(node, (child) => {
    if (child.type.name === "CodeInfo") {
      info = markdown.slice(child.from, child.to).trim() || undefined;
      return;
    }

    if (child.type.name === "CodeText") {
      content += markdown.slice(child.from, child.to);
    }
  });

  return {
    type: "code-block",
    content,
    info,
  };
}

function convertList(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): MarkdownBlock {
  const children = getChildren(node);
  const items = children
    .filter((child) => child.type.name === "ListItem")
    .map((child) => convertListItem(child, markdown, definitions));
  const firstMark = findFirstChildByName(children[0], "ListMark");
  const markText =
    firstMark === null ? "-" : markdown.slice(firstMark.from, firstMark.to).replace(/\d+/gu, "");

  return {
    type: "list",
    kind: node.type.name === "OrderedList" ? "ordered" : "unordered",
    start: node.type.name === "OrderedList" ? parseOrderedStart(markdown, firstMark) : 1,
    marker: markText,
    items,
  };
}

function convertListItem(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): ListItemNode {
  const children = getChildren(node);
  const blocks: MarkdownBlock[] = [];
  let checked: boolean | undefined;

  for (const child of children) {
    switch (child.type.name) {
      case "ListMark":
        break;
      case "Task": {
        const marker = findFirstChildByName(child, "TaskMarker");
        checked = marker !== null && /x/iu.test(markdown.slice(marker.from, marker.to));
        const contentFrom =
          marker === null ? child.from : skipWhitespace(markdown, marker.to, child.to);
        const paragraphChildren: MarkdownInline[] = [
          {
            type: "text",
            text: checked ? "[x] " : "[ ] ",
          },
          ...convertInlineRange(child, markdown, definitions, contentFrom, child.to),
        ];
        blocks.push({
          type: "paragraph",
          children: paragraphChildren,
        });
        break;
      }
      default:
        blocks.push(convertBlockNode(child, markdown, definitions));
        break;
    }
  }

  return {
    type: "list-item",
    checked,
    children: blocks,
  };
}

function convertTable(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): MarkdownBlock {
  const headerNode = findFirstChildByName(node, "TableHeader");
  const delimiterNode = findFirstChildByName(node, "TableDelimiter");
  const rowNodes = getChildren(node).filter((child) => child.type.name === "TableRow");
  const alignments =
    delimiterNode === null
      ? []
      : parseTableAlignments(markdown.slice(delimiterNode.from, delimiterNode.to));

  return {
    type: "table",
    head: {
      cells:
        headerNode === null ? [] : convertTableCells(headerNode, markdown, definitions, alignments),
    },
    body: {
      rows: rowNodes.map((rowNode) => ({
        cells: convertTableCells(rowNode, markdown, definitions, alignments),
      })),
    },
  };
}

function convertTableCells(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  alignments: Array<"left" | "center" | "right" | null>,
): TableCellNode[] {
  let index = 0;
  const cells: TableCellNode[] = [];

  forEachChild(node, (child) => {
    if (child.type.name !== "TableCell") {
      return;
    }

    cells.push({
      align: alignments[index] ?? null,
      children: convertInlineRange(child, markdown, definitions),
    });
    index += 1;
  });

  return cells;
}

function convertContainerChildren(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  skipTypes: ReadonlySet<string>,
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  forEachChild(node, (child) => {
    if (skipTypes.has(child.type.name)) {
      return;
    }
    blocks.push(convertBlockNode(child, markdown, definitions));
  });

  return blocks;
}

function convertInlineRange(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  from = node.from,
  to = node.to,
  options: InlineConversionOptions = defaultInlineConversionOptions,
): MarkdownInline[] {
  const output: MarkdownInline[] = [];
  let cursor = from;

  for (const child of getChildren(node)) {
    if (child.to <= from || child.from >= to) {
      continue;
    }

    if (child.from > cursor) {
      const textTo = Math.min(child.from, to);
      pushText(output, markdown.slice(cursor, textTo), options, markdown[textTo] === "\\");
    }

    if (child.from < cursor) {
      cursor = Math.max(cursor, child.to);
      continue;
    }

    const converted = convertInlineNode(child, markdown, definitions, options);
    output.push(...converted.nodes);
    cursor = Math.min(Math.max(converted.to, child.to), to);
  }

  if (cursor < to) {
    pushText(output, markdown.slice(cursor, to), options);
  }

  return output;
}

function convertInlineNode(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  options: InlineConversionOptions,
): ConvertedInlineNode {
  switch (node.type.name) {
    case "StrongEmphasis":
      return convertedInlineNode(node, [
        convertWrappedInline(node, markdown, definitions, "strong", options),
      ]);
    case "Emphasis":
      return convertedInlineNode(node, [
        convertWrappedInline(node, markdown, definitions, "emphasis", options),
      ]);
    case "Strikethrough":
      return convertedInlineNode(node, [
        convertWrappedInline(node, markdown, definitions, "strikethrough", options),
      ]);
    case "InlineCode":
      return convertedInlineNode(node, [
        {
          type: "code-span",
          text: stripCodeMarks(markdown.slice(node.from, node.to)),
        },
      ]);
    case "Link":
      return convertedInlineNode(node, [convertLink(node, markdown, definitions)]);
    case "Image":
      return convertedInlineNode(node, [convertImage(node, markdown, definitions)]);
    case "Autolink":
      return convertedInlineNode(node, [convertAutolink(node, markdown)]);
    case "URL":
      return convertBareUrl(node, markdown, options);
    case "Entity":
      return convertedInlineNode(node, [
        {
          type: "text",
          text: decodeMarkdownEntity(markdown.slice(node.from, node.to)),
        },
      ]);
    case "HTMLTag":
    case "Comment":
      return convertedInlineNode(node, [
        {
          type: "html",
          content: markdown.slice(node.from, node.to),
        },
      ]);
    case "HardBreak":
      return convertedInlineNode(node, [{ type: "hardbreak" }]);
    case "Escape":
      return convertedInlineNode(node, [
        {
          type: "text",
          text: markdown.slice(node.from + 1, node.to),
        },
      ]);
    default:
      return convertedInlineNode(node, [
        {
          type: "text",
          text: markdown.slice(node.from, node.to),
        },
      ]);
  }
}

function convertedInlineNode(
  node: SyntaxNode,
  nodes: readonly MarkdownInline[],
): ConvertedInlineNode {
  return {
    nodes,
    to: node.to,
  };
}

function convertBareUrl(
  node: SyntaxNode,
  markdown: string,
  options: InlineConversionOptions,
): ConvertedInlineNode {
  const plainUrl = findPlainUrlMatchAt(markdown, node.from);
  const href = plainUrl?.text ?? markdown.slice(node.from, node.to);
  if (plainUrl === null || !options.plainUrls || !isConvertibleBareUrlNode(node, markdown)) {
    return convertedInlineNode(node, [
      {
        type: "text",
        text: href,
      },
    ]);
  }

  return {
    nodes: [
      {
        type: "link",
        href,
        children: [
          {
            type: "text",
            text: href,
          },
        ],
      },
    ],
    to: plainUrl.to,
  };
}

function convertWrappedInline(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
  type: "strong" | "emphasis" | "strikethrough",
  options: InlineConversionOptions,
): MarkdownInline {
  const children = getChildren(node);
  const innerFrom = children[0]?.to ?? node.from;
  const innerTo = children.at(-1)?.from ?? node.to;

  return {
    type,
    children: convertInlineRange(node, markdown, definitions, innerFrom, innerTo, options),
  };
}

function convertLink(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): MarkdownInline {
  const descriptor = readLinkDescriptor(node, markdown, definitions);
  return {
    type: "link",
    href: descriptor.href,
    title: descriptor.title,
    children: descriptor.children,
  };
}

function convertImage(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): MarkdownInline {
  const descriptor = readLinkDescriptor(node, markdown, definitions);
  return {
    type: "image",
    href: descriptor.href,
    title: descriptor.title,
    children: descriptor.children,
  };
}

function convertAutolink(node: SyntaxNode, markdown: string): MarkdownInline {
  const urlNode = findFirstChildByName(node, "URL");
  const href =
    urlNode === null
      ? markdown.slice(node.from + 1, node.to - 1)
      : markdown.slice(urlNode.from, urlNode.to);

  return {
    type: "link",
    href,
    children: [
      {
        type: "text",
        text: href,
      },
    ],
  };
}

function readLinkDescriptor(
  node: SyntaxNode,
  markdown: string,
  definitions: Map<string, ReferenceDefinition>,
): {
  href: string;
  title?: string;
  children: MarkdownInline[];
} {
  const children = getChildren(node);
  const openingMark = children.find((child) => child.type.name === "LinkMark");
  const closingBracket = children.find(
    (child, index) =>
      child.type.name === "LinkMark" && index > 0 && markdown.slice(child.from, child.to) === "]",
  );
  const labelFrom = openingMark?.to ?? node.from;
  const labelTo = closingBracket?.from ?? node.to;
  const inlineChildren = convertInlineRange(
    node,
    markdown,
    definitions,
    labelFrom,
    labelTo,
    linkLabelInlineConversionOptions,
  );
  const urlNode =
    children.find((child) => child.type.name === "URL" && child.from >= labelTo) ?? null;
  const titleNode = children.find((child) => child.type.name === "LinkTitle") ?? null;
  const referenceNode = children.find((child) => child.type.name === "LinkLabel") ?? null;
  const resolvedReference =
    referenceNode === null
      ? undefined
      : definitions.get(
          normalizeReferenceLabel(markdown.slice(referenceNode.from, referenceNode.to)),
        );

  return {
    href:
      urlNode === null ? (resolvedReference?.href ?? "") : markdown.slice(urlNode.from, urlNode.to),
    title:
      titleNode === null
        ? resolvedReference?.title
        : stripOuterQuotes(markdown.slice(titleNode.from, titleNode.to)),
    children: inlineChildren,
  };
}

function collectReferenceDefinitions(
  topNode: SyntaxNode,
  markdown: string,
): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>();

  forEachChild(topNode, (child) => {
    if (child.type.name !== "LinkReference") {
      return;
    }

    const labelNode = findFirstChildByName(child, "LinkLabel");
    const urlNode = findFirstChildByName(child, "URL");
    const titleNode = findFirstChildByName(child, "LinkTitle");

    if (labelNode === null || urlNode === null) {
      return;
    }

    definitions.set(normalizeReferenceLabel(markdown.slice(labelNode.from, labelNode.to)), {
      href: markdown.slice(urlNode.from, urlNode.to),
      title:
        titleNode === null
          ? undefined
          : stripOuterQuotes(markdown.slice(titleNode.from, titleNode.to)),
    });
  });

  return definitions;
}

function normalizeReferenceLabel(label: string): string {
  return label.replace(/^\[/u, "").replace(/\]$/u, "").trim().replace(/\s+/gu, " ").toLowerCase();
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"(]/u, "").replace(/['")]$/u, "");
}

function stripCodeMarks(value: string): string {
  return value.replace(/^`+/u, "").replace(/`+$/u, "");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isConvertibleBareUrlNode(node: SyntaxNode, markdown: string): boolean {
  return (
    isHttpUrl(markdown.slice(node.from, node.to)) &&
    markdown[node.from - 1] !== "\\" &&
    markdown[node.to] !== "\\"
  );
}

function parseOrderedStart(markdown: string, mark: SyntaxNode | null): number {
  if (mark === null) {
    return 1;
  }

  const digits = markdown.slice(mark.from, mark.to).match(/\d+/u);
  return digits === null ? 1 : Number.parseInt(digits[0], 10);
}

function parseTableAlignments(line: string): Array<"left" | "center" | "right" | null> {
  const cells = line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|");

  return cells.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
      return "center";
    }
    if (trimmed.startsWith(":")) {
      return "left";
    }
    if (trimmed.endsWith(":")) {
      return "right";
    }
    return null;
  });
}

function trimWhitespaceRange(markdown: string, from: number, to: number): [number, number] {
  let start = from;
  let end = to;

  while (start < end && /\s/u.test(markdown[start] ?? "")) {
    start += 1;
  }

  while (end > start && /\s/u.test(markdown[end - 1] ?? "")) {
    end -= 1;
  }

  return [start, end];
}

function skipWhitespace(markdown: string, from: number, to: number): number {
  let cursor = from;
  while (cursor < to && /\s/u.test(markdown[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function pushText(
  target: MarkdownInline[],
  text: string,
  options: InlineConversionOptions = defaultInlineConversionOptions,
  endsBeforeEscape = false,
): void {
  if (!options.plainUrls) {
    pushPlainText(target, text);
    return;
  }

  let cursor = 0;
  for (const match of findPlainUrlMatches(text)) {
    if (endsBeforeEscape && match.to === text.length) {
      continue;
    }
    pushPlainText(target, text.slice(cursor, match.from));
    target.push({
      type: "link",
      href: match.text,
      children: [
        {
          type: "text",
          text: match.text,
        },
      ],
    });
    cursor = match.to;
  }
  pushPlainText(target, text.slice(cursor));
}

function pushPlainText(target: MarkdownInline[], text: string): void {
  if (text.length === 0) {
    return;
  }

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

function toBlockTypeName(typeName: string): string | null {
  if (typeName.startsWith("ATXHeading") || typeName.startsWith("SetextHeading")) {
    return "heading";
  }

  switch (typeName) {
    case "Paragraph":
      return "paragraph";
    case "FencedCode":
    case "CodeBlock":
      return "code-block";
    case "BulletList":
    case "OrderedList":
      return "list";
    case "Blockquote":
      return "blockquote";
    case "Table":
      return "table";
    case "HTMLBlock":
      return "html-block";
    case "HorizontalRule":
      return "thematic-break";
    default:
      return null;
  }
}

function findFirstChildByName(node: SyntaxNode | undefined, name: string): SyntaxNode | null {
  if (node === undefined) {
    return null;
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.type.name === name) {
      return child;
    }
  }

  return null;
}

function getChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function forEachChild(node: SyntaxNode, visit: (child: SyntaxNode) => void): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    visit(child);
  }
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashTextRangeWithPrefix(text: string, from: number, to: number, prefix: string): number {
  let hash = hashText(prefix);
  hash ^= 58;
  hash = Math.imul(hash, 16777619);

  for (let index = from; index < to; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createBlockId(text: string, markdown: string, from: number, to: number): string {
  return `b:${text}:${hashTextRangeWithPrefix(markdown, from, to, text).toString(36)}`;
}
