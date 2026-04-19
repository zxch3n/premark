import type { SyntaxNode } from "@lezer/common";

import type { IncrementalParseState, MarkdownInline, MarkdownInlineSourceRecord } from "./types.ts";

type InlineRecordType = MarkdownInline["type"];

export function createMarkdownInlineSourceMap(
  state: Pick<IncrementalParseState, "tree" | "text" | "blockSpans">,
): MarkdownInlineSourceRecord[] {
  const records: MarkdownInlineSourceRecord[] = [];
  let blockIndex = 0;

  forEachChild(state.tree.topNode, (child) => {
    if (child.type.name === "LinkReference" || toBlockTypeName(child.type.name) === null) {
      return;
    }

    const span = state.blockSpans[blockIndex];
    if (span === undefined) {
      throw new Error(`Missing block span for block index ${blockIndex}`);
    }

    collectBlockInlineRecords(child, span.id, state.text, records);
    blockIndex += 1;
  });

  return records;
}

function collectBlockInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  const name = node.type.name;

  if (name.startsWith("ATXHeading")) {
    collectHeadingInlineRecords(node, blockId, markdown, records);
    return;
  }

  if (name === "SetextHeading1" || name === "SetextHeading2") {
    collectHeadingInlineRecords(node, blockId, markdown, records);
    return;
  }

  switch (name) {
    case "Paragraph":
      collectInlineRange(node, blockId, markdown, records);
      break;
    case "BulletList":
    case "OrderedList":
      collectListInlineRecords(node, blockId, markdown, records);
      break;
    case "Blockquote":
      collectContainerInlineRecords(node, blockId, markdown, records, new Set(["QuoteMark"]));
      break;
    case "Table":
      collectTableInlineRecords(node, blockId, markdown, records);
      break;
    default:
      break;
  }
}

function collectHeadingInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
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
  collectInlineRange(node, blockId, markdown, records, trimmedFrom, trimmedTo);
}

function collectListInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  forEachChild(node, (child) => {
    if (child.type.name !== "ListItem") {
      return;
    }

    collectListItemInlineRecords(child, blockId, markdown, records);
  });
}

function collectListItemInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  forEachChild(node, (child) => {
    switch (child.type.name) {
      case "ListMark":
        break;
      case "Task": {
        const marker = findFirstChildByName(child, "TaskMarker");
        if (marker !== null) {
          pushInlineRecord(
            records,
            blockId,
            "text",
            marker,
            markdown,
            markdown.slice(marker.from, marker.to),
          );
        }
        const contentFrom =
          marker === null ? child.from : skipWhitespace(markdown, marker.to, child.to);
        collectInlineRange(child, blockId, markdown, records, contentFrom, child.to);
        break;
      }
      default:
        collectBlockInlineRecords(child, blockId, markdown, records);
        break;
    }
  });
}

function collectContainerInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
  skipTypes: ReadonlySet<string>,
): void {
  forEachChild(node, (child) => {
    if (skipTypes.has(child.type.name)) {
      return;
    }
    collectBlockInlineRecords(child, blockId, markdown, records);
  });
}

function collectTableInlineRecords(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  forEachChild(node, (child) => {
    if (child.type.name !== "TableHeader" && child.type.name !== "TableRow") {
      return;
    }

    forEachChild(child, (cell) => {
      if (cell.type.name === "TableCell") {
        collectInlineRange(cell, blockId, markdown, records);
      }
    });
  });
}

function collectInlineRange(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
  from = node.from,
  to = node.to,
): void {
  let cursor = from;

  for (const child of getChildren(node)) {
    if (child.to <= from || child.from >= to) {
      continue;
    }

    if (child.from > cursor) {
      pushTextRecords(records, blockId, markdown, cursor, Math.min(child.from, to));
    }

    if (child.from < cursor) {
      cursor = Math.max(cursor, child.to);
      continue;
    }

    collectInlineNode(child, blockId, markdown, records);
    cursor = child.to;
  }

  if (cursor < to) {
    pushTextRecords(records, blockId, markdown, cursor, to);
  }
}

