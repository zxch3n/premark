import {
  measureGraphemeBoundaryXs,
  type DocumentLayout,
  type InlineFragment,
  type LayoutUpdateMetadata,
} from "@pretext-md/layout";
import type {
  BlockSpan,
  MarkdownInlineSourceRecord,
  SourceRange,
  TextChange as ParserTextChange,
} from "@pretext-md/parser";
import { createGraphemeSegments, snapOffsetToGraphemeBoundary } from "./grapheme.ts";
import { createWordSegments } from "./text-segments.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditableFragment {
  readonly blockId: string;
  readonly blockIndex: number;
  readonly lineIndex: number;
  readonly fragmentIndex: number;
  readonly text: string;
  readonly font: string;
  readonly type: InlineFragment["type"] | "code_block";
  readonly sourceRange: SourceRange;
  readonly sourceOffsets: readonly number[];
  readonly tokenRange?: SourceRange;
  readonly rect: Rect;
  readonly textInsetX: number;
}

export interface HitTestResult {
  readonly offset: number;
  readonly fragment: EditableFragment | null;
  readonly affinity: "before" | "after";
}

export type HitTestGranularity = "character" | "word" | "line" | "block";

export interface GranularHitTestResult extends HitTestResult {
  readonly granularity: HitTestGranularity;
  readonly range: SourceRange;
}

export interface CaretRect {
  readonly offset: number;
  readonly rect: Rect;
  readonly fragment: EditableFragment | null;
}

export interface EditableLayoutIndexInput {
  readonly markdown: string;
  readonly layout: DocumentLayout;
  readonly blockSpans: readonly BlockSpan[];
  readonly inlineSources: readonly MarkdownInlineSourceRecord[];
  readonly sourceMap?: EditableLayoutSourceMap;
}

export interface EditableLayoutSourceMap {
  readonly markdown: string;
  readonly segments: readonly EditableLayoutSourceMapSegment[];
  readonly runs?: readonly EditableLayoutSourceMapRun[];
}

export interface EditableLayoutSourceMapSegment {
  readonly revealedFrom: number;
  readonly revealedTo: number;
  readonly sourceFrom: number;
  readonly sourceTo: number;
}

export interface EditableLayoutSourceMapRun {
  readonly revealedFrom: number;
  readonly revealedTo: number;
  readonly revealedOffsets: readonly number[];
  readonly sourceOffsets: readonly number[];
}

export class EditableLayoutIndex {
  readonly markdown: string;
  readonly layout: DocumentLayout;
  readonly blockSpans: readonly BlockSpan[];
  readonly fragments: readonly EditableFragment[];

  constructor(input: EditableLayoutIndexInput, fragments?: readonly EditableFragment[]) {
    this.markdown = input.markdown;
    this.layout = input.layout;
    this.blockSpans = input.blockSpans;
    this.fragments = fragments ?? buildEditableFragments(input);
  }

  hitTest(x: number, y: number): HitTestResult {
    const lineFragments = this.fragments.filter(
      (fragment) => y >= fragment.rect.y && y < fragment.rect.y + fragment.rect.height,
    );

    if (lineFragments.length === 0) {
      const closest = closestFragment(this.fragments, x, y);
      if (closest === null) {
        return {
          offset: 0,
          fragment: null,
          affinity: "after",
        };
      }
      return {
        offset: x < closest.rect.x ? closest.sourceRange.from : closest.sourceRange.to,
        fragment: closest,
        affinity: x < closest.rect.x ? "before" : "after",
      };
    }

    const fragment =
      lineFragments.find(
        (candidate) =>
          x >= candidate.rect.x && x <= candidate.rect.x + Math.max(candidate.rect.width, 1),
      ) ?? nearestFragmentOnLine(lineFragments, x);

    return {
      offset: offsetInsideFragment(fragment, x),
      fragment,
      affinity: x <= fragment.rect.x + fragment.rect.width / 2 ? "before" : "after",
    };
  }

  sourceOffsetToCaretRect(offset: number, affinity: "before" | "after" = "after"): CaretRect {
    const containing = containingFragmentAtOffset(this.fragments, offset, affinity);

    if (containing !== undefined) {
      return {
        offset,
        rect: caretRectInFragment(containing, offset, affinity),
        fragment: containing,
      };
    }

    const before = [...this.fragments]
      .reverse()
      .find((fragment) => fragment.sourceRange.to <= offset);
    const after = this.fragments.find((fragment) => fragment.sourceRange.from >= offset);
    const fallback =
      before !== undefined &&
      after !== undefined &&
      isInterBlockWhitespaceOffset(this.blockSpans, offset)
        ? before
        : affinity === "before"
          ? (before ?? after)
          : (after ?? before);

    if (fallback === undefined) {
      return {
        offset,
        rect: { x: 0, y: 0, width: 1, height: 0 },
        fragment: null,
      };
    }

    const targetOffset =
      fallback === before && fallback.sourceRange.to <= offset
        ? fallback.sourceRange.to
        : fallback.sourceRange.from;
    return {
      offset,
      rect: caretRectInFragment(fallback, targetOffset, affinity),
      fragment: fallback,
    };
  }

