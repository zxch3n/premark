import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import type { InlineNode } from 'markdown-parser'
import type {
  OpaqueLine,
  TableContent,
  TableCell,
  InlineFragment,
} from '../types.js'
import type { ResolvedFonts, SpacingConfig } from '../font-theme.js'
import { measureRichText } from './rich-text.js'

/**
 * Measure a table and produce an OpaqueLine.
 */
export function measureTable(
  head: { cells: { align: 'left' | 'right' | 'center' | undefined; children: InlineNode[] }[] },
  body: { rows: { cells: { align: 'left' | 'right' | 'center' | undefined; children: InlineNode[] }[] }[] },
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  maxWidth: number,
  blockIndex: number,
): OpaqueLine {
  const cellPad = spacing.tableCellPadding
  const columnCount = head.cells.length
  const alignments = head.cells.map((c) => c.align ?? null)

  // Equal column widths (simple strategy)
  const totalPadding = cellPad.x * 2 * columnCount
  const borderWidth = columnCount + 1 // 1px borders
  const availableWidth = maxWidth - totalPadding - borderWidth
  const colWidth = Math.max(40, Math.floor(availableWidth / columnCount))
  const columnWidths = new Array(columnCount).fill(colWidth)

  const bodyFont = fonts.body
  const bodyBoldFont = fonts.bodyBold
  const lineHeight = fonts.bodyLineHeight

  // Measure header cells
  const headerCells: TableCell[] = head.cells.map((cell) => {
    const lines = measureRichText(
      cell.children,
      fonts,
      spacing,
      bodyBoldFont,
      lineHeight,
      colWidth,
      blockIndex,
    )
    const height = lines.reduce((h, l) => h + l.height, 0)
    const fragments = lines.flatMap((l) => l.fragments)
    return {
      fragments,
      width: colWidth,
    }
  })

  // Measure body rows
  const bodyRows: TableCell[][] = body.rows.map((row) =>
    row.cells.map((cell) => {
      const lines = measureRichText(
        cell.children,
        fonts,
        spacing,
        bodyFont,
        lineHeight,
        colWidth,
        blockIndex,
      )
      const fragments = lines.flatMap((l) => l.fragments)
      return {
        fragments,
        width: colWidth,
      }
    }),
  )

  // Calculate row heights
  const headerHeight = lineHeight + cellPad.y * 2
  const rowHeights: number[] = body.rows.map((row) => {
    let maxH = lineHeight
    row.cells.forEach((cell) => {
      const lines = measureRichText(
        cell.children,
        fonts,
        spacing,
        bodyFont,
        lineHeight,
        colWidth,
        blockIndex,
      )
      const h = lines.length * lineHeight
      if (h > maxH) maxH = h
    })
    return maxH + cellPad.y * 2
  })

  const totalHeight =
    headerHeight + rowHeights.reduce((s, h) => s + h, 0) + (body.rows.length + 2) // borders

  const content: TableContent = {
    type: 'table',
    header: headerCells,
    rows: bodyRows,
    alignments,
    columnWidths,
    rowCount: body.rows.length,
    rowHeights,
    font: bodyFont,
  }

  return {
    kind: 'opaque',
    index: 0,
    blockIndex,
    lineIndexInBlock: 0,
    y: 0,
    height: totalHeight,
    width: maxWidth,
    x: 0,
    content,
  }
}
