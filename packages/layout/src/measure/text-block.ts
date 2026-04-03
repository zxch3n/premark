import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

import type { FragmentMeta, FragmentType, TextLine } from "../types.ts";

export interface PreparedTextBlock {
  font: string;
  lineHeight: number;
  prepared: PreparedTextWithSegments;
  fragmentType: FragmentType;
  fragmentMeta?: FragmentMeta;
}

export interface LayoutTextBlockOptions {
  blockIndex: number;
  startLineIndex: number;
  x: number;
  y: number;
  maxWidth: number;
}

export function prepareTextBlock(
  text: string,
  font: string,
  lineHeight: number,
  fragmentType: FragmentType,
  fragmentMeta?: FragmentMeta,
): PreparedTextBlock {
  return {
    font,
    lineHeight,
    prepared: prepareWithSegments(text, font),
    fragmentType,
    fragmentMeta,
  };
}

export function layoutTextBlock(
  preparedBlock: PreparedTextBlock,
  options: LayoutTextBlockOptions,
): {
  lines: TextLine[];
  height: number;
  width: number;
} {
  const result = layoutWithLines(
    preparedBlock.prepared,
    Math.max(options.maxWidth, 1),
    preparedBlock.lineHeight,
  );
  const lines =
    result.lines.length > 0
      ? result.lines
      : [
          {
            start: { segmentIndex: 0, graphemeIndex: 0 },
            end: { segmentIndex: 0, graphemeIndex: 0 },
            text: "",
            width: 0,
          },
        ];

  const mapped = lines.map<TextLine>((line, lineIndex) => ({
    kind: "text",
    index: options.startLineIndex + lineIndex,
    blockIndex: options.blockIndex,
    lineIndexInBlock: lineIndex,
    x: options.x,
    y: options.y + lineIndex * preparedBlock.lineHeight,
    height: preparedBlock.lineHeight,
    width: line.width,
    fragments: [
      {
        text: line.text,
        x: 0,
        width: line.width,
        font: preparedBlock.font,
        type: preparedBlock.fragmentType,
        meta: preparedBlock.fragmentMeta,
      },
    ],
  }));

  return {
    lines: mapped,
    height: mapped.length * preparedBlock.lineHeight,
    width: Math.max(0, ...mapped.map((line) => line.width)),
  };
}