function collectInlineNode(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  switch (node.type.name) {
    case "StrongEmphasis":
      collectWrappedInline(node, blockId, markdown, records, "strong");
      break;
    case "Emphasis":
      collectWrappedInline(node, blockId, markdown, records, "emphasis");
      break;
    case "Strikethrough":
      collectWrappedInline(node, blockId, markdown, records, "strikethrough");
      break;
    case "InlineCode":
      pushInlineRecord(
        records,
        blockId,
        "code-span",
        node,
        markdown,
        stripCodeMarks(markdown.slice(node.from, node.to)),
      );
      break;
    case "Link":
      collectLinkInline(node, blockId, markdown, records, "link");
      break;
    case "Image":
      collectLinkInline(node, blockId, markdown, records, "image");
      break;
    case "Autolink":
      collectAutolinkInline(node, blockId, markdown, records);
      break;
    case "HTMLTag":
      pushInlineRecord(
        records,
        blockId,
        "html",
        node,
        markdown,
        markdown.slice(node.from, node.to),
      );
      break;
    case "HardBreak":
      pushInlineRecord(records, blockId, "hardbreak", node, markdown, " ");
      break;
    case "Escape":
      pushInlineRecord(
        records,
        blockId,
        "text",
        node,
        markdown,
        markdown.slice(node.from + 1, node.to),
      );
      break;
    default:
      break;
  }
}

function collectWrappedInline(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
  type: "strong" | "emphasis" | "strikethrough",
): void {
  pushInlineRecord(records, blockId, type, node, markdown, markdown.slice(node.from, node.to));

  const children = getChildren(node);
  const innerFrom = children[0]?.to ?? node.from;
  const innerTo = children.at(-1)?.from ?? node.to;
  collectInlineRange(node, blockId, markdown, records, innerFrom, innerTo);
}

function collectLinkInline(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
  type: "link" | "image",
): void {
  pushInlineRecord(records, blockId, type, node, markdown, markdown.slice(node.from, node.to));

  const children = getChildren(node);
  const openingMark = children.find((child) => child.type.name === "LinkMark");
  const closingBracket = children.find(
    (child, index) =>
      child.type.name === "LinkMark" && index > 0 && markdown.slice(child.from, child.to) === "]",
  );
  const labelFrom = openingMark?.to ?? node.from;
  const labelTo = closingBracket?.from ?? node.to;
  collectInlineRange(node, blockId, markdown, records, labelFrom, labelTo);
}

function collectAutolinkInline(
  node: SyntaxNode,
  blockId: string,
  markdown: string,
  records: MarkdownInlineSourceRecord[],
): void {
  const urlNode = findFirstChildByName(node, "URL");
  pushInlineRecord(
    records,
    blockId,
    "link",
    node,
    markdown,
    urlNode === null
      ? markdown.slice(node.from + 1, node.to - 1)
      : markdown.slice(urlNode.from, urlNode.to),
  );
}

function pushTextRecords(
  records: MarkdownInlineSourceRecord[],
  blockId: string,
  markdown: string,
  from: number,
  to: number,
): void {
  let segmentFrom = from;
  for (let index = from; index < to; index += 1) {
    if (markdown.charCodeAt(index) !== 10) {
      continue;
    }

    if (segmentFrom < index) {
      pushInlineRangeRecord(
        records,
        blockId,
        "text",
        markdown,
        segmentFrom,
        index,
        markdown.slice(segmentFrom, index),
      );
    }
    pushInlineRangeRecord(records, blockId, "softbreak", markdown, index, index + 1, " ");
    segmentFrom = index + 1;
  }

  if (segmentFrom < to) {
    pushInlineRangeRecord(
      records,
      blockId,
      "text",
      markdown,
      segmentFrom,
      to,
      markdown.slice(segmentFrom, to),
    );
  }
}

function pushInlineRecord(
  records: MarkdownInlineSourceRecord[],
  blockId: string,
  type: InlineRecordType,
  node: SyntaxNode,
  markdown: string,
  renderedText: string,
): void {
  pushInlineRangeRecord(records, blockId, type, markdown, node.from, node.to, renderedText);
}

function pushInlineRangeRecord(
  records: MarkdownInlineSourceRecord[],
  blockId: string,
  type: InlineRecordType,
  markdown: string,
  from: number,
  to: number,
  renderedText: string,
): void {
  records.push({
    blockId,
    type,
    source: {
      from,
      to,
    },
    sourceText: markdown.slice(from, to),
    renderedText,
  });
}

function toBlockTypeName(typeName: string): string | null {
  if (typeName.startsWith("ATXHeading") || typeName.startsWith("SetextHeading")) {
    return "heading";
  }

  switch (typeName) {
    case "Paragraph":
    case "FencedCode":
    case "CodeBlock":
    case "BulletList":
    case "OrderedList":
    case "Blockquote":
    case "Table":
    case "HTMLBlock":
    case "HorizontalRule":
      return typeName;
    default:
      return null;
  }
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

function stripCodeMarks(value: string): string {
  return value.replace(/^`+/u, "").replace(/`+$/u, "");
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