  hitTestSourceRange(x: number, y: number, granularity: HitTestGranularity): GranularHitTestResult {
    const hit = this.hitTest(x, y);
    return {
      ...hit,
      granularity,
      range: this.sourceRangeAtOffset(hit.offset, granularity, hit.affinity),
    };
  }

  sourceRangeAtOffset(
    offset: number,
    granularity: HitTestGranularity,
    affinity: "before" | "after" = "after",
  ): SourceRange {
    switch (granularity) {
      case "character":
        return collapsedRange(clampOffset(offset, this.markdown.length));
      case "word":
        return wordRangeAtOffset(this.markdown, offset, affinity);
      case "line":
        return this.sourceLineRangeAtOffset(offset, affinity);
      case "block":
        return this.sourceBlockRangeAtOffset(offset, affinity);
    }
  }

  sourceLineRangeAtOffset(offset: number, affinity: "before" | "after" = "after"): SourceRange {
    const caret = this.sourceOffsetToCaretRect(offset, affinity);
    const fragment = caret.fragment;
    if (fragment === null) {
      return collapsedRange(clampOffset(offset, this.markdown.length));
    }

    const lineFragments = this.fragments.filter(
      (candidate) =>
        candidate.blockIndex === fragment.blockIndex && candidate.lineIndex === fragment.lineIndex,
    );
    return sourceRangeCoveringFragments(lineFragments, offset, this.markdown.length);
  }

  sourceBlockRangeAtOffset(offset: number, affinity: "before" | "after" = "after"): SourceRange {
    const bounded = clampOffset(offset, this.markdown.length);
    const span =
      this.blockSpans.find((candidate) =>
        affinity === "before"
          ? bounded > candidate.from && bounded <= candidate.to
          : bounded >= candidate.from && bounded < candidate.to,
      ) ??
      this.blockSpans.find((candidate) => bounded >= candidate.from && bounded <= candidate.to);

    if (span === undefined) {
      return collapsedRange(bounded);
    }
    return {
      from: span.from,
      to: span.to,
    };
  }

  sourceRangeToSelectionRects(range: SourceRange): Rect[] {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    if (from === to) return [];

    const rects: Rect[] = [];
    for (const fragment of this.fragments) {
      const start = Math.max(from, fragment.sourceRange.from);
      const end = Math.min(to, fragment.sourceRange.to);
      if (start >= end) continue;
      const rect = rectForFragmentRange(fragment, start, end);
      if (rect.width > 0 && rect.height > 0) {
        rects.push(rect);
      }
    }
    return mergeLineRects(rects);
  }
}

function containingFragmentAtOffset(
  fragments: readonly EditableFragment[],
  offset: number,
  affinity: "before" | "after",
): EditableFragment | undefined {
  const containing = fragments.filter(
    (fragment) => offset >= fragment.sourceRange.from && offset <= fragment.sourceRange.to,
  );
  if (containing.length <= 1) {
    return containing[0];
  }

  if (affinity === "before") {
    return (
      [...containing].reverse().find((fragment) => fragment.sourceRange.to === offset) ??
      containing[0]
    );
  }

  return (
    containing.find((fragment) => fragment.sourceRange.from === offset) ??
    containing[containing.length - 1]
  );
}

function isInterBlockWhitespaceOffset(blockSpans: readonly BlockSpan[], offset: number): boolean {
  const previousBlock = [...blockSpans].reverse().find((span) => span.to <= offset);
  const nextBlock = blockSpans.find((span) => span.from >= offset);
  return (
    previousBlock !== undefined &&
    nextBlock !== undefined &&
    offset > previousBlock.to &&
    offset < nextBlock.from
  );
}

function sourceRangeCoveringFragments(
  fragments: readonly EditableFragment[],
  fallbackOffset: number,
  textLength: number,
): SourceRange {
  if (fragments.length === 0) {
    return collapsedRange(clampOffset(fallbackOffset, textLength));
  }
  return {
    from: Math.min(...fragments.map((fragment) => fragment.sourceRange.from)),
    to: Math.max(...fragments.map((fragment) => fragment.sourceRange.to)),
  };
}

function wordRangeAtOffset(
  markdown: string,
  offset: number,
  affinity: "before" | "after",
): SourceRange {
  const bounded = clampOffset(offset, markdown.length);
  for (const segment of createWordSegments(markdown)) {
    if (!segment.isWordLike) continue;
    const contains =
      bounded > segment.from && bounded < segment.to
        ? true
        : affinity === "before"
          ? bounded === segment.to
          : bounded === segment.from;
    if (contains) {
      return {
        from: segment.from,
        to: segment.to,
      };
    }
  }
  return collapsedRange(bounded);
}

function collapsedRange(offset: number): SourceRange {
  return {
    from: offset,
    to: offset,
  };
}

function clampOffset(offset: number, length: number): number {
  return Math.min(Math.max(offset, 0), length);
}

export function createEditableLayoutIndex(input: EditableLayoutIndexInput): EditableLayoutIndex {
  return new EditableLayoutIndex(input);
}

export function createIncrementalEditableLayoutIndex(
  input: EditableLayoutIndexInput,
  previous: EditableLayoutIndex,
): EditableLayoutIndex {
  const fragments = buildIncrementalEditableFragments(input, previous);
  return new EditableLayoutIndex(input, fragments ?? undefined);
}

