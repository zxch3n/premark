import type { MarkdownBlock, MarkdownInline } from "@pretext-md/parser";

import type { BlockContext, BlockMeta, BlockType, SpacingConfig } from "./types.ts";

export interface NormalizedBlock {
  type: BlockType;
  meta: BlockMeta;
  context: BlockContext;
  indent: number;
  marginTop: number;
  marginBottom: number;
  inline?: MarkdownInline[];
  code?: string;
  lang?: string;
  html?: string;
  image?: {
    src: string;
    alt: string;
  };
  table?: Extract<MarkdownBlock, { type: "table" }>;
}

interface WalkState {
  indent: number;
  quoteDepth: number;
  listDepth: number;
  ordered?: boolean;
  listMarker?: string;
}

function extractInlineText(nodes: MarkdownInline[]): string {
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
  block: Omit<NormalizedBlock, "marginTop" | "marginBottom">,
  spacing: SpacingConfig,
) {
  const margins = createMargins(block.type, spacing);
  output.push({
    ...block,
    ...margins,
  });
}

function pushLeafBlock(
  output: NormalizedBlock[],
  block: MarkdownBlock,
  state: WalkState,
  spacing: SpacingConfig,
): void {
  if (block.type === "paragraph") {
    if (block.children.length === 1 && block.children[0]?.type === "image") {
      const imageNode = block.children[0];
      pushBlock(
        output,
        {
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
  blocks: MarkdownBlock[],
  state: WalkState,
  spacing: SpacingConfig,
): void {
  for (const block of blocks) {
    if (block.type === "blockquote") {
      walkBlocks(
        output,
        block.children,
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

    pushLeafBlock(output, block, state, spacing);
  }
}

export function normalizeBlocks(
  blocks: MarkdownBlock[],
  spacing: SpacingConfig,
): NormalizedBlock[] {
  const output: NormalizedBlock[] = [];
  walkBlocks(
    output,
    blocks,
    {
      indent: 0,
      quoteDepth: 0,
      listDepth: 0,
    },
    spacing,
  );
  return output;
}

export function inlineIsPlainText(nodes: MarkdownInline[] | undefined): boolean {
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
