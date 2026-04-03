import { parseMarkdown, type MarkdownBlock } from "@pretext-md/parser";

import { hashContent, type BlockCache } from "./cache.ts";
import { createDefaultSpacing, resolveFonts } from "./font-theme.ts";
import { layoutCodeBlock, prepareCodeBlock, type PreparedCodeBlock } from "./measure/code-block.ts";
import { createListPrefix } from "./measure/list.ts";
import { layoutRichText, prepareRichText, type PreparedRichText } from "./measure/rich-text.ts";
import { layoutTableBlock, prepareTableBlock, type PreparedTableBlock } from "./measure/table.ts";
import { layoutTextBlock, prepareTextBlock, type PreparedTextBlock } from "./measure/text-block.ts";
import { normalizeBlocks, inlineIsPlainText, type NormalizedBlock } from "./normalize.ts";
import { createStream } from "./stream.ts";
import type {
  BlockLayout,
  BlockMeta,
  BlockType,
  DocumentLayout,
  FontTheme,
  LayoutEngine,
  LayoutLine,
  OpaqueLine,
  ResolvedFonts,
  SpacingConfig,
  StyleConfig,
  TextLine,
} from "./types.ts";

interface PreparedHtmlBlock {
  estimate: PreparedTextBlock;
  html: string;
}

interface PreparedImageBlock {
  src: string;
  alt: string;
}

type PreparedBlock =
  | { kind: "text"; prepared: PreparedTextBlock }
  | { kind: "rich"; prepared: PreparedRichText }
  | { kind: "code"; prepared: PreparedCodeBlock }
  | { kind: "table"; prepared: PreparedTableBlock }
  | { kind: "html"; prepared: PreparedHtmlBlock }
  | { kind: "image"; prepared: PreparedImageBlock }
  | { kind: "thematic_break" };

interface InternalBlockCache extends BlockCache {
  preparedBlock: PreparedBlock;
}

function emptyLayout(version: number, containerWidth: number): DocumentLayout {
  return {
    lines: [],
    blocks: [],
    totalHeight: 0,
    containerWidth,
    version,
  };
}

function plainInlineText(nodes: NonNullable<NormalizedBlock["inline"]>): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "softbreak":
          return " ";
        case "hardbreak":
          return "\n";
        default:
          return "";
      }
    })
    .join("");
}