function buildEditableFragments(input: EditableLayoutIndexInput): EditableFragment[] {
  const fragments = buildEditableTextFragments(input, {
    fromBlock: 0,
    toBlock: Number.POSITIVE_INFINITY,
    sourceCursor: 0,
  });
  return addVirtualSourceLineBreakFragments(fragments, input.markdown, input.blockSpans);
}

function buildIncrementalEditableFragments(
  input: EditableLayoutIndexInput,
  previous: EditableLayoutIndex,
): readonly EditableFragment[] | null {
  const update = input.layout.update;
  if (
    update === undefined ||
    update.mode !== "incremental" ||
    update.sourceChange === null ||
    input.sourceMap !== undefined
  ) {
    return null;
  }

  const prefix: EditableFragment[] = [];
  const suffix: EditableFragment[] = [];
  const oldSuffixStart = update.oldSuffixStartBlock;

  for (const fragment of previous.fragments) {
    if (isVirtualLineBreakFragment(fragment)) continue;

    if (fragment.blockIndex < update.dirtyFromBlock) {
      if (fragment.sourceRange.to > update.sourceChange.fromA) {
        return null;
      }
      prefix.push(fragment);
      continue;
    }

    if (fragment.blockIndex >= oldSuffixStart) {
      const transformed = transformReusableSuffixFragment(
        fragment,
        input.layout,
        previous.layout,
        update,
      );
      if (transformed === null) {
        return null;
      }
      suffix.push(transformed);
    }
  }

  const sourceCursor = prefix.at(-1)?.sourceRange.to ?? 0;
  const dirty = buildEditableTextFragments(input, {
    fromBlock: update.dirtyFromBlock,
    toBlock: update.dirtyToBlock,
    sourceCursor,
  });
  const fragments = [...prefix, ...dirty, ...suffix].sort(compareEditableFragments);
  return addVirtualSourceLineBreakFragments(fragments, input.markdown, input.blockSpans);
}

function isVirtualLineBreakFragment(fragment: EditableFragment): boolean {
  return fragment.text.length === 0 && fragment.blockId.includes(":newline:");
}

function transformReusableSuffixFragment(
  fragment: EditableFragment,
  layout: DocumentLayout,
  previousLayout: DocumentLayout,
  update: LayoutUpdateMetadata,
): EditableFragment | null {
  const change = update.sourceChange;
  if (change === null || sourceRangeIntersectsOldChange(fragment.sourceRange, change)) {
    return null;
  }

  const newBlockIndex =
    update.newSuffixStartBlock + fragment.blockIndex - update.oldSuffixStartBlock;
  const oldBlock = previousLayout.blocks[fragment.blockIndex];
  const newBlock = layout.blocks[newBlockIndex];
  if (oldBlock === undefined || newBlock === undefined) {
    return null;
  }

  const sourceRange = transformSourceRangeAfterChange(fragment.sourceRange, change);
  const sourceOffsets = fragment.sourceOffsets.map((offset) =>
    transformSourceOffsetAfterChange(offset, change),
  );
  const tokenRange =
    fragment.tokenRange === undefined
      ? undefined
      : transformSourceRangeAfterChange(fragment.tokenRange, change);
  const lineDelta = newBlock.firstLineIndex - oldBlock.firstLineIndex;

  return {
    ...fragment,
    blockIndex: newBlockIndex,
    lineIndex: fragment.lineIndex + lineDelta,
    sourceRange,
    sourceOffsets,
    tokenRange,
    rect: {
      ...fragment.rect,
      y: fragment.rect.y + update.suffixYOffset,
    },
  };
}

function sourceRangeIntersectsOldChange(range: SourceRange, change: ParserTextChange): boolean {
  return range.to > change.fromA && range.from < change.toA;
}

function transformSourceRangeAfterChange(
  range: SourceRange,
  change: ParserTextChange,
): SourceRange {
  return {
    from: transformSourceOffsetAfterChange(range.from, change),
    to: transformSourceOffsetAfterChange(range.to, change),
  };
}

function transformSourceOffsetAfterChange(offset: number, change: ParserTextChange): number {
  if (offset <= change.fromA) {
    return offset;
  }
  if (offset >= change.toA) {
    return offset + (change.toB - change.fromB) - (change.toA - change.fromA);
  }
  return change.fromB;
}

