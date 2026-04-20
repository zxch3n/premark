import type { DocumentLayout, InlineFragment } from "@pretext-md/layout";
import type { BlockSpan, MarkdownInlineSourceRecord, SourceRange } from "@pretext-md/parser";
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
}

export class EditableLayoutIndex {
  readonly markdown: string;
  readonly blockSpans: readonly BlockSpan[];
  readonly fragments: readonly EditableFragment[];

  constructor(input: EditableLayoutIndexInput) {
    this.markdown = input.markdown;
    this.blockSpans = input.blockSpans;
    this.fragments = buildEditableFragments(input);
  }

  hitTest(x: number, y: number): HitTestResult {
    const lineFragments = this.fragments.filter(
      (fragment) => y >= fragment.rect.y && y <= fragment.rect.y + fragment.rect.height,
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
    const containing = this.fragments.find(
      (fragment) => offset >= fragment.sourceRange.from && offset <= fragment.sourceRange.to,
    );

    if (containing !== undefined) {
      return {
        offset,
        rect: caretRectInFragment(containing, offset),
        fragment: containing,
      };
    }

    const before = [...this.fragments]
      .reverse()
      .find((fragment) => fragment.sourceRange.to <= offset);
    const after = this.fragments.find((fragment) => fragment.sourceRange.from >= offset);
    const fallback = affinity === "before" ? (before ?? after) : (after ?? before);

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
      rect: caretRectInFragment(fallback, targetOffset),
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

function buildEditableFragments(input: EditableLayoutIndexInput): EditableFragment[] {
  const tokenRecords = input.inlineSources.filter(
    (record) => record.type === "strong" || record.type === "code-span" || record.type === "link",
  );
  const output: EditableFragment[] = [];
  let sourceCursor = 0;

  for (const line of input.layout.lines) {
    if (line.kind === "opaque" && line.content.type === "code_block") {
      if (line.content.code.length === 0) continue;
      const sourceFrom = findFragmentSource(
        input.markdown,
        line.content.code,
        sourceCursor,
        input.markdown.length,
      );
      const sourceRange = {
        from: sourceFrom,
        to: sourceFrom + line.content.code.length,
      };
      const blockSpan = findBlockSpanForRange(input.blockSpans, sourceRange);
      if (blockSpan === undefined) continue;
      output.push({
        blockId: blockSpan.id,
        blockIndex: line.blockIndex,
        lineIndex: line.index,
        fragmentIndex: 0,
        text: line.content.code,
        font: line.content.font,
        type: "code_block",
        sourceRange,
        rect: {
          x: line.x + line.content.padding.left,
          y: line.y + line.content.padding.top,
          width: Math.max(1, line.width - line.content.padding.left - line.content.padding.right),
          height: Math.max(
            line.content.lineHeight,
            line.height - line.content.padding.top - line.content.padding.bottom,
          ),
        },
        textInsetX: 0,
      });
      sourceCursor = Math.max(sourceRange.to, blockSpan.to);
      continue;
    }

    if (line.kind !== "text") continue;

    line.fragments.forEach((fragment, fragmentIndex) => {
      if (fragment.text.length === 0) return;
      const sourceFrom = findFragmentSource(
        input.markdown,
        fragment.text,
        sourceCursor,
        input.markdown.length,
      );
      const sourceRange = {
        from: sourceFrom,
        to: sourceFrom + fragment.text.length,
      };
      const blockSpan = findBlockSpanForRange(input.blockSpans, sourceRange);
      if (blockSpan === undefined) {
        sourceCursor = sourceRange.to;
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
    });
  }

  return output;
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
  if (fragment.type === "code_block" || fragment.text.includes("\n")) {
    return Math.max(0, fragment.rect.width);
  }
  return Math.max(0, fragment.rect.width - fragment.textInsetX * 2);
}

function textBoundaryXs(fragment: EditableFragment): readonly number[] {
  const cached = fragmentBoundaryCache.get(fragment);
  if (cached !== undefined) {
    return cached;
  }

  const boundaries: number[] = [];
  if (fragment.type === "code_block" || fragment.text.includes("\n")) {
    for (let offset = 0; offset <= fragment.text.length; offset += 1) {
      boundaries.push(proportionalWidth(fragment, offset));
    }
    fragmentBoundaryCache.set(fragment, boundaries);
    return boundaries;
  }

  const fullMeasuredWidth = measureTextWidth(fragment.text, fragment.font);
  const renderedTextWidth = visibleTextWidth(fragment);
  const scale = fullMeasuredWidth > 0 ? renderedTextWidth / fullMeasuredWidth : 1;
  for (let offset = 0; offset <= fragment.text.length; offset += 1) {
    boundaries.push(measureTextWidth(fragment.text.slice(0, offset), fragment.font) * scale);
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
  let delta = fragment.text.length;
  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1] ?? 0;
    const next = boundaries[index] ?? previous;
    if (localX <= (previous + next) / 2) {
      delta = index - 1;
      break;
    }
  }
  return Math.min(fragment.sourceRange.to, fragment.sourceRange.from + delta);
}

function caretRectInFragment(fragment: EditableFragment, offset: number): Rect {
  const clampedOffset = Math.min(
    Math.max(offset, fragment.sourceRange.from),
    fragment.sourceRange.to,
  );
  const delta = clampedOffset - fragment.sourceRange.from;
  return {
    x: textOffsetToX(fragment, delta),
    y: fragment.rect.y,
    width: 1,
    height: fragment.rect.height,
  };
}

function rectForFragmentRange(fragment: EditableFragment, from: number, to: number): Rect {
  const startDelta = from - fragment.sourceRange.from;
  const endDelta = to - fragment.sourceRange.from;
  const x = textOffsetToX(fragment, startDelta);
  const endX = textOffsetToX(fragment, endDelta);
  return {
    x,
    y: fragment.rect.y,
    width: Math.max(0, endX - x),
    height: fragment.rect.height,
  };
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
