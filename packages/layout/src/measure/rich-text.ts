import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import type { MarkdownInline, SourceRange } from "@pretext-md/parser";

import type {
  FragmentMeta,
  FragmentType,
  InlineFragment,
  ResolvedFonts,
  TextLine,
} from "../types.ts";

import { measureTextWidth } from "../measurement-context.ts";
import type { ListPrefix } from "./list.ts";

const LINE_START_CURSOR: LayoutCursor = {
  segmentIndex: 0,
  graphemeIndex: 0,
};
const UNBOUNDED_WIDTH = 100_000;
const collapsedSpaceWidthCache = new Map<string, number>();

interface StyleState {
  strong: boolean;
  emphasis: boolean;
  strikethrough: boolean;
  link?: {
    href: string;
    title?: string;
  };
}

interface TextSpec {
  kind: "text";
  text: string;
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
  chromeWidth: number;
  collapseOuterWhitespace: boolean;
  preserveWhitespace: boolean;
  sourceOffsets?: readonly number[];
}

interface BreakSpec {
  kind: "break";
}

type InlineSpec = TextSpec | BreakSpec;

interface PreparedTextItem {
  kind: "text";
  prepared: PreparedTextWithSegments;
  endCursor: LayoutCursor;
  fullText: string;
  fullWidth: number;
  leadingGap: number;
  chromeWidth: number;
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
  sourceOffsets?: readonly number[];
}

interface PreparedBreakItem {
  kind: "break";
}

type PreparedInlineItem = PreparedTextItem | PreparedBreakItem;

export interface PreparedRichText {
  lineHeight: number;
  items: PreparedInlineItem[];
  intrinsicWidth: number;
  prefix?: ListPrefix;
  hangingIndent: number;
}

export interface PrepareRichTextOptions {
  nodes: readonly MarkdownInline[];
  fonts: ResolvedFonts;
  baseFont: string;
  lineHeight: number;
  lineBreakMode?: "markdown" | "source";
  sourceOffsetBase?: number;
  prefix?: ListPrefix;
}

function getFontForStyle(
  style: StyleState,
  fonts: ResolvedFonts,
  baseFont: string,
): {
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
} {
  if (style.link !== undefined) {
    return {
      font:
        style.strong && style.emphasis
          ? fonts.bodyBoldItalic
          : style.strong
            ? fonts.bodyBold
            : style.emphasis
              ? fonts.bodyItalic
              : baseFont,
      type: "link",
      meta: {
        type: "link",
        href: style.link.href,
        title: style.link.title,
      },
    };
  }

  if (style.strikethrough) {
    return {
      font:
        style.strong && style.emphasis
          ? fonts.bodyBoldItalic
          : style.strong
            ? fonts.bodyBold
            : style.emphasis
              ? fonts.bodyItalic
              : baseFont,
      type: "strikethrough",
    };
  }

  if (style.strong && style.emphasis) {
    return {
      font: fonts.bodyBoldItalic,
      type: "strong_emphasis",
    };
  }

  if (style.strong) {
    return {
      font: fonts.bodyBold,
      type: "strong",
    };
  }

  if (style.emphasis) {
    return {
      font: fonts.bodyItalic,
      type: "emphasis",
    };
  }

  return {
    font: baseFont,
    type: "text",
  };
}

function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font);
  if (cached !== undefined) {
    return cached;
  }

  const joinedWidth = measureTextWidth("A A", font);
  const compactWidth = measureTextWidth("AA", font);
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth);
  collapsedSpaceWidthCache.set(font, collapsedWidth);
  return collapsedWidth;
}

function metasEqual(left: FragmentMeta | undefined, right: FragmentMeta | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (left === undefined || right === undefined) {
    return false;
  }

  return left.type === right.type && left.href === right.href && left.title === right.title;
}

function pushTextSpec(target: InlineSpec[], spec: Omit<TextSpec, "kind">): void {
  if (spec.text.length === 0) {
    return;
  }

  const previous = target.at(-1);
  if (
    previous?.kind === "text" &&
    previous.font === spec.font &&
    previous.type === spec.type &&
    previous.chromeWidth === spec.chromeWidth &&
    previous.collapseOuterWhitespace === spec.collapseOuterWhitespace &&
    previous.preserveWhitespace === spec.preserveWhitespace &&
    sourceOffsetsCanMerge(previous.sourceOffsets, spec.sourceOffsets) &&
    metasEqual(previous.meta, spec.meta)
  ) {
    previous.text += spec.text;
    previous.sourceOffsets = appendMergedSourceOffsets(previous.sourceOffsets, spec.sourceOffsets);
    return;
  }

  target.push({
    kind: "text",
    ...spec,
  });
}