function buildEditableTextFragments(
  input: EditableLayoutIndexInput,
  options: {
    readonly fromBlock: number;
    readonly toBlock: number;
    readonly sourceCursor: number;
  },
): EditableFragment[] {
  const tokenRecords = input.inlineSources.filter(
    (record) => record.type === "strong" || record.type === "code-span" || record.type === "link",
  );
  const output: EditableFragment[] = [];
  let sourceCursor = options.sourceCursor;
  let layoutCursor = 0;

  for (const line of input.layout.lines) {
    if (line.blockIndex < options.fromBlock || line.blockIndex >= options.toBlock) {
      continue;
    }

    if (line.kind === "opaque" && line.content.type === "code_block") {
      const codeContent = line.content;
      if (codeContent.code.length === 0) continue;
      const mapped = findFragmentSourceMapping(
        input,
        codeContent.code,
        codeContent.code,
        sourceCursor,
        layoutCursor,
      );
      const sourceRange = mapped.sourceRange;
      const blockSpan = findBlockSpanForRange(input.blockSpans, sourceRange);
      if (blockSpan === undefined) continue;
      let textOffset = 0;
      codeContent.code.split("\n").forEach((codeLine, codeLineIndex) => {
        const lineStart = textOffset;
        const lineEnd = lineStart + codeLine.length;
        textOffset = lineEnd + 1;

        const sourceOffsets = mapped.sourceOffsets.slice(lineStart, lineEnd + 1);
        output.push({
          blockId: blockSpan.id,
          blockIndex: line.blockIndex,
          lineIndex: line.index + codeLineIndex,
          fragmentIndex: codeLineIndex,
          text: codeLine,
          font: codeContent.font,
          type: "code_block",
          sourceRange: sourceRangeFromOffsets(sourceOffsets),
          sourceOffsets,
          rect: {
            x: line.x + codeContent.padding.left,
            y: line.y + codeContent.padding.top + codeLineIndex * codeContent.lineHeight,
            width: Math.max(1, measureTextWidth(codeLine, codeContent.font)),
            height: codeContent.lineHeight,
          },
          textInsetX: 0,
        });
      });
      sourceCursor = Math.max(sourceRange.to, blockSpan.to);
      layoutCursor = mapped.nextLayoutCursor;
      continue;
    }

    if (line.kind !== "text") continue;

    line.fragments.forEach((fragment, fragmentIndex) => {
      const sourceText = comparableSourceText(fragment.text);
      if (sourceText.length === 0) return;
      const mapped = findFragmentSourceMapping(
        input,
        fragment.text,
        sourceText,
        sourceCursor,
        layoutCursor,
      );
      const sourceRange = mapped.sourceRange;
      const blockSpan = findBlockSpanForRange(input.blockSpans, sourceRange);
      if (blockSpan === undefined) {
        sourceCursor = sourceRange.to;
        layoutCursor = mapped.nextLayoutCursor;
        return;
      }
      output.push({
        blockId: blockSpan.id,
        blockIndex: line.blockIndex,
        lineIndex: line.index,
        fragmentIndex,
        text: fragment.text,
        font: fragment.font,
        type: fragment.type,
        sourceRange,
        sourceOffsets: mapped.sourceOffsets,
        tokenRange: findSmallestContainingTokenRange(blockSpan.id, sourceRange, tokenRecords),
        rect: {
          x: line.x + fragment.x,
          y: line.y,
          width: fragment.width,
          height: line.height,
        },
        textInsetX: fragment.type === "inline_code" ? 6 : 0,
      });
      sourceCursor = sourceRange.to;
      layoutCursor = mapped.nextLayoutCursor;
    });
  }

  return output;
}

function addVirtualSourceLineBreakFragments(
  fragments: readonly EditableFragment[],
  markdown: string,
  blockSpans: readonly BlockSpan[],
): EditableFragment[] {
  const virtualFragments: EditableFragment[] = [];
  for (let index = 1; index < blockSpans.length; index += 1) {
    const previousSpan = blockSpans[index - 1]!;
    const nextSpan = blockSpans[index]!;
    const newlineOffsets = newlineOffsetsInRange(markdown, previousSpan.to, nextSpan.from);
    const blankLineCount = Math.max(0, newlineOffsets.length - 1);
    if (blankLineCount === 0) continue;

    const previousFragment = [...fragments]
      .reverse()
      .find((fragment) => fragment.sourceRange.to <= previousSpan.to);
    const nextFragment = fragments.find((fragment) => fragment.sourceRange.from >= nextSpan.from);
    if (previousFragment === undefined || nextFragment === undefined) continue;

    const lineHeight = previousFragment.rect.height;
    const availableGap = nextFragment.rect.y - (previousFragment.rect.y + lineHeight);
    if (availableGap + 0.5 < blankLineCount * lineHeight) continue;

    for (let blankLineIndex = 0; blankLineIndex < blankLineCount; blankLineIndex += 1) {
      const sourceOffset = (newlineOffsets[blankLineIndex] ?? previousSpan.to) + 1;
      virtualFragments.push(
        createVirtualLineBreakFragment(previousFragment, sourceOffset, blankLineIndex + 1),
      );
    }
  }

  const lastSpan = blockSpans.at(-1);
  const lastFragment = fragments.at(-1);
  if (lastSpan !== undefined && lastFragment !== undefined) {
    const trailingNewlineOffsets = newlineOffsetsInRange(markdown, lastSpan.to, markdown.length);
    trailingNewlineOffsets.forEach((newlineOffset, index) => {
      virtualFragments.push(
        createVirtualLineBreakFragment(lastFragment, newlineOffset + 1, index + 1),
      );
    });
  }

  return [...fragments, ...virtualFragments].sort(compareEditableFragments);
}

