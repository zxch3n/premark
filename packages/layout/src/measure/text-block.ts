import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import type { TextLine } from '../types.js'
import type { ResolvedFonts } from '../font-theme.js'

/**
 * Measure a plain text block (paragraph or heading with no inline formatting).
 * Returns TextLine[] with single fragment per line.
 */
export function measureTextBlock(
  text: string,
  font: string,
  lineHeight: number,
  maxWidth: number,
  blockIndex: number,
  x: number = 0,
): TextLine[] {
  if (!text || text.trim() === '') {
    return [
      {
        kind: 'text',
        index: 0,
        blockIndex,
        lineIndexInBlock: 0,
        y: 0,
        height: lineHeight,
        width: 0,
        x,
        fragments: [],
      },
    ]
  }

  const prepared = prepareWithSegments(text, font)
  const effectiveWidth = maxWidth - x
  const result = layoutWithLines(prepared, effectiveWidth, lineHeight)

  return result.lines.map((line, i) => ({
    kind: 'text' as const,
    index: 0, // will be assigned by engine
    blockIndex,
    lineIndexInBlock: i,
    y: 0, // will be assigned by engine
    height: lineHeight,
    width: line.width,
    x,
    fragments: [
      {
        text: line.text,
        x: 0,
        width: line.width,
        font,
        type: 'text' as const,
        meta: undefined,
      },
    ],
  }))
}

/**
 * Get the font for a heading level.
 */
export function getHeadingFont(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  fonts: ResolvedFonts,
): string {
  const key = `heading${level}` as keyof ResolvedFonts
  return fonts[key] as string
}

/**
 * Get the line height for a heading level.
 * Headings use a tighter line height than body text.
 */
export function getHeadingLineHeight(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  baseFontSize: number,
): number {
  const scales: Record<number, number> = {
    1: 2.0,
    2: 1.5,
    3: 1.25,
    4: 1.0,
    5: 0.875,
    6: 0.85,
  }
  const fontSize = Math.round(baseFontSize * scales[level] * 100) / 100
  // Headings use 1.25 line-height ratio
  return Math.round(fontSize * 1.25 * 100) / 100
}