function collectInlineSpecs(
  target: InlineSpec[],
  nodes: readonly MarkdownInline[],
  fonts: ResolvedFonts,
  baseFont: string,
  state: StyleState,
  lineBreakMode: "markdown" | "source",
  sourceOffsetBase: number,
): void {
  const sourceMode = lineBreakMode === "source";
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushTextSpec(target, {
          text: node.text,
          font: style.font,
          type: style.type,
          meta: style.meta,
          chromeWidth: 0,
          collapseOuterWhitespace: !sourceMode,
          preserveWhitespace: sourceMode,
          sourceOffsets: sourceMode
            ? sourceOffsetsForText(node.text, node.source, sourceOffsetBase)
            : undefined,
        });
        break;
      }
      case "code-span":
        pushTextSpec(target, {
          text: node.text,
          font: fonts.inlineCode,
          type: "inline_code",
          chromeWidth: 12,
          collapseOuterWhitespace: false,
          preserveWhitespace: true,
          sourceOffsets: sourceMode
            ? sourceOffsetsForText(node.text, node.source, sourceOffsetBase)
            : undefined,
        });
        break;
      case "softbreak": {
        if (lineBreakMode === "source") {
          target.push({ kind: "break" });
          break;
        }
        const style = getFontForStyle(state, fonts, baseFont);
        pushTextSpec(target, {
          text: " ",
          font: style.font,
          type: style.type,
          meta: style.meta,
          chromeWidth: 0,
          collapseOuterWhitespace: true,
          preserveWhitespace: false,
          sourceOffsets: undefined,
        });
        break;
      }
      case "hardbreak":
        target.push({ kind: "break" });
        break;
      case "strong":
        collectInlineSpecs(
          target,
          node.children,
          fonts,
          baseFont,
          {
            ...state,
            strong: true,
          },
          lineBreakMode,
          sourceOffsetBase,
        );
        break;
      case "emphasis":
        collectInlineSpecs(
          target,
          node.children,
          fonts,
          baseFont,
          {
            ...state,
            emphasis: true,
          },
          lineBreakMode,
          sourceOffsetBase,
        );
        break;
      case "strikethrough":
        collectInlineSpecs(
          target,
          node.children,
          fonts,
          baseFont,
          {
            ...state,
            strikethrough: true,
          },
          lineBreakMode,
          sourceOffsetBase,
        );
        break;
      case "link":
        collectInlineSpecs(
          target,
          node.children,
          fonts,
          baseFont,
          {
            ...state,
            link: {
              href: node.href,
              title: node.title,
            },
          },
          lineBreakMode,
          sourceOffsetBase,
        );
        break;
      case "image": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushTextSpec(target, {
          text: `[${node.href}]`,
          font: style.font,
          type: style.type,
          meta: style.meta,
          chromeWidth: 0,
          collapseOuterWhitespace: false,
          preserveWhitespace: true,
        });
        break;
      }
      case "html": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushTextSpec(target, {
          text: node.content,
          font: style.font,
          type: style.type,
          meta: style.meta,
          chromeWidth: 0,
          collapseOuterWhitespace: !sourceMode,
          preserveWhitespace: sourceMode,
          sourceOffsets: sourceMode
            ? sourceOffsetsForText(node.content, node.source, sourceOffsetBase)
            : undefined,
        });
        break;
      }
    }
  }
}

function prepareInlineItems(specs: readonly InlineSpec[]): PreparedInlineItem[] {
  const items: PreparedInlineItem[] = [];
  let pendingGap = 0;

  for (const spec of specs) {
    if (spec.kind === "break") {
      items.push({ kind: "break" });
      pendingGap = 0;
      continue;
    }

    let text = spec.text;
    let leadingGap = pendingGap;
    let sourceOffsets = spec.sourceOffsets;

    if (spec.collapseOuterWhitespace) {
      const hasLeadingWhitespace = /^\s/u.test(text);
      const hasTrailingWhitespace = /\s$/u.test(text);
      const collapsedWidth = measureCollapsedSpaceWidth(spec.font);
      const trimStart = text.length - text.trimStart().length;
      const trimEnd = text.trimEnd().length;
      const trimmed = text.slice(trimStart, trimEnd);

      if (leadingGap === 0 && hasLeadingWhitespace) {
        leadingGap = collapsedWidth;
      }
      pendingGap = hasTrailingWhitespace ? collapsedWidth : 0;
      text = trimmed;
      sourceOffsets = sourceOffsets?.slice(trimStart, trimEnd + 1);
    } else {
      pendingGap = 0;
    }

    if (text.length === 0) {
      continue;
    }

    const prepared = prepareWithSegments(
      text,
      spec.font,
      spec.preserveWhitespace || spec.chromeWidth > 0 ? { whiteSpace: "pre-wrap" } : undefined,
    );
    const fullLine = layoutNextLine(prepared, LINE_START_CURSOR, UNBOUNDED_WIDTH);
    if (fullLine === null) {
      continue;
    }

    items.push({
      kind: "text",
      prepared,
      endCursor: fullLine.end,
      fullText: fullLine.text,
      fullWidth: measureTextWidth(fullLine.text, spec.font),
      leadingGap,
      chromeWidth: spec.chromeWidth,
      font: spec.font,
      type: spec.type,
      meta: spec.meta,
      sourceOffsets:
        sourceOffsets !== undefined && sourceOffsets.length === fullLine.text.length + 1
          ? sourceOffsets
          : undefined,
    });
  }

  return items;
}