function createVirtualLineBreakFragment(
  previousFragment: EditableFragment,
  sourceOffset: number,
  lineDelta: number,
): EditableFragment {
  return {
    blockId: `${previousFragment.blockId}:newline:${sourceOffset}`,
    blockIndex: previousFragment.blockIndex,
    lineIndex: -sourceOffset,
    fragmentIndex: 0,
    text: "",
    font: previousFragment.font,
    type: "text",
    sourceRange: {
      from: sourceOffset,
      to: sourceOffset,
    },
    sourceOffsets: [sourceOffset],
    rect: {
      x: 0,
      y: previousFragment.rect.y + previousFragment.rect.height * lineDelta,
      width: 1,
      height: previousFragment.rect.height,
    },
    textInsetX: 0,
  };
}

function newlineOffsetsInRange(markdown: string, from: number, to: number): number[] {
  const offsets: number[] = [];
  for (let offset = Math.max(0, from); offset < Math.min(markdown.length, to); offset += 1) {
    if (markdown.charCodeAt(offset) === 10) {
      offsets.push(offset);
    }
  }
  return offsets;
}

function compareEditableFragments(left: EditableFragment, right: EditableFragment): number {
  if (left.rect.y !== right.rect.y) return left.rect.y - right.rect.y;
  if (left.rect.x !== right.rect.x) return left.rect.x - right.rect.x;
  if (left.sourceRange.from !== right.sourceRange.from) {
    return left.sourceRange.from - right.sourceRange.from;
  }
  return left.sourceRange.to - right.sourceRange.to;
}

function findBlockSpanForRange(
  blockSpans: readonly BlockSpan[],
  sourceRange: SourceRange,
): BlockSpan | undefined {
  return (
    blockSpans.find((span) => sourceRange.from >= span.from && sourceRange.to <= span.to) ??
    blockSpans.find((span) => sourceRange.from >= span.from && sourceRange.from < span.to)
  );
}

function findSmallestContainingTokenRange(
  blockId: string,
  sourceRange: SourceRange,
  tokenRecords: readonly MarkdownInlineSourceRecord[],
): SourceRange | undefined {
  return tokenRecords
    .filter(
      (token) =>
        token.blockId === blockId &&
        token.source.from <= sourceRange.from &&
        token.source.to >= sourceRange.to,
    )
    .sort(
      (left, right) => left.source.to - left.source.from - (right.source.to - right.source.from),
    )[0]?.source;
}

function findFragmentSource(
  markdown: string,
  renderedText: string,
  from: number,
  blockTo: number,
): number {
  const found = markdown.indexOf(renderedText, from);
  return found >= from && found < blockTo ? found : from;
}

const markerSeparator = String.fromCharCode(0x2060);

function comparableSourceText(renderedText: string): string {
  return renderedText.replaceAll(markerSeparator, "");
}

function findFragmentSourceMapping(
  input: EditableLayoutIndexInput,
  renderedText: string,
  comparableText: string,
  sourceCursor: number,
  layoutCursor: number,
): {
  sourceRange: SourceRange;
  sourceOffsets: readonly number[];
  nextLayoutCursor: number;
} {
  if (input.sourceMap !== undefined) {
    const revealedMatch =
      findRenderedTextInMarkdown(input.sourceMap.markdown, renderedText, layoutCursor) ??
      findRenderedTextInMarkdown(input.sourceMap.markdown, renderedText, 0);
    if (revealedMatch !== null) {
      const sourceOffsets =
        mapRevealedBoundariesToSourceOffsets(input.sourceMap, revealedMatch.boundaries) ??
        revealedMatch.boundaries.map((offset) =>
          mapRevealedOffsetToSource(input.sourceMap!, offset),
        );
      if (sourceOffsets.length > 0) {
        return {
          sourceRange: sourceRangeFromOffsets(sourceOffsets),
          sourceOffsets,
          nextLayoutCursor: revealedMatch.range.to,
        };
      }
    }
  }

  const inlineRecordMatch = findFragmentSourceMappingInInlineRecords(
    input.inlineSources,
    renderedText,
    sourceCursor,
  );
  if (inlineRecordMatch !== null) {
    return {
      ...inlineRecordMatch,
      nextLayoutCursor: layoutCursor,
    };
  }

  const sourceFrom = findFragmentSource(
    input.markdown,
    comparableText,
    sourceCursor,
    input.markdown.length,
  );
  const sourceOffsets = createLinearSourceOffsets(renderedText, sourceFrom);
  return {
    sourceRange: sourceRangeFromOffsets(sourceOffsets),
    sourceOffsets,
    nextLayoutCursor: layoutCursor,
  };
}

function findFragmentSourceMappingInInlineRecords(
  records: readonly MarkdownInlineSourceRecord[],
  renderedText: string,
  sourceCursor: number,
): {
  sourceRange: SourceRange;
  sourceOffsets: readonly number[];
} | null {
  if (renderedText.length === 0) return null;
  const orderedRecords = records
    .filter(
      (record) =>
        (record.type === "text" || record.type === "html") &&
        record.renderedText.length > 0 &&
        record.source.to >= sourceCursor,
    )
    .sort(
      (left, right) => left.source.from - right.source.from || left.source.to - right.source.to,
    );

  for (let startIndex = 0; startIndex < orderedRecords.length; startIndex += 1) {
    let text = "";
    const sourceOffsets: number[] = [];

    for (let index = startIndex; index < orderedRecords.length; index += 1) {
      const record = orderedRecords[index]!;
      if (text.length > 0 && record.source.from < sourceOffsets.at(-1)!) {
        break;
      }

      text += record.renderedText;
      appendSourceOffsets(sourceOffsets, sourceOffsetsForInlineRecord(record));
      if (!renderedText.startsWith(text)) {
        break;
      }
      if (text === renderedText) {
        return {
          sourceRange: sourceRangeFromOffsets(sourceOffsets),
          sourceOffsets,
        };
      }
    }
  }

  return null;
}

