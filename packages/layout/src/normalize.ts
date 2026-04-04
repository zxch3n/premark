import type { MarkdownBlock, MarkdownInline } from "@pretext-md/parser";

import type { BlockContext, BlockMeta, BlockType, SpacingConfig } from "./types.ts";

export interface NormalizedBlock {
  sourceBlockIndex: number;
  contentKey: string;
  contentHash: number;
  type: BlockType;
  meta: BlockMeta;
  context: BlockContext;
  indent: number;
  marginTop: number;
  marginBottom: number;
  inline?: readonly MarkdownInline[];
  code?: string;
  lang?: string;
  html?: string;
  image?: {
    src: string;
    alt: string;
  };
  table?: Extract<MarkdownBlock, { type: "table" }>;
}

export interface SourceBlockRange {
  from: number;
  to: number;
}

export interface NormalizedDocument {
  blocks: NormalizedBlock[];
  sourceBlockRanges: SourceBlockRange[];
}

interface WalkState {
  indent: number;
  quoteDepth: number;
  listDepth: number;
  ordered?: boolean;
  listMarker?: string;
}

interface HashState {
  primary: number;
  secondary: number;
}

function createHashState(): HashState {
  return {
    primary: 2166136261,
    secondary: 33554393,
  };
}

function mixCode(state: HashState, code: number): void {
  state.primary ^= code;
  state.primary = Math.imul(state.primary, 16777619);
  state.secondary ^= code;
  state.secondary = Math.imul(state.secondary, 1597334677);
}

function mixToken(state: HashState, token: string): void {
  for (let index = 0; index < token.length; index += 1) {
    mixCode(state, token.charCodeAt(index));
  }
  mixCode(state, 0xff);
}

function mixNumber(state: HashState, value: number): void {
  mixToken(state, String(value));
}

function mixBoolean(state: HashState, value: boolean | undefined): void {
  mixCode(state, value === undefined ? 2 : value ? 1 : 0);
}

function finishContentIdentity(state: HashState): { contentKey: string; contentHash: number } {
  return {
    contentKey: `${state.primary >>> 0}:${state.secondary >>> 0}`,
    contentHash: state.primary >>> 0,
  };
}

function hashInlineNodes(state: HashState, nodes: readonly MarkdownInline[]): void {
  mixCode(state, 0x5b);
  for (const node of nodes) {
    hashInlineNode(state, node);
  }
  mixCode(state, 0x5d);
}

function hashInlineNode(state: HashState, node: MarkdownInline): void {
  mixToken(state, node.type);
  switch (node.type) {
    case "text":
      mixToken(state, node.text);
      break;
    case "softbreak":
    case "hardbreak":
      break;
    case "strong":
    case "emphasis":
    case "strikethrough":
      hashInlineNodes(state, node.children);
      break;
    case "code-span":
      mixToken(state, node.text);
      break;
    case "link":
    case "image":
      mixToken(state, node.href);
      mixToken(state, node.title ?? "");
      hashInlineNodes(state, node.children);
      break;
    case "html":
      mixToken(state, node.content);
      break;
  }
}

function hashTableCellChildren(state: HashState, nodes: readonly MarkdownInline[]): void {
  hashInlineNodes(state, nodes);
}