function cursorsMatch(left: LayoutCursor, right: LayoutCursor): boolean {
  return left.segmentIndex === right.segmentIndex && left.graphemeIndex === right.graphemeIndex;
}

function canMergeFragments(previous: InlineFragment | undefined, next: InlineFragment): boolean {
  if (previous === undefined) {
    return false;
  }

  return (
    previous.type === next.type &&
    previous.font === next.font &&
    metasEqual(previous.meta, next.meta) &&
    previous.x + previous.width === next.x
  );
}

function measureIntrinsicWidth(items: readonly PreparedInlineItem[]): number {
  let maxWidth = 0;
  let lineWidth = 0;
  let hasContent = false;

  for (const item of items) {
    if (item.kind === "break") {
      maxWidth = Math.max(maxWidth, lineWidth);
      lineWidth = 0;
      hasContent = false;
      continue;
    }

    lineWidth += (hasContent ? item.leadingGap : 0) + item.fullWidth + item.chromeWidth;
    hasContent = true;
  }

  return Math.max(maxWidth, lineWidth);
}

export function prepareRichText(options: PrepareRichTextOptions): PreparedRichText {
  const specs: InlineSpec[] = [];
  collectInlineSpecs(
    specs,
    options.nodes,
    options.fonts,
    options.baseFont,
    {
      strong: false,
      emphasis: false,
      strikethrough: false,
    },
    options.lineBreakMode ?? "markdown",
    options.sourceOffsetBase ?? 0,
  );
  const items = prepareInlineItems(specs);

  return {
    lineHeight: options.lineHeight,
    items,
    intrinsicWidth: measureIntrinsicWidth(items),
    prefix: options.prefix,
    hangingIndent: options.prefix ? options.prefix.width + options.prefix.gap : 0,
  };
}