function sourceOffsetsForInlineRecord(record: MarkdownInlineSourceRecord): readonly number[] {
  if (record.renderedText.length === record.source.to - record.source.from) {
    return createLinearSourceOffsets(record.renderedText, record.source.from);
  }

  const offsets: number[] = [];
  for (let index = 0; index <= record.renderedText.length; index += 1) {
    const ratio = record.renderedText.length === 0 ? 0 : index / record.renderedText.length;
    offsets.push(Math.round(record.source.from + (record.source.to - record.source.from) * ratio));
  }
  return offsets;
}

function appendSourceOffsets(target: number[], next: readonly number[]): void {
  if (next.length === 0) return;
  if (target.length === 0) {
    target.push(...next);
    return;
  }
  target.push(...next.slice(1));
}

function findRenderedTextInMarkdown(
  markdown: string,
  renderedText: string,
  from: number,
): { range: SourceRange; boundaries: readonly number[] } | null {
  if (renderedText.length === 0) return null;

  for (let start = Math.max(0, from); start < markdown.length; start += 1) {
    let rawOffset = start;
    let renderedOffset = 0;
    const boundaries = [start];
    while (rawOffset < markdown.length && renderedOffset < renderedText.length) {
      const rawChar = markdown[rawOffset];
      if (rawChar === markerSeparator) {
        rawOffset += markerSeparator.length;
        continue;
      }

      const nextRawOffset =
        rawChar === "\\" && rawOffset + 1 < markdown.length ? rawOffset + 2 : rawOffset + 1;
      const renderedChar =
        rawChar === "\\" && rawOffset + 1 < markdown.length ? markdown[rawOffset + 1] : rawChar;
      if (renderedChar !== renderedText[renderedOffset]) {
        break;
      }
      rawOffset = nextRawOffset;
      renderedOffset += 1;
      boundaries.push(rawOffset);
    }

    if (renderedOffset === renderedText.length) {
      return {
        range: {
          from: start,
          to: rawOffset,
        },
        boundaries,
      };
    }
  }

  return null;
}

function mapRevealedBoundariesToSourceOffsets(
  sourceMap: EditableLayoutSourceMap,
  boundaries: readonly number[],
): readonly number[] | null {
  const runs = sourceMap.runs;
  if (runs === undefined || boundaries.length === 0) {
    return null;
  }

  const offsets: number[] = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index]!;
    const mapped = mapRevealedBoundaryToSourceOffset(runs, boundary, index === 0 ? "start" : "end");
    if (mapped === null) {
      return null;
    }
    offsets.push(mapped);
  }
  return offsets;
}

function mapRevealedBoundaryToSourceOffset(
  runs: readonly EditableLayoutSourceMapRun[],
  boundary: number,
  side: "start" | "end",
): number | null {
  let previous: EditableLayoutSourceMapRun | null = null;
  let next: EditableLayoutSourceMapRun | null = null;
  const exactOffsets: number[] = [];

  for (const run of runs) {
    const exactIndex = run.revealedOffsets.indexOf(boundary);
    if (exactIndex >= 0) {
      const sourceOffset = run.sourceOffsets[exactIndex];
      if (sourceOffset !== undefined) {
        exactOffsets.push(sourceOffset);
      }
      continue;
    }

    if (boundary > run.revealedFrom && boundary < run.revealedTo) {
      return interpolateRunBoundary(run, boundary);
    }

    if (run.revealedTo <= boundary) {
      previous = run;
    }
    if (next === null && run.revealedFrom >= boundary) {
      next = run;
    }
  }

  if (exactOffsets.length > 0) {
    return side === "start" ? Math.min(...exactOffsets) : Math.max(...exactOffsets);
  }

  if (side === "end" && previous !== null) {
    return previous.sourceOffsets.at(-1) ?? null;
  }
  if (next !== null) {
    return next.sourceOffsets[0] ?? null;
  }
  if (previous !== null) {
    return previous.sourceOffsets.at(-1) ?? null;
  }
  return null;
}

function interpolateRunBoundary(run: EditableLayoutSourceMapRun, boundary: number): number | null {
  for (let index = 1; index < run.revealedOffsets.length; index += 1) {
    const previousRevealed = run.revealedOffsets[index - 1]!;
    const nextRevealed = run.revealedOffsets[index]!;
    if (boundary < previousRevealed || boundary > nextRevealed) continue;
    const previousSource = run.sourceOffsets[index - 1]!;
    const nextSource = run.sourceOffsets[index]!;
    const revealedLength = nextRevealed - previousRevealed;
    if (revealedLength <= 0) return previousSource;
    const ratio = (boundary - previousRevealed) / revealedLength;
    return Math.round(previousSource + (nextSource - previousSource) * ratio);
  }
  return null;
}