function hashNormalizedBlockContent(block: Omit<NormalizedBlock, "contentKey" | "contentHash">): {
  contentKey: string;
  contentHash: number;
} {
  const state = createHashState();
  mixToken(state, block.type);
  mixNumber(state, block.indent);
  mixNumber(state, block.marginTop);
  mixNumber(state, block.marginBottom);
  mixNumber(state, block.context.quoteDepth);
  mixNumber(state, block.context.listDepth);
  mixToken(state, block.context.listMarker ?? "");
  mixBoolean(state, block.context.ordered);
  mixToken(state, block.meta.type);

  switch (block.meta.type) {
    case "heading":
      mixNumber(state, block.meta.level);
      break;
    case "code_block":
      mixToken(state, block.meta.lang);
      mixBoolean(state, block.meta.highlighted);
      break;
    case "list":
      mixBoolean(state, block.meta.ordered);
      mixNumber(state, block.meta.start ?? 0);
      break;
    case "list_item":
      mixNumber(state, block.meta.depth);
      mixToken(state, block.meta.marker);
      break;
    case "blockquote":
      mixNumber(state, block.meta.depth);
      break;
    case "table":
      mixNumber(state, block.meta.columnCount);
      for (const alignment of block.meta.alignments) {
        mixToken(state, alignment ?? "");
      }
      break;
    case "image":
      mixToken(state, block.meta.src);
      mixToken(state, block.meta.alt);
      break;
    case "paragraph":
    case "thematic_break":
    case "html_block":
      break;
  }

  if (block.inline !== undefined) {
    hashInlineNodes(state, block.inline);
  }
  if (block.code !== undefined) {
    mixToken(state, block.code);
  }
  if (block.lang !== undefined) {
    mixToken(state, block.lang);
  }
  if (block.html !== undefined) {
    mixToken(state, block.html);
  }
  if (block.image !== undefined) {
    mixToken(state, block.image.src);
    mixToken(state, block.image.alt);
  }
  if (block.table !== undefined) {
    for (const cell of block.table.head.cells) {
      mixToken(state, cell.align ?? "");
      hashTableCellChildren(state, cell.children);
    }
    for (const row of block.table.body.rows) {
      for (const cell of row.cells) {
        mixToken(state, cell.align ?? "");
        hashTableCellChildren(state, cell.children);
      }
    }
  }

  return finishContentIdentity(state);
}

function extractInlineText(nodes: readonly MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
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
          return extractInlineText(node.children);
        case "html":
          return node.content;
        default:
          return "";
      }
    })
    .join("");
}

function createContext(state: WalkState): BlockContext {
  return {
    quoteDepth: state.quoteDepth,
    listDepth: state.listDepth,
    listMarker: state.listMarker,
    ordered: state.ordered,
  };
}

function createMargins(type: BlockType, spacing: SpacingConfig) {
  switch (type) {
    case "heading":
      return {
        marginTop: spacing.headingMarginTop,
        marginBottom: spacing.headingMarginBottom,
      };
    case "code_block":
    case "table":
    case "image":
    case "html_block":
    case "thematic_break":
      return {
        marginTop: spacing.paragraphMarginTop + 4,
        marginBottom: spacing.paragraphMarginBottom + 4,
      };
    default:
      return {
        marginTop: spacing.paragraphMarginTop,
        marginBottom: spacing.paragraphMarginBottom,
      };
  }
}

function pushBlock(
  output: NormalizedBlock[],
  block: Omit<NormalizedBlock, "marginTop" | "marginBottom" | "contentKey" | "contentHash">,
  spacing: SpacingConfig,
) {
  const margins = createMargins(block.type, spacing);
  const contentIdentity = hashNormalizedBlockContent({
    ...block,
    ...margins,
  });
  output.push({
    ...block,
    ...margins,
    ...contentIdentity,
  });
}

