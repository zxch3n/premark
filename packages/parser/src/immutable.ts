import type {
  BlockSpan,
  ListItemNode,
  MarkdownBlock,
  MarkdownInline,
  TableCellNode,
  TableRowNode,
} from "./types.ts";

export function freezeBlockSpans(blockSpans: BlockSpan[]): readonly BlockSpan[] {
  for (const blockSpan of blockSpans) {
    if (!Object.isFrozen(blockSpan)) {
      Object.freeze(blockSpan);
    }
  }

  return Object.freeze(blockSpans);
}

export function freezeMarkdownBlocks(blocks: MarkdownBlock[]): readonly MarkdownBlock[] {
  for (const block of blocks) {
    freezeMarkdownBlock(block);
  }

  return Object.freeze(blocks) as readonly MarkdownBlock[];
}

export function freezeMarkdownBlockArray(
  blocks: readonly MarkdownBlock[],
): readonly MarkdownBlock[] {
  return Object.freeze([...blocks]) as readonly MarkdownBlock[];
}

function freezeMarkdownBlock(block: MarkdownBlock): MarkdownBlock {
  if (Object.isFrozen(block)) {
    return block;
  }

  switch (block.type) {
    case "heading":
    case "paragraph":
      freezeMarkdownInlines(block.children);
      break;
    case "list":
      freezeMarkdownListItems(block.items);
      break;
    case "blockquote":
      freezeReadonlyMarkdownBlocks(block.children);
      break;
    case "table":
      freezeTableCells(block.head.cells);
      freezeTableRows(block.body.rows);
      if (!Object.isFrozen(block.head)) {
        Object.freeze(block.head);
      }
      if (!Object.isFrozen(block.body)) {
        Object.freeze(block.body);
      }
      break;
    case "code-block":
    case "html-block":
    case "thematic-break":
      break;
  }

  return Object.freeze(block);
}

function freezeMarkdownListItems(items: readonly ListItemNode[]): void {
  for (const item of items) {
    if (!Object.isFrozen(item)) {
      freezeReadonlyMarkdownBlocks(item.children);
      Object.freeze(item);
    }
  }

  if (!Object.isFrozen(items)) {
    Object.freeze(items);
  }
}

function freezeTableRows(rows: readonly TableRowNode[]): void {
  for (const row of rows) {
    if (!Object.isFrozen(row)) {
      freezeTableCells(row.cells);
      Object.freeze(row);
    }
  }

  if (!Object.isFrozen(rows)) {
    Object.freeze(rows);
  }
}

function freezeTableCells(cells: readonly TableCellNode[]): void {
  for (const cell of cells) {
    if (!Object.isFrozen(cell)) {
      freezeMarkdownInlines(cell.children);
      Object.freeze(cell);
    }
  }

  if (!Object.isFrozen(cells)) {
    Object.freeze(cells);
  }
}

function freezeMarkdownInlines(nodes: readonly MarkdownInline[]): void {
  for (const node of nodes) {
    if (Object.isFrozen(node)) {
      continue;
    }

    switch (node.type) {
      case "strong":
      case "emphasis":
      case "strikethrough":
      case "link":
      case "image":
        freezeMarkdownInlines(node.children);
        break;
      default:
        break;
    }

    Object.freeze(node);
  }

  if (!Object.isFrozen(nodes)) {
    Object.freeze(nodes);
  }
}

function freezeReadonlyMarkdownBlocks(blocks: readonly MarkdownBlock[]): void {
  for (const block of blocks) {
    freezeMarkdownBlock(block);
  }

  if (!Object.isFrozen(blocks)) {
    Object.freeze(blocks);
  }
}