export function layoutRichText(
  prepared: PreparedRichText,
  options: {
    blockIndex: number;
    startLineIndex: number;
    x: number;
    y: number;
    maxWidth: number;
  },
): {
  lines: TextLine[];
  height: number;
  width: number;
} {
  const lines: TextLine[] = [];
  let currentFragments: InlineFragment[] = [];
  let lineWidth = 0;
  let contentFragmentCount = 0;
  let lineIndex = 0;
  let maxRight = 0;
  let itemIndex = 0;
  let textCursor: LayoutCursor | null = null;
  let textOffset: number | null = null;

  function lineX(): number {
    return options.x + (lineIndex === 0 ? 0 : prepared.hangingIndent);
  }

  function lineLimit(): number {
    return Math.max(1, options.maxWidth - (lineIndex === 0 ? 0 : prepared.hangingIndent));
  }

  function seedLinePrefix(): void {
    if (lineIndex === 0 && prepared.prefix !== undefined) {
      currentFragments.push({
        text: prepared.prefix.text,
        x: 0,
        width: prepared.prefix.width,
        font: prepared.prefix.font,
        type: "strong",
      });
      lineWidth = prepared.prefix.width + prepared.prefix.gap;
    }
  }

  function commitLine(forceEmpty = false): void {
    if (!forceEmpty && currentFragments.length === 0) {
      return;
    }

    const renderedWidth =
      currentFragments.length === 0
        ? 0
        : Math.max(...currentFragments.map((fragment) => fragment.x + fragment.width));

    lines.push({
      kind: "text",
      index: options.startLineIndex + lines.length,
      blockIndex: options.blockIndex,
      lineIndexInBlock: lines.length,
      x: lineX(),
      y: options.y + lines.length * prepared.lineHeight,
      height: prepared.lineHeight,
      width: renderedWidth,
      fragments: currentFragments,
    });

    maxRight = Math.max(maxRight, lineX() - options.x + renderedWidth);
    lineIndex += 1;
    currentFragments = [];
    lineWidth = 0;
    contentFragmentCount = 0;
  }

  function addFragment(
    item: PreparedTextItem,
    text: string,
    leadingGap: number,
    textFrom: number,
    textTo: number,
  ): void {
    const width = measureTextWidth(text, item.font);
    const sourceOffsets = item.sourceOffsets?.slice(textFrom, textTo + 1);
    const fragment: InlineFragment = {
      text,
      x: lineWidth + leadingGap,
      width: width + item.chromeWidth,
      font: item.font,
      type: item.type,
      meta: item.meta,
      sourceOffsets,
      sourceRange:
        sourceOffsets !== undefined && sourceOffsets.length > 0
          ? sourceRangeFromOffsets(sourceOffsets)
          : undefined,
    };
    const previous = currentFragments.at(-1);
    if (canMergeFragments(previous, fragment)) {
      if (previous !== undefined) {
        const previousWidth = previous.width;
        previous.text += fragment.text;
        previous.width =
          previous.type === "inline_code" || leadingGap > 0
            ? previous.width + fragment.width
            : measureTextWidth(previous.text, previous.font);
        previous.sourceOffsets = appendMergedSourceOffsets(
          previous.sourceOffsets,
          fragment.sourceOffsets,
        );
        previous.sourceRange =
          previous.sourceOffsets !== undefined
            ? sourceRangeFromOffsets(previous.sourceOffsets)
            : undefined;
        lineWidth += leadingGap + previous.width - previousWidth;
      }
    } else {
      currentFragments.push(fragment);
      lineWidth += leadingGap + width + item.chromeWidth;
    }
    contentFragmentCount += 1;
  }

  seedLinePrefix();

  while (itemIndex < prepared.items.length) {
    const item = prepared.items[itemIndex]!;

    if (item.kind === "break") {
      commitLine(contentFragmentCount === 0 && currentFragments.length === 0);
      seedLinePrefix();
      itemIndex += 1;
      textCursor = null;
      textOffset = null;
      continue;
    }

    if (textCursor !== null && cursorsMatch(textCursor, item.endCursor)) {
      itemIndex += 1;
      textCursor = null;
      textOffset = null;
      continue;
    }

    const leadingGap = contentFragmentCount === 0 || textCursor !== null ? 0 : item.leadingGap;
    const remainingWidth = lineLimit() - lineWidth;
    const reservedWidth = leadingGap + item.chromeWidth;

    if (contentFragmentCount > 0 && reservedWidth >= remainingWidth) {
      commitLine(false);
      seedLinePrefix();
      continue;
    }

    if (textCursor === null) {
      const fullWidth = leadingGap + item.fullWidth + item.chromeWidth;
      if (fullWidth <= remainingWidth) {
        addFragment(item, item.fullText, leadingGap, 0, item.fullText.length);
        itemIndex += 1;
        continue;
      }
    }

    const startCursor = textCursor ?? LINE_START_CURSOR;
    const line = layoutNextLine(
      item.prepared,
      startCursor,
      Math.max(1, remainingWidth - reservedWidth),
    );

    if (line === null || cursorsMatch(startCursor, line.end)) {
      if (contentFragmentCount === 0) {
        addFragment(item, item.fullText, leadingGap, 0, item.fullText.length);
        itemIndex += 1;
        continue;
      }

      commitLine(false);
      seedLinePrefix();
      continue;
    }

    const lineTextFrom = textOffset ?? 0;
    const lineTextTo = Math.min(item.fullText.length, lineTextFrom + line.text.length);
    addFragment(item, line.text, leadingGap, lineTextFrom, lineTextTo);

    if (cursorsMatch(line.end, item.endCursor)) {
      itemIndex += 1;
      textCursor = null;
      textOffset = null;
      continue;
    }

    textCursor = line.end;
    textOffset = lineTextTo;
    commitLine(false);
    seedLinePrefix();
  }

  if (currentFragments.length > 0 || lines.length === 0) {
    commitLine(lines.length === 0);
  }

  return {
    lines,
    height: lines.length * prepared.lineHeight,
    width: maxRight,
  };
}

function sourceOffsetsForText(
  text: string,
  source: SourceRange | undefined,
  sourceOffsetBase: number,
): readonly number[] | undefined {
  if (source === undefined) {
    return undefined;
  }

  const sourceFrom = sourceOffsetBase + source.from;
  const sourceTo = sourceOffsetBase + source.to;
  if (text.length === source.to - source.from) {
    return Array.from({ length: text.length + 1 }, (_, index) => sourceFrom + index);
  }

  return Array.from({ length: text.length + 1 }, (_, index) => {
    const ratio = text.length === 0 ? 0 : index / text.length;
    return Math.round(sourceFrom + (sourceTo - sourceFrom) * ratio);
  });
}

function sourceOffsetsCanMerge(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.at(-1) === right[0];
}

function appendMergedSourceOffsets(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): readonly number[] | undefined {
  if (!sourceOffsetsCanMerge(left, right)) {
    return undefined;
  }
  if (left === undefined || right === undefined) return undefined;
  return [...left, ...right.slice(1)];
}

function sourceRangeFromOffsets(offsets: readonly number[]): SourceRange {
  return {
    from: Math.min(...offsets),
    to: Math.max(...offsets),
  };
}