function mapRevealedOffsetToSource(sourceMap: EditableLayoutSourceMap, offset: number): number {
  let previous: EditableLayoutSourceMapSegment | null = null;
  let next: EditableLayoutSourceMapSegment | null = null;
  for (const segment of sourceMap.segments) {
    if (offset >= segment.revealedFrom && offset <= segment.revealedTo) {
      return mapSegmentOffset(segment, offset, "start");
    }
    if (segment.revealedTo <= offset) {
      previous = segment;
    }
    if (next === null && segment.revealedFrom >= offset) {
      next = segment;
    }
  }

  if (previous !== null) {
    return previous.sourceTo;
  }
  if (next !== null) {
    return next.sourceFrom;
  }
  return 0;
}

function createLinearSourceOffsets(renderedText: string, sourceFrom: number): readonly number[] {
  const offsets = [sourceFrom];
  let sourceOffset = sourceFrom;
  for (let index = 0; index < renderedText.length; index += 1) {
    if (renderedText[index] !== markerSeparator) {
      sourceOffset += 1;
    }
    offsets.push(sourceOffset);
  }
  return offsets;
}

function sourceRangeFromOffsets(offsets: readonly number[]): SourceRange {
  if (offsets.length === 0) {
    return {
      from: 0,
      to: 0,
    };
  }
  return {
    from: Math.min(...offsets),
    to: Math.max(...offsets),
  };
}

function mapSegmentOffset(
  segment: EditableLayoutSourceMapSegment,
  offset: number,
  side: "start" | "end",
): number {
  const revealedLength = segment.revealedTo - segment.revealedFrom;
  const sourceLength = segment.sourceTo - segment.sourceFrom;
  if (revealedLength <= 0 || sourceLength <= 0) {
    return side === "start" ? segment.sourceFrom : segment.sourceTo;
  }
  const ratio = (offset - segment.revealedFrom) / revealedLength;
  const mapped = segment.sourceFrom + ratio * sourceLength;
  return side === "start" ? Math.floor(mapped) : Math.ceil(mapped);
}

function proportionalWidth(
  fragment: Pick<InlineFragment, "text" | "width"> | EditableFragment,
  textLength: number,
): number {
  if (fragment.text.length === 0) return 0;
  const width = "width" in fragment ? fragment.width : fragment.rect.width;
  return (width * textLength) / fragment.text.length;
}

let cachedMeasurementContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =
  null;

const fragmentBoundaryCache = new WeakMap<EditableFragment, readonly number[]>();

function getMeasurementContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (cachedMeasurementContext !== null) {
    return cachedMeasurementContext;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    cachedMeasurementContext = new OffscreenCanvas(1, 1).getContext("2d");
  } else if (typeof document !== "undefined") {
    cachedMeasurementContext = document.createElement("canvas").getContext("2d");
  }
  if (cachedMeasurementContext === null) {
    throw new Error(
      "No canvas measurement context is available. In Node.js call installNodeCanvas() before using editable layout measurement.",
    );
  }
  return cachedMeasurementContext;
}

function measureTextWidth(text: string, font: string): number {
  if (text.length === 0) return 0;
  const context = getMeasurementContext();
  context.font = font;
  return context.measureText(text).width;
}

function visibleTextWidth(fragment: EditableFragment): number {
  if (fragment.text.includes("\n")) {
    return Math.max(0, fragment.rect.width);
  }
  return Math.max(0, fragment.rect.width - fragment.textInsetX * 2);
}

function textBoundaryXs(fragment: EditableFragment): readonly number[] {
  const cached = fragmentBoundaryCache.get(fragment);
  if (cached !== undefined) {
    return cached;
  }

  if (fragment.text.includes("\n")) {
    const proportionalBoundaries: number[] = [];
    for (let offset = 0; offset <= fragment.text.length; offset += 1) {
      proportionalBoundaries.push(proportionalWidth(fragment, offset));
    }
    fragmentBoundaryCache.set(fragment, proportionalBoundaries);
    return proportionalBoundaries;
  }

  const boundaries = Array.from({ length: fragment.text.length + 1 }, () => 0);
  const renderedTextWidth = visibleTextWidth(fragment);
  const measuredBoundaries = measureGraphemeBoundaryXs(
    fragment.text,
    fragment.font,
    fragment.type === "inline_code" || fragment.type === "code_block"
      ? { whiteSpace: "pre-wrap" }
      : undefined,
  );
  const measuredWidth = measuredBoundaries.at(-1) ?? 0;
  const scale = measuredWidth > 0 ? renderedTextWidth / measuredWidth : 1;
  for (let offset = 0; offset < boundaries.length; offset += 1) {
    boundaries[offset] = (measuredBoundaries[offset] ?? 0) * scale;
  }
  fragmentBoundaryCache.set(fragment, boundaries);
  return boundaries;
}

function textOffsetToLocalX(fragment: EditableFragment, textOffset: number): number {
  const clampedOffset = Math.min(Math.max(textOffset, 0), fragment.text.length);
  const boundaries = textBoundaryXs(fragment);
  return fragment.textInsetX + (boundaries[clampedOffset] ?? 0);
}

