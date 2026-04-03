import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

import type { OpaqueLine, PrismHighlighter, ResolvedFonts, SpacingConfig } from "../types.ts";

export interface PreparedCodeBlock {
  code: string;
  lang: string;
  prepared: PreparedTextWithSegments;
  font: string;
  lineHeight: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  html?: string;
  tokens?: ReturnType<NonNullable<PrismHighlighter["tokenize"]>>;
}

export function prepareCodeBlock(
  code: string,
  lang: string,
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  highlighter?: PrismHighlighter,
): PreparedCodeBlock {
  const tokens = highlighter?.tokenize(code, lang);
  const html = highlighter?.highlight(code, lang);

  return {
    code,
    lang,
    prepared: prepareWithSegments(code, fonts.code, { whiteSpace: "pre-wrap" }),
    font: fonts.code,
    lineHeight: fonts.lineHeights.code,
    padding: {
      top: spacing.codePaddingY,
      right: spacing.codePaddingX,
      bottom: spacing.codePaddingY,
      left: spacing.codePaddingX,
    },
    tokens,
    html,
  };
}

export function layoutCodeBlock(
  prepared: PreparedCodeBlock,
  options: {
    blockIndex: number;
    lineIndex: number;
    x: number;
    y: number;
    maxWidth: number;
  },
): {
  line: OpaqueLine;
  height: number;
} {
  const textWidth = Math.max(1, options.maxWidth - prepared.padding.left - prepared.padding.right);
  const result = layoutWithLines(prepared.prepared, textWidth, prepared.lineHeight);
  const height = result.height + prepared.padding.top + prepared.padding.bottom;

  return {
    line: {
      kind: "opaque",
      index: options.lineIndex,
      blockIndex: options.blockIndex,
      lineIndexInBlock: 0,
      x: options.x,
      y: options.y,
      height,
      width: options.maxWidth,
      content: {
        type: "code_block",
        code: prepared.code,
        lang: prepared.lang,
        html: prepared.html,
        tokens: prepared.tokens,
        font: prepared.font,
        lineHeight: prepared.lineHeight,
        sourceLineCount: prepared.code.split("\n").length,
        padding: prepared.padding,
      },
    },
    height,
  };
}
