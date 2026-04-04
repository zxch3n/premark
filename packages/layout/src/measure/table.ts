import type { MarkdownInline } from "@pretext-md/parser";

import type { OpaqueLine, ResolvedFonts, SpacingConfig, TableCell } from "../types.ts";

import { layoutRichText, prepareRichText } from "./rich-text.ts";

interface PreparedCell {
  prepared: ReturnType<typeof prepareRichText>;
  plainTextWidth: number;
}

export interface PreparedTableBlock {
  header: PreparedCell[];
  rows: PreparedCell[][];
  alignments: Array<"left" | "center" | "right" | null>;
  fonts: ResolvedFonts;
  spacing: SpacingConfig;
}

function prepareCell(nodes: readonly MarkdownInline[], fonts: ResolvedFonts): PreparedCell {
  const prepared = prepareRichText({
    nodes,
    fonts,
    baseFont: fonts.body,
    lineHeight: fonts.lineHeights.body,
  });

  return {
    prepared,
    plainTextWidth: prepared.intrinsicWidth,
  };
}

function mapCellLayout(
  lines: ReturnType<typeof layoutRichText>["lines"],
  width: number,
  height: number,
): TableCell {
  return {
    fragments: lines.flatMap((line) => line.fragments),
    width,
    height,
    lines: lines.map((line) => ({
      fragments: line.fragments,
      height: line.height,
      width: line.width,
    })),
  };
}

export function prepareTableBlock(
  table: Extract<import("@pretext-md/parser").MarkdownBlock, { type: "table" }>,
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
): PreparedTableBlock {
  return {
    header: table.head.cells.map((cell) => prepareCell(cell.children, fonts)),
    rows: table.body.rows.map((row) => row.cells.map((cell) => prepareCell(cell.children, fonts))),
    alignments: table.head.cells.map((cell) => cell.align ?? null),
    fonts,
    spacing,
  };
}

export function layoutTableBlock(
  prepared: PreparedTableBlock,
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
  const columnCount = Math.max(1, prepared.header.length);
  const contentWidth = options.maxWidth - (columnCount + 1) * prepared.spacing.tableBorderWidth;
  const weightedWidths = prepared.header.map((cell, index) => {
    const bodyWidth = Math.max(
      cell.plainTextWidth,
      ...prepared.rows.map((row) => row[index]?.plainTextWidth ?? 0),
    );
    return Math.max(bodyWidth, 80);
  });
  const totalWeight = weightedWidths.reduce((sum, value) => sum + value, 0);
  const columnWidths = weightedWidths.map((value) =>
    Math.max(80, (value / totalWeight) * contentWidth),
  );

  const renderCell = (cell: PreparedCell, columnWidth: number) => {
    const layout = layoutRichText(cell.prepared, {
      blockIndex: options.blockIndex,
      startLineIndex: 0,
      x: 0,
      y: 0,
      maxWidth: columnWidth - prepared.spacing.tableCellPaddingX * 2,
    });
    const height = layout.height + prepared.spacing.tableCellPaddingY * 2;
    return mapCellLayout(layout.lines, columnWidth, height);
  };

  const header = prepared.header.map((cell, index) => renderCell(cell, columnWidths[index]));
  const rows = prepared.rows.map((row) =>
    row.map((cell, index) => renderCell(cell, columnWidths[index])),
  );
  const rowHeights = [
    Math.max(...header.map((cell) => cell.height ?? 0)),
    ...rows.map((row) => Math.max(...row.map((cell) => cell.height ?? 0))),
  ];
  const height =
    rowHeights.reduce((sum, value) => sum + value, 0) +
    (rowHeights.length + 1) * prepared.spacing.tableBorderWidth;

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
        type: "table",
        header,
        rows,
        alignments: prepared.alignments,
        columnWidths,
        rowCount: rows.length,
        rowHeights,
        font: prepared.fonts.body,
      },
    },
    height,
  };
}