function textOffsetToX(fragment: EditableFragment, textOffset: number): number {
  return fragment.rect.x + textOffsetToLocalX(fragment, textOffset);
}

function offsetInsideFragment(fragment: EditableFragment, x: number): number {
  if (fragment.text.length === 0 || fragment.rect.width <= 0) {
    return fragment.sourceRange.from;
  }

  const textStartX = fragment.rect.x + fragment.textInsetX;
  const textEndX = textStartX + visibleTextWidth(fragment);
  const clampedX = Math.min(Math.max(x, textStartX), textEndX);
  const localX = clampedX - textStartX;
  const boundaries = textBoundaryXs(fragment);
  for (const segment of createGraphemeSegments(fragment.text)) {
    const start = boundaries[segment.from] ?? 0;
    const end = boundaries[segment.to] ?? start;
    const middle = (start + end) / 2;
    if (localX <= middle) {
      return sourceOffsetAtTextOffset(fragment, segment.from);
    }
    if (localX <= end) {
      return sourceOffsetAtTextOffset(fragment, segment.to);
    }
  }
  return sourceOffsetAtTextOffset(fragment, fragment.text.length);
}

function caretRectInFragment(
  fragment: EditableFragment,
  offset: number,
  affinity: "before" | "after",
): Rect {
  const clampedOffset = Math.min(
    Math.max(offset, fragment.sourceRange.from),
    fragment.sourceRange.to,
  );
  const delta = textOffsetAtSourceOffset(fragment, clampedOffset, affinity);
  return {
    x: textOffsetToX(fragment, delta),
    y: fragment.rect.y,
    width: 1,
    height: fragment.rect.height,
  };
}

function rectForFragmentRange(fragment: EditableFragment, from: number, to: number): Rect {
  const startDelta = textOffsetAtSourceOffset(fragment, from, "before");
  const endDelta = textOffsetAtSourceOffset(fragment, to, "after");
  const x = textOffsetToX(fragment, startDelta);
  const endX = textOffsetToX(fragment, endDelta);
  return {
    x,
    y: fragment.rect.y,
    width: Math.max(0, endX - x),
    height: fragment.rect.height,
  };
}

function sourceOffsetAtTextOffset(fragment: EditableFragment, textOffset: number): number {
  const clampedOffset = Math.min(Math.max(textOffset, 0), fragment.sourceOffsets.length - 1);
  return fragment.sourceOffsets[clampedOffset] ?? fragment.sourceRange.from;
}

function textOffsetAtSourceOffset(
  fragment: EditableFragment,
  sourceOffset: number,
  affinity: "before" | "after",
): number {
  const offsets = fragment.sourceOffsets;
  if (offsets.length === 0) return 0;
  const exactIndices: number[] = [];
  for (let index = 0; index < offsets.length; index += 1) {
    const current = offsets[index] ?? fragment.sourceRange.from;
    if (current === sourceOffset) {
      exactIndices.push(index);
    }
  }
  if (exactIndices.length > 0) {
    const index = affinity === "before" ? exactIndices.at(-1)! : exactIndices[0]!;
    return snapOffsetToGraphemeBoundary(
      fragment.text,
      index,
      affinity === "before" ? "backward" : "forward",
    );
  }

  for (let index = 0; index < offsets.length; index += 1) {
    const current = offsets[index] ?? fragment.sourceRange.from;
    if (current > sourceOffset) {
      return snapOffsetToGraphemeBoundary(
        fragment.text,
        index,
        affinity === "before" ? "backward" : "forward",
      );
    }
  }
  return offsets.length - 1;
}

function mergeLineRects(rects: readonly Rect[]): Rect[] {
  const merged: Rect[] = [];
  for (const rect of rects) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      Math.abs(previous.y - rect.y) < 0.5 &&
      Math.abs(previous.height - rect.height) < 0.5 &&
      Math.abs(previous.x + previous.width - rect.x) < 0.5
    ) {
      merged[merged.length - 1] = {
        x: previous.x,
        y: previous.y,
        width: previous.width + rect.width,
        height: Math.max(previous.height, rect.height),
      };
    } else {
      merged.push(rect);
    }
  }
  return merged;
}

function nearestFragmentOnLine(
  fragments: readonly EditableFragment[],
  x: number,
): EditableFragment {
  return fragments.reduce((best, candidate) => {
    const bestDistance = distanceToRectX(best.rect, x);
    const candidateDistance = distanceToRectX(candidate.rect, x);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function closestFragment(
  fragments: readonly EditableFragment[],
  x: number,
  y: number,
): EditableFragment | null {
  if (fragments.length === 0) return null;
  return fragments.reduce((best, candidate) => {
    const bestDistance = distanceToRect(best.rect, x, y);
    const candidateDistance = distanceToRect(candidate.rect, x, y);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function distanceToRectX(rect: Rect, x: number): number {
  if (x < rect.x) return rect.x - x;
  if (x > rect.x + rect.width) return x - (rect.x + rect.width);
  return 0;
}

function distanceToRect(rect: Rect, x: number, y: number): number {
  const dx = distanceToRectX(rect, x);
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - (rect.y + rect.height) : 0;
  return Math.hypot(dx, dy);
}
