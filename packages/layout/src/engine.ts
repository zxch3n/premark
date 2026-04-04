import {
  createIncrementalParseState,
  incrementalParse,
  type IncrementalParseResult,
  type IncrementalParseState,
  type MarkdownBlock,
} from "@pretext-md/parser";

import { hashContent, type BlockCache } from "./cache.ts";
import { createDefaultSpacing, resolveFonts } from "./font-theme.ts";
import { layoutCodeBlock, prepareCodeBlock, type PreparedCodeBlock } from "./measure/code-block.ts";
import { createListPrefix } from "./measure/list.ts";
import { layoutRichText, prepareRichText, type PreparedRichText } from "./measure/rich-text.ts";
import { layoutTableBlock, prepareTableBlock, type PreparedTableBlock } from "./measure/table.ts";
import { layoutTextBlock, prepareTextBlock, type PreparedTextBlock } from "./measure/text-block.ts";
import {
  inlineIsPlainText,
  normalizeDocument,
  type NormalizedBlock,
  type NormalizedDocument,
} from "./normalize.ts";
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

function emptyNormalizedDocument(): NormalizedDocument {
  return {
    blocks: [],
    sourceBlockRanges: [],
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
  private static readonly maxPreparedMemoEntries = 2048;

  private fonts: ResolvedFonts;

  private spacing: SpacingConfig;

  private readonly highlighter?: StyleConfig["highlighter"];

  private version = 0;

  private blockCaches: InternalBlockCache[] = [];

  private preparedBlockMemo = new Map<string, PreparedBlock>();

  private lastMarkdown = "";

  private lastParseState: IncrementalParseState = createIncrementalParseState();

  private lastBlocks: readonly MarkdownBlock[] = [];

  private lastNormalizedDocument: NormalizedDocument = emptyNormalizedDocument();

  private lastLayout = emptyLayout(0, 0);

  private lastDirtyFromLayoutBlock = 0;

  constructor(private config: StyleConfig) {
    this.spacing = {
      ...createDefaultSpacing(),
      ...config.spacing,
    };
    this.fonts = resolveFonts(config.fontTheme, config.fontOverrides);
    this.highlighter = config.highlighter;
  }

  layout(markdown: string, containerWidth: number): DocumentLayout {
    const parseResult =
      this.lastMarkdown.length === 0 && this.lastParseState.text.length === 0
        ? (() => {
            const state = createIncrementalParseState(markdown);
            return {
              state,
              mode: "full",
              change: null,
              dirtyFromBlock: 0,
              dirtyToBlock: state.blocks.length,
              reusedPrefixCount: 0,
              reusedSuffixCount: 0,
              removedCount: 0,
            } satisfies Pick<
              IncrementalParseResult,
              | "state"
              | "mode"
              | "change"
              | "dirtyFromBlock"
              | "dirtyToBlock"
              | "reusedPrefixCount"
              | "reusedSuffixCount"
              | "removedCount"
            >;
          })()
        : incrementalParse(this.lastParseState, markdown);

    return this.applyParseResult(parseResult as IncrementalParseResult, containerWidth);
  }

  layoutFromBlocks(
    blocks: readonly MarkdownBlock[],
    containerWidth: number,
    markdown = this.lastMarkdown,
  ): DocumentLayout {
    const normalizedDocument = normalizeDocument(blocks, this.spacing);
    const layout = this.layoutNormalizedBlocks(normalizedDocument.blocks, containerWidth);
    this.lastMarkdown = markdown;
    this.lastParseState = createIncrementalParseState(markdown);
    this.lastBlocks = blocks;
    this.lastNormalizedDocument = normalizedDocument;
    this.lastLayout = layout;
    this.lastDirtyFromLayoutBlock = 0;
    return layout;
  }

  resize(_prevLayout: DocumentLayout, newWidth: number): DocumentLayout {
    const layout = this.layoutNormalizedBlocks(this.lastNormalizedDocument.blocks, newWidth);
    this.lastLayout = layout;
    this.lastDirtyFromLayoutBlock = 0;
    return layout;
  }

  updateFontTheme(theme: FontTheme): void {
    this.fonts = resolveFonts(theme, this.config.fontOverrides);
    this.blockCaches = [];
    this.preparedBlockMemo.clear();
  }

  createStream(containerWidth: number) {
    return createStream(this, containerWidth);
  }

  dispose(): void {
    this.blockCaches = [];
    this.preparedBlockMemo.clear();
    this.lastBlocks = [];
    this.lastParseState = createIncrementalParseState();
    this.lastNormalizedDocument = emptyNormalizedDocument();
    this.lastLayout = emptyLayout(this.version, 0);
    this.lastDirtyFromLayoutBlock = 0;
  }

  getLastBlocks(): readonly MarkdownBlock[] {
    return this.lastBlocks;
  }

  getLastDirtyFromLayoutBlock(): number {
    return this.lastDirtyFromLayoutBlock;
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

  private getMemoizedPreparedBlock(contentKey: string): PreparedBlock | undefined {
    const preparedBlock = this.preparedBlockMemo.get(contentKey);
    if (preparedBlock === undefined) {
      return undefined;
    }

    this.preparedBlockMemo.delete(contentKey);
    this.preparedBlockMemo.set(contentKey, preparedBlock);
    return preparedBlock;
  }

  private rememberPreparedBlock(contentKey: string, preparedBlock: PreparedBlock): void {
    if (this.preparedBlockMemo.has(contentKey)) {
      this.preparedBlockMemo.delete(contentKey);
    }
    this.preparedBlockMemo.set(contentKey, preparedBlock);

    if (this.preparedBlockMemo.size <= LayoutEngineImpl.maxPreparedMemoEntries) {
      return;
    }

    const oldestKey = this.preparedBlockMemo.keys().next().value;
    if (typeof oldestKey === "string") {
      this.preparedBlockMemo.delete(oldestKey);
    }
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

  applyParseResult(parseResult: IncrementalParseResult, containerWidth: number): DocumentLayout {
    const forceFullLayout =
      parseResult.mode === "full" ||
      this.lastLayout.containerWidth !== containerWidth ||
      this.lastNormalizedDocument.blocks.length === 0;
    const normalizedDocument = forceFullLayout
      ? normalizeDocument(parseResult.state.blocks, this.spacing)
      : this.normalizeIncrementally(parseResult);
    const dirtyFromLayoutBlock = forceFullLayout
      ? 0
      : this.getNormalizedPrefixCount(parseResult.reusedPrefixCount);
    const dirtyToLayoutBlock = forceFullLayout
      ? normalizedDocument.blocks.length
      : normalizedDocument.blocks.length -
        this.getNormalizedSuffixCount(parseResult.reusedSuffixCount);
    const layout = forceFullLayout
      ? this.layoutNormalizedBlocks(normalizedDocument.blocks, containerWidth)
      : this.layoutNormalizedBlocksIncrementally(
          normalizedDocument,
          containerWidth,
          dirtyFromLayoutBlock,
          dirtyToLayoutBlock,
        );

    this.lastMarkdown = parseResult.state.text;
    this.lastParseState = parseResult.state;
    this.lastBlocks = parseResult.state.blocks;
    this.lastNormalizedDocument = normalizedDocument;
    this.lastLayout = layout;
    this.lastDirtyFromLayoutBlock = dirtyFromLayoutBlock;
    return layout;
  }

  private normalizeIncrementally(parseResult: IncrementalParseResult): NormalizedDocument {
    const nextBlocks = parseResult.state.blocks;
    const output: NormalizedBlock[] = [];
    const ranges = Array.from({ length: nextBlocks.length }, () => ({ from: 0, to: 0 }));
    const prefixSourceCount = parseResult.reusedPrefixCount;
    const suffixSourceCount = parseResult.reusedSuffixCount;

    for (let index = 0; index < prefixSourceCount; index += 1) {
      const range = this.lastNormalizedDocument.sourceBlockRanges[index];
      const slice = this.lastNormalizedDocument.blocks.slice(range.from, range.to);
      ranges[index] = {
        from: output.length,
        to: output.length + slice.length,
      };
      output.push(...slice);
    }

    const middleDocument = normalizeDocument(
      nextBlocks.slice(parseResult.dirtyFromBlock, parseResult.dirtyToBlock),
      this.spacing,
      parseResult.dirtyFromBlock,
    );
    middleDocument.sourceBlockRanges.forEach((range, index) => {
      ranges[parseResult.dirtyFromBlock + index] = {
        from: output.length + range.from,
        to: output.length + range.to,
      };
    });
    output.push(...middleDocument.blocks);

    const oldSuffixStart = this.lastBlocks.length - suffixSourceCount;
    const newSuffixStart = nextBlocks.length - suffixSourceCount;
    for (let offset = 0; offset < suffixSourceCount; offset += 1) {
      const oldIndex = oldSuffixStart + offset;
      const newIndex = newSuffixStart + offset;
      const range = this.lastNormalizedDocument.sourceBlockRanges[oldIndex];
      const slice = this.lastNormalizedDocument.blocks.slice(range.from, range.to);
      ranges[newIndex] = {
        from: output.length,
        to: output.length + slice.length,
      };
      output.push(...slice);
    }

    return {
      blocks: output,
      sourceBlockRanges: ranges,
    };
  }

  private getNormalizedPrefixCount(reusedPrefixCount: number): number {
    if (reusedPrefixCount <= 0) {
      return 0;
    }

    return this.lastNormalizedDocument.sourceBlockRanges[reusedPrefixCount - 1]?.to ?? 0;
  }

  private getNormalizedSuffixCount(reusedSuffixCount: number): number {
    if (reusedSuffixCount <= 0) {
      return 0;
    }

    const startIndex = this.lastBlocks.length - reusedSuffixCount;
    const range = this.lastNormalizedDocument.sourceBlockRanges[startIndex];
    return (
      this.lastNormalizedDocument.blocks.length -
      (range?.from ?? this.lastNormalizedDocument.blocks.length)
    );
  }

  private layoutNormalizedBlocksIncrementally(
    normalizedDocument: NormalizedDocument,
    containerWidth: number,
    dirtyFromBlock: number,
    dirtyToBlock: number,
  ): DocumentLayout {
    if (normalizedDocument.blocks.length === 0) {
      this.version += 1;
      this.blockCaches = [];
      return emptyLayout(this.version, containerWidth);
    }

    const nextCaches: InternalBlockCache[] = [];
    const lines: LayoutLine[] = [];
    const blocks: BlockLayout[] = [];
    let cursorY = 0;
    let previousMarginBottom = 0;

    for (let blockIndex = 0; blockIndex < dirtyFromBlock; blockIndex += 1) {
      const block = this.lastLayout.blocks[blockIndex];
      const cachedLines = this.lastLayout.lines.slice(
        block.firstLineIndex,
        block.firstLineIndex + block.lineCount,
      );
      blocks.push(block);
      lines.push(...cachedLines);
      nextCaches.push(this.blockCaches[blockIndex]);
      cursorY = block.y + block.height;
      previousMarginBottom =
        normalizedDocument.blocks[blockIndex]?.marginBottom ?? previousMarginBottom;
    }

    for (let blockIndex = dirtyFromBlock; blockIndex < dirtyToBlock; blockIndex += 1) {
      const normalized = normalizedDocument.blocks[blockIndex];
      cursorY +=
        blockIndex === 0
          ? normalized.marginTop
          : Math.max(previousMarginBottom, normalized.marginTop);
      const width = Math.max(1, containerWidth - normalized.indent);
      const contentHash = normalized.contentHash;
      const contentKey = normalized.contentKey;
      const cache = this.blockCaches[blockIndex];
      const preparedBlock =
        cache !== undefined && cache.contentKey === contentKey
          ? cache.preparedBlock
          : (this.getMemoizedPreparedBlock(contentKey) ?? this.prepareBlock(normalized));
      const measured = this.layoutPreparedBlock(
        normalized,
        preparedBlock,
        blockIndex,
        lines.length,
        normalized.indent,
        cursorY,
        width,
      );

      lines.push(...measured.lines);
      blocks.push(measured.block);
      nextCaches.push({
        contentHash,
        contentKey,
        prepared: preparedBlock,
        preparedBlock,
        lines: measured.lines,
        layoutWidth: width,
        block: measured.block,
      });
      this.rememberPreparedBlock(contentKey, preparedBlock);
      cursorY += measured.block.height;
      previousMarginBottom = normalized.marginBottom;
    }

    const suffixCount = normalizedDocument.blocks.length - dirtyToBlock;
    if (suffixCount > 0) {
      const oldSuffixStart = this.lastLayout.blocks.length - suffixCount;
      const firstOldSuffix = this.lastLayout.blocks[oldSuffixStart];
      const firstNewNormalized = normalizedDocument.blocks[dirtyToBlock];
      const firstNewY =
        cursorY +
        (dirtyToBlock === 0
          ? firstNewNormalized.marginTop
          : Math.max(previousMarginBottom, firstNewNormalized.marginTop));
      const yOffset = firstNewY - firstOldSuffix.y;

      for (let offset = 0; offset < suffixCount; offset += 1) {
        const oldIndex = oldSuffixStart + offset;
        const newIndex = dirtyToBlock + offset;
        const oldBlock = this.lastLayout.blocks[oldIndex];
        const oldLines = this.lastLayout.lines.slice(
          oldBlock.firstLineIndex,
          oldBlock.firstLineIndex + oldBlock.lineCount,
        );
        const translatedLines = oldLines.map((line) =>
          translateLine(line, newIndex, lines.length, yOffset),
        );
        const translatedBlock: BlockLayout = {
          ...oldBlock,
          index: newIndex,
          firstLineIndex: lines.length,
          y: oldBlock.y + yOffset,
          contentBox: {
            ...oldBlock.contentBox,
            y: oldBlock.contentBox.y + yOffset,
          },
        };
        lines.push(...translatedLines);
        blocks.push(translatedBlock);
        nextCaches.push({
          ...this.blockCaches[oldIndex],
          lines: translatedLines,
          block: translatedBlock,
        });
        cursorY = translatedBlock.y + translatedBlock.height;
        previousMarginBottom = normalizedDocument.blocks[newIndex].marginBottom;
      }
    }

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
      const contentHash = block.contentHash;
      const contentKey = block.contentKey;
      const cache = this.blockCaches[blockIndex];

      if (cache !== undefined && cache.contentKey === contentKey && cache.layoutWidth === width) {
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
        cache !== undefined && cache.contentKey === contentKey
          ? cache.preparedBlock
          : (this.getMemoizedPreparedBlock(contentKey) ?? this.prepareBlock(block));
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
        contentKey,
        prepared: preparedBlock,
        preparedBlock,
        lines: measured.lines,
        layoutWidth: width,
        block: measured.block,
      });
      this.rememberPreparedBlock(contentKey, preparedBlock);
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