function stripHtmlMarkup(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function translateLine(
  line: LayoutLine,
  blockIndex: number,
  firstLineIndex: number,
  yOffset: number,
): LayoutLine {
  if (line.kind === "text") {
    return {
      ...line,
      blockIndex,
      index: firstLineIndex + line.lineIndexInBlock,
      y: line.y + yOffset,
      fragments: line.fragments.map((fragment) => ({ ...fragment })),
    };
  }

  return {
    ...line,
    blockIndex,
    index: firstLineIndex + line.lineIndexInBlock,
    y: line.y + yOffset,
  };
}

function getRenderType(block: NormalizedBlock): BlockType {
  if (block.meta.type === "list_item") {
    return "list_item";
  }

  if (block.meta.type === "blockquote") {
    return "blockquote";
  }

  return block.type;
}

function compareLines(left: LayoutLine, right: LayoutLine): boolean {
  return hashContent(left) === hashContent(right);
}

export class LayoutEngineImpl implements LayoutEngine {
  private fonts: ResolvedFonts;

  private spacing: SpacingConfig;

  private readonly highlighter?: StyleConfig["highlighter"];

  private version = 0;

  private blockCaches: InternalBlockCache[] = [];

  private lastMarkdown = "";

  private lastBlocks: MarkdownBlock[] = [];

  private lastNormalized: NormalizedBlock[] = [];

  private lastLayout = emptyLayout(0, 0);

  constructor(private config: StyleConfig) {
    this.spacing = {
      ...createDefaultSpacing(),
      ...config.spacing,
    };
    this.fonts = resolveFonts(config.fontTheme, config.fontOverrides);
    this.highlighter = config.highlighter;
  }

  layout(markdown: string, containerWidth: number): DocumentLayout {
    const blocks = parseMarkdown(markdown);
    return this.layoutFromBlocks(blocks, containerWidth, markdown);
  }

  layoutFromBlocks(
    blocks: MarkdownBlock[],
    containerWidth: number,
    markdown = this.lastMarkdown,
  ): DocumentLayout {
    const normalized = normalizeBlocks(blocks, this.spacing);
    const layout = this.layoutNormalizedBlocks(normalized, containerWidth);
    this.lastMarkdown = markdown;
    this.lastBlocks = blocks;
    this.lastNormalized = normalized;
    this.lastLayout = layout;
    return layout;
  }

  resize(_prevLayout: DocumentLayout, newWidth: number): DocumentLayout {
    const layout = this.layoutNormalizedBlocks(this.lastNormalized, newWidth);
    this.lastLayout = layout;
    return layout;
  }

  updateFontTheme(theme: FontTheme): void {
    this.fonts = resolveFonts(theme, this.config.fontOverrides);
    this.blockCaches = [];
  }

  createStream(containerWidth: number) {
    return createStream(this, containerWidth);
  }

  dispose(): void {
    this.blockCaches = [];
    this.lastBlocks = [];
    this.lastNormalized = [];
    this.lastLayout = emptyLayout(this.version, 0);
  }

  getLastBlocks(): MarkdownBlock[] {
    return this.lastBlocks;
  }

  getLastLayout(): DocumentLayout {
    return this.lastLayout;
  }

  private getBaseTypography(block: NormalizedBlock): { font: string; lineHeight: number } {
    if (block.type === "heading") {
      const level = (block.meta as Extract<BlockMeta, { type: "heading" }>).level;
      const fontKey = `heading${level}` as const;
      return {
        font: this.fonts[fontKey],
        lineHeight: this.fonts.lineHeights[fontKey],
      };
    }

    return {
      font: this.fonts.body,
      lineHeight: this.fonts.lineHeights.body,
    };
  }

  private prepareBlock(block: NormalizedBlock): PreparedBlock {
    if (block.type === "heading" || block.type === "paragraph") {
      const typography = this.getBaseTypography(block);
      const prefix = createListPrefix(block.context.listMarker, this.fonts, this.spacing);
      const plain =
        block.inline !== undefined && inlineIsPlainText(block.inline) && prefix === undefined;
      if (plain && block.inline !== undefined) {
        return {
          kind: "text",
          prepared: prepareTextBlock(
            plainInlineText(block.inline),
            typography.font,
            typography.lineHeight,
            "text",
          ),
        };
      }

      return {
        kind: "rich",
        prepared: prepareRichText({
          nodes: block.inline ?? [],
          fonts: this.fonts,
          baseFont: typography.font,
          lineHeight: typography.lineHeight,
          prefix,
        }),
      };
    }

    if (block.type === "code_block") {
      return {
        kind: "code",
        prepared: prepareCodeBlock(
          block.code ?? "",
          block.lang ?? "",
          this.fonts,
          this.spacing,
          this.highlighter,
        ),
      };
    }

    if (block.type === "table" && block.table !== undefined) {
      return {
        kind: "table",
        prepared: prepareTableBlock(block.table, this.fonts, this.spacing),
      };
    }

    if (block.type === "html_block") {
      return {
        kind: "html",
        prepared: {
          html: block.html ?? "",
          estimate: prepareTextBlock(
            stripHtmlMarkup(block.html ?? "") || " ",
            this.fonts.body,
            this.fonts.lineHeights.body,
            "text",
          ),
        },
      };
    }

    if (block.type === "image") {
      return {
        kind: "image",
        prepared: {
          src: block.image?.src ?? "",
          alt: block.image?.alt ?? "",
        },
      };
    }

    return {
      kind: "thematic_break",
    };
  }

  private layoutPreparedBlock(
    normalized: NormalizedBlock,
    preparedBlock: PreparedBlock,
    blockIndex: number,
    firstLineIndex: number,
    x: number,
    y: number,
    maxWidth: number,
  ): {
    block: BlockLayout;
    lines: LayoutLine[];
  } {
    const renderType = getRenderType(normalized);
    const createBlock = (height: number, width: number, lines: LayoutLine[]): BlockLayout => ({
      index: blockIndex,
      type: renderType,
      firstLineIndex,
      lineCount: lines.length,
      y,
      height,
      contentBox: {
        x,
        y,
        width,
        height,
      },
      meta: normalized.meta,
      context: normalized.context,
    });

    if (preparedBlock.kind === "text") {
      const measured = layoutTextBlock(preparedBlock.prepared, {
        blockIndex,
        startLineIndex: firstLineIndex,
        x,
        y,
        maxWidth,
      });
      return {
        block: createBlock(measured.height, maxWidth, measured.lines),
        lines: measured.lines,
      };
    }

    if (preparedBlock.kind === "rich") {
      const measured = layoutRichText(preparedBlock.prepared, {
        blockIndex,
        startLineIndex: firstLineIndex,
        x,
        y,
        maxWidth,
      });
      return {
        block: createBlock(measured.height, maxWidth, measured.lines),
        lines: measured.lines,
      };
    }

    if (preparedBlock.kind === "code") {
      const measured = layoutCodeBlock(preparedBlock.prepared, {
        blockIndex,
        lineIndex: firstLineIndex,
        x,
        y,
        maxWidth,
      });
      return {
        block: createBlock(measured.height, maxWidth, [measured.line]),
        lines: [measured.line],
      };
    }

    if (preparedBlock.kind === "table") {
      const measured = layoutTableBlock(preparedBlock.prepared, {
        blockIndex,
        lineIndex: firstLineIndex,
        x,
        y,
        maxWidth,
      });
      return {
        block: createBlock(measured.height, maxWidth, [measured.line]),
        lines: [measured.line],
      };
    }

    if (preparedBlock.kind === "html") {
      const estimate = layoutTextBlock(preparedBlock.prepared.estimate, {
        blockIndex,
        startLineIndex: firstLineIndex,
        x,
        y,
        maxWidth,
      });
      const line: OpaqueLine = {
        kind: "opaque",
        index: firstLineIndex,
        blockIndex,
        lineIndexInBlock: 0,
        x,
        y,
        height: estimate.height,
        width: maxWidth,
        content: {
          type: "html_block",
          html: preparedBlock.prepared.html,
        },
      };
      return {
        block: createBlock(estimate.height, maxWidth, [line]),
        lines: [line],
      };
    }

    if (preparedBlock.kind === "image") {
      const displayHeight = Math.min(
        this.spacing.imagePlaceholderHeight,
        Math.max(120, maxWidth * 0.56),
      );
      const line: OpaqueLine = {
        kind: "opaque",
        index: firstLineIndex,
        blockIndex,
        lineIndexInBlock: 0,
        x,
        y,
        height: displayHeight,
        width: maxWidth,
        content: {
          type: "image",
          src: preparedBlock.prepared.src,
          alt: preparedBlock.prepared.alt,
          displayWidth: maxWidth,
          displayHeight,
        },
      };
      return {
        block: createBlock(displayHeight, maxWidth, [line]),
        lines: [line],
      };
    }

    const ruleLine: TextLine = {
      kind: "text",
      index: firstLineIndex,
      blockIndex,
      lineIndexInBlock: 0,
      x,
      y,
      height: this.spacing.thematicBreakHeight,
      width: maxWidth,
      fragments: [],
    };

    return {
      block: createBlock(this.spacing.thematicBreakHeight, maxWidth, [ruleLine]),
      lines: [ruleLine],
    };
  }

  private layoutNormalizedBlocks(
    normalizedBlocks: NormalizedBlock[],
    containerWidth: number,
  ): DocumentLayout {
    if (normalizedBlocks.length === 0) {
      this.version += 1;
      this.blockCaches = [];
      return emptyLayout(this.version, containerWidth);
    }

    const nextCaches: InternalBlockCache[] = [];
    const lines: LayoutLine[] = [];
    const blocks: BlockLayout[] = [];
    let cursorY = 0;
    let previousMarginBottom = 0;

    normalizedBlocks.forEach((block, blockIndex) => {
      cursorY +=
        blockIndex === 0 ? block.marginTop : Math.max(previousMarginBottom, block.marginTop);
      const width = Math.max(1, containerWidth - block.indent);
      const contentHash = hashContent(block);
      const cache = this.blockCaches[blockIndex];

      if (cache !== undefined && cache.contentHash === contentHash && cache.layoutWidth === width) {
        const translatedLines = cache.lines.map((line) =>
          translateLine(line, blockIndex, lines.length, cursorY - cache.block.y),
        );
        const translatedBlock: BlockLayout = {
          ...cache.block,
          index: blockIndex,
          firstLineIndex: lines.length,
          y: cursorY,
          contentBox: {
            ...cache.block.contentBox,
            y: cursorY,
          },
        };
        lines.push(...translatedLines);
        blocks.push(translatedBlock);
        nextCaches.push({
          ...cache,
          lines: translatedLines,
          block: translatedBlock,
        });
        cursorY += translatedBlock.height;
        previousMarginBottom = block.marginBottom;
        return;
      }

      const preparedBlock =
        cache !== undefined && cache.contentHash === contentHash
          ? cache.preparedBlock
          : this.prepareBlock(block);
      const measured = this.layoutPreparedBlock(
        block,
        preparedBlock,
        blockIndex,
        lines.length,
        block.indent,
        cursorY,
        width,
      );

      lines.push(...measured.lines);
      blocks.push(measured.block);
      nextCaches.push({
        contentHash,
        prepared: preparedBlock,
        preparedBlock,
        lines: measured.lines,
        layoutWidth: width,
        block: measured.block,
      });
      cursorY += measured.block.height;
      previousMarginBottom = block.marginBottom;
    });

    this.blockCaches = nextCaches;
    this.version += 1;

    return {
      lines,
      blocks,
      totalHeight: cursorY + previousMarginBottom,
      containerWidth,
      version: this.version,
    };
  }
}

export function createLayoutEngine(config: StyleConfig): LayoutEngineImpl {
  return new LayoutEngineImpl(config);
}

export function diffLines(previous: DocumentLayout, next: DocumentLayout, dirtyFromBlock: number) {
  const previousLineStart =
    previous.blocks[dirtyFromBlock]?.firstLineIndex ?? previous.lines.length;
  const nextLineStart = next.blocks[dirtyFromBlock]?.firstLineIndex ?? next.lines.length;
  const startIndex = Math.min(previousLineStart, nextLineStart);
  const overlap = Math.min(previous.lines.length, next.lines.length);
  const modifiedLines = new Array<{ index: number; line: LayoutLine }>();

  for (let index = startIndex; index < overlap; index += 1) {
    if (!compareLines(previous.lines[index], next.lines[index])) {
      modifiedLines.push({
        index,
        line: next.lines[index],
      });
    }
  }

  return {
    appendedLines: next.lines.slice(overlap),
    modifiedLines,
    removedLineCount: Math.max(0, previous.lines.length - next.lines.length),
  };
}