function pushLeafBlock(
  output: NormalizedBlock[],
  block: MarkdownBlock,
  sourceBlockIndex: number,
  state: WalkState,
  spacing: SpacingConfig,
): void {
  if (block.type === "paragraph") {
    if (block.children.length === 1 && block.children[0]?.type === "image") {
      const imageNode = block.children[0];
      pushBlock(
        output,
        {
          sourceBlockIndex,
          type: "image",
          meta: {
            type: "image",
            src: imageNode.href,
            alt: extractInlineText(imageNode.children),
          },
          context: createContext(state),
          indent: state.indent,
          image: {
            src: imageNode.href,
            alt: extractInlineText(imageNode.children),
          },
        },
        spacing,
      );
      return;
    }

    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "paragraph",
        meta:
          state.listMarker !== undefined
            ? {
                type: "list_item",
                depth: state.listDepth,
                marker: state.listMarker,
              }
            : state.quoteDepth > 0
              ? {
                  type: "blockquote",
                  depth: state.quoteDepth,
                }
              : {
                  type: "paragraph",
                },
        context: createContext(state),
        indent: state.indent,
        inline: block.children,
      },
      spacing,
    );
    return;
  }

  if (block.type === "heading") {
    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "heading",
        meta: {
          type: "heading",
          level: block.level,
        },
        context: createContext(state),
        indent: state.indent,
        inline: block.children,
      },
      spacing,
    );
    return;
  }

  if (block.type === "code-block") {
    const lang = block.info?.split(/\s+/u).at(0) ?? "";
    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "code_block",
        meta: {
          type: "code_block",
          lang,
          highlighted: lang.length > 0,
        },
        context: createContext(state),
        indent: state.indent,
        code: block.content,
        lang,
      },
      spacing,
    );
    return;
  }

  if (block.type === "table") {
    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "table",
        meta: {
          type: "table",
          columnCount: block.head.cells.length,
          alignments: block.head.cells.map((cell) => cell.align ?? null),
        },
        context: createContext(state),
        indent: state.indent,
        table: block,
      },
      spacing,
    );
    return;
  }

  if (block.type === "html-block") {
    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "html_block",
        meta: {
          type: "html_block",
        },
        context: createContext(state),
        indent: state.indent,
        html: block.content,
      },
      spacing,
    );
    return;
  }

  if (block.type === "thematic-break") {
    pushBlock(
      output,
      {
        sourceBlockIndex,
        type: "thematic_break",
        meta: {
          type: "thematic_break",
        },
        context: createContext(state),
        indent: state.indent,
      },
      spacing,
    );
  }
}

function walkBlocks(
  output: NormalizedBlock[],
  blocks: readonly MarkdownBlock[],
  sourceBlockIndex: number,
  state: WalkState,
  spacing: SpacingConfig,
): void {
  for (const block of blocks) {
    if (block.type === "blockquote") {
      walkBlocks(
        output,
        block.children,
        sourceBlockIndex,
        {
          ...state,
          quoteDepth: state.quoteDepth + 1,
          indent: state.indent + spacing.blockquoteIndent + spacing.blockquoteBorderWidth,
        },
        spacing,
      );
      continue;
    }

    if (block.type === "list") {
      block.items.forEach((item, itemIndex) => {
        const marker = block.kind === "ordered" ? `${block.start + itemIndex}.` : block.marker;
        item.children.forEach((child, childIndex) => {
          walkBlocks(
            output,
            [child],
            sourceBlockIndex,
            {
              ...state,
              indent: state.indent + spacing.listIndent,
              listDepth: state.listDepth + 1,
              ordered: block.kind === "ordered",
              listMarker: childIndex === 0 ? marker : undefined,
            },
            spacing,
          );
        });
      });
      continue;
    }

    pushLeafBlock(output, block, sourceBlockIndex, state, spacing);
  }
}

function normalizeSourceBlock(
  block: MarkdownBlock,
  sourceBlockIndex: number,
  spacing: SpacingConfig,
): NormalizedBlock[] {
  const output: NormalizedBlock[] = [];
  walkBlocks(
    output,
    [block],
    sourceBlockIndex,
    {
      indent: 0,
      quoteDepth: 0,
      listDepth: 0,
    },
    spacing,
  );
  return output;
}

export function normalizeDocument(
  blocks: readonly MarkdownBlock[],
  spacing: SpacingConfig,
  sourceBlockIndexOffset = 0,
): NormalizedDocument {
  const output: NormalizedBlock[] = [];
  const sourceBlockRanges: SourceBlockRange[] = [];

  blocks.forEach((block, sourceBlockIndex) => {
    const from = output.length;
    output.push(...normalizeSourceBlock(block, sourceBlockIndex + sourceBlockIndexOffset, spacing));
    sourceBlockRanges.push({
      from,
      to: output.length,
    });
  });

  return {
    blocks: output,
    sourceBlockRanges,
  };
}

export function normalizeBlocks(
  blocks: readonly MarkdownBlock[],
  spacing: SpacingConfig,
): NormalizedBlock[] {
  return normalizeDocument(blocks, spacing).blocks;
}

export function inlineIsPlainText(nodes: readonly MarkdownInline[] | undefined): boolean {
  if (nodes === undefined) {
    return false;
  }

  return nodes.every((node) => {
    if (node.type === "text" || node.type === "softbreak" || node.type === "hardbreak") {
      return true;
    }

    return false;
  });
}
