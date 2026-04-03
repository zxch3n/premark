import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import type { InlineNode } from 'markdown-parser'
import type {
  TextLine,
  InlineFragment,
  FragmentType,
  FragmentMeta,
} from '../types.js'
import type { ResolvedFonts, SpacingConfig } from '../font-theme.js'

/**
 * An inline run: a contiguous piece of text with the same font and style.
 */
interface InlineRun {
  text: string
  font: string
  type: FragmentType
  meta?: FragmentMeta
}

/**
 * Flatten inline nodes into a sequence of styled runs.
 * Handles nested strong/emphasis by tracking style context.
 */
export function flattenInlineNodes(
  nodes: InlineNode[],
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  parentType: FragmentType = 'text',
  isBold = false,
  isItalic = false,
): InlineRun[] {
  const runs: InlineRun[] = []

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        runs.push({
          text: node.text,
          font: getFont(fonts, isBold, isItalic),
          type: parentType,
          meta: undefined,
        })
        break

      case 'strong':
        runs.push(
          ...flattenInlineNodes(
            node.children,
            fonts,
            spacing,
            isBold && isItalic ? 'strong_emphasis' : isItalic ? 'strong_emphasis' : 'strong',
            true,
            isItalic,
          ),
        )
        break

      case 'emphasis':
        runs.push(
          ...flattenInlineNodes(
            node.children,
            fonts,
            spacing,
            isBold ? 'strong_emphasis' : 'emphasis',
            isBold,
            true,
          ),
        )
        break

      case 'code-span':
        runs.push({
          text: node.text,
          font: fonts.inlineCode,
          type: 'inline_code',
          meta: undefined,
        })
        break

      case 'link':
        runs.push(
          ...flattenInlineNodes(
            node.children,
            fonts,
            spacing,
            'link',
            isBold,
            isItalic,
          ).map((run) => ({
            ...run,
            type: 'link' as FragmentType,
            meta: {
              type: 'link' as const,
              href: node.href,
              title: node.title,
            },
          })),
        )
        break

      case 'softbreak':
        // Soft breaks become spaces in normal flow
        runs.push({
          text: ' ',
          font: getFont(fonts, isBold, isItalic),
          type: parentType,
          meta: undefined,
        })
        break

      case 'hardbreak':
        runs.push({
          text: '\n',
          font: getFont(fonts, isBold, isItalic),
          type: parentType,
          meta: undefined,
        })
        break

      case 'image':
        // Images in inline context: render alt text
        runs.push({
          text: node.children.map((c) => ('text' in c ? c.text : '')).join(''),
          font: getFont(fonts, isBold, isItalic),
          type: parentType,
          meta: undefined,
        })
        break

      case 'html':
        // Inline HTML: just use the raw content as text
        runs.push({
          text: node.content,
          font: getFont(fonts, isBold, isItalic),
          type: parentType,
          meta: undefined,
        })
        break
    }
  }

  return runs
}

function getFont(fonts: ResolvedFonts, bold: boolean, italic: boolean): string {
  if (bold && italic) return fonts.bodyBoldItalic
  if (bold) return fonts.bodyBold
  if (italic) return fonts.bodyItalic
  return fonts.body
}

/**
 * Measure rich text (mixed inline formatting) using per-run Pretext measurement
 * and greedy line breaking.
 *
 * Since Pretext doesn't have `prepareInlineFlow`, we implement our own:
 * 1. Flatten inline nodes into styled runs
 * 2. Measure each run's width using prepare()
 * 3. Do greedy line-breaking across runs
 * 4. Build TextLine[] with positioned fragments
 */
export function measureRichText(
  nodes: InlineNode[],
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  font: string,
  lineHeight: number,
  maxWidth: number,
  blockIndex: number,
  x: number = 0,
): TextLine[] {
  const runs = flattenInlineNodes(nodes, fonts, spacing)

  if (runs.length === 0) {
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

  // Check if all runs use the same font — if so, use single prepareWithSegments for accuracy
  const allSameFont = runs.every((r) => r.font === runs[0].font)
  if (allSameFont) {
    return measureSingleFontRichText(runs, lineHeight, maxWidth, blockIndex, x)
  }

  // Mixed font: use greedy line-breaking with per-run measurement
  return measureMixedFontRichText(runs, fonts, spacing, lineHeight, maxWidth, blockIndex, x)
}

/**
 * Fast path: all runs use the same font.
 * Concatenate text, use prepareWithSegments for accurate line breaking.
 */
function measureSingleFontRichText(
  runs: InlineRun[],
  lineHeight: number,
  maxWidth: number,
  blockIndex: number,
  x: number,
): TextLine[] {
  const fullText = runs.map((r) => r.text).join('')
  const theFont = runs[0].font

  const prepared = prepareWithSegments(fullText, theFont)
  const effectiveWidth = maxWidth - x
  const result = layoutWithLines(prepared, effectiveWidth, lineHeight)

  // Map each layout line back to the original runs to build fragments
  const lines: TextLine[] = []
  let runIndex = 0
  let runOffset = 0 // character offset within current run

  for (let i = 0; i < result.lines.length; i++) {
    const layoutLine = result.lines[i]
    const lineText = layoutLine.text
    const fragments: InlineFragment[] = []
    let fragX = 0
    let lineCharIndex = 0

    while (lineCharIndex < lineText.length && runIndex < runs.length) {
      const run = runs[runIndex]
      const remaining = run.text.length - runOffset
      const available = lineText.length - lineCharIndex
      const take = Math.min(remaining, available)
      const fragText = lineText.slice(lineCharIndex, lineCharIndex + take)

      if (fragText.length > 0) {
        // Measure fragment width directly
        const measured = prepareWithSegments(fragText, theFont)
        const measuredLayout = layoutWithLines(measured, 999999, lineHeight)
        const fragWidth =
          measuredLayout.lines.length > 0
            ? measuredLayout.lines[0].width
            : 0

        fragments.push({
          text: fragText,
          x: fragX,
          width: fragWidth,
          font: theFont,
          type: run.type,
          meta: run.meta,
        })
        fragX += fragWidth
      }

      lineCharIndex += take
      runOffset += take

      if (runOffset >= run.text.length) {
        runIndex++
        runOffset = 0
      }
    }

    lines.push({
      kind: 'text',
      index: 0,
      blockIndex,
      lineIndexInBlock: i,
      y: 0,
      height: lineHeight,
      width: layoutLine.width,
      x,
      fragments,
    })
  }

  return lines
}

/**
 * Measure mixed-font rich text using greedy line-breaking.
 * Each run is measured with its own font, then runs are packed into lines.
 */
function measureMixedFontRichText(
  runs: InlineRun[],
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  lineHeight: number,
  maxWidth: number,
  blockIndex: number,
  x: number,
): TextLine[] {
  const effectiveWidth = maxWidth - x
  const lines: TextLine[] = []

  // Split runs into words (break at spaces)
  interface Word {
    text: string
    width: number
    font: string
    type: FragmentType
    meta?: FragmentMeta
    isSpace: boolean
    isNewline: boolean
  }

  const words: Word[] = []

  for (const run of runs) {
    if (run.text === '\n') {
      words.push({
        text: '\n',
        width: 0,
        font: run.font,
        type: run.type,
        meta: run.meta,
        isSpace: false,
        isNewline: true,
      })
      continue
    }

    // Split by spaces, keeping spaces as separate tokens
    const parts = run.text.split(/( +)/g)
    for (const part of parts) {
      if (part.length === 0) continue
      const isSpace = /^ +$/.test(part)

      // Measure width
      let width = 0
      if (!isSpace) {
        const measured = prepareWithSegments(part, run.font)
        const result = layoutWithLines(measured, 999999, lineHeight)
        width = result.lines.length > 0 ? result.lines[0].width : 0
      } else {
        const measured = prepareWithSegments('x' + part + 'x', run.font)
        const resultFull = layoutWithLines(measured, 999999, lineHeight)
        const measuredSingle = prepareWithSegments('xx', run.font)
        const resultSingle = layoutWithLines(measuredSingle, 999999, lineHeight)
        width =
          (resultFull.lines.length > 0 ? resultFull.lines[0].width : 0) -
          (resultSingle.lines.length > 0 ? resultSingle.lines[0].width : 0)
      }

      // Add extra padding for inline code
      if (run.type === 'inline_code' && !isSpace) {
        width += spacing.inlineCodePadding * 2
      }

      words.push({
        text: part,
        width,
        font: run.font,
        type: run.type,
        meta: run.meta,
        isSpace,
        isNewline: false,
      })
    }
  }

  // Greedy line-breaking
  let currentLineFragments: InlineFragment[] = []
  let currentLineWidth = 0
  let lineIndex = 0

  function emitLine() {
    const totalWidth = currentLineFragments.reduce((s, f) => s + f.width, 0)
    lines.push({
      kind: 'text',
      index: 0,
      blockIndex,
      lineIndexInBlock: lineIndex,
      y: 0,
      height: lineHeight,
      width: totalWidth,
      x,
      fragments: currentLineFragments,
    })
    lineIndex++
    currentLineFragments = []
    currentLineWidth = 0
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]

    if (word.isNewline) {
      emitLine()
      continue
    }

    if (word.isSpace) {
      // Only add space if we have content and won't overflow
      if (currentLineFragments.length > 0) {
        currentLineFragments.push({
          text: word.text,
          x: currentLineWidth,
          width: word.width,
          font: word.font,
          type: word.type,
          meta: word.meta,
        })
        currentLineWidth += word.width
      }
      continue
    }

    // Check if word fits on current line
    if (
      currentLineWidth + word.width > effectiveWidth &&
      currentLineFragments.length > 0
    ) {
      // Remove trailing space fragments
      while (
        currentLineFragments.length > 0 &&
        currentLineFragments[currentLineFragments.length - 1].text.trim() === ''
      ) {
        const removed = currentLineFragments.pop()!
        currentLineWidth -= removed.width
      }
      emitLine()
    }

    currentLineFragments.push({
      text: word.text,
      x: currentLineWidth,
      width: word.width,
      font: word.font,
      type: word.type,
      meta: word.meta,
    })
    currentLineWidth += word.width
  }

  // Emit last line
  if (currentLineFragments.length > 0) {
    // Remove trailing spaces
    while (
      currentLineFragments.length > 0 &&
      currentLineFragments[currentLineFragments.length - 1].text.trim() === ''
    ) {
      const removed = currentLineFragments.pop()!
      currentLineWidth -= removed.width
    }
    emitLine()
  }

  // Ensure at least one line
  if (lines.length === 0) {
    lines.push({
      kind: 'text',
      index: 0,
      blockIndex,
      lineIndexInBlock: 0,
      y: 0,
      height: lineHeight,
      width: 0,
      x,
      fragments: [],
    })
  }

  return lines
}

/**
 * Extract plain text from inline nodes (for hashing/comparison).
 */
export function inlineNodesToPlainText(nodes: InlineNode[]): string {
  let text = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        text += node.text
        break
      case 'code-span':
        text += node.text
        break
      case 'softbreak':
        text += ' '
        break
      case 'hardbreak':
        text += '\n'
        break
      case 'strong':
      case 'emphasis':
      case 'link':
        text += inlineNodesToPlainText(node.children)
        break
      case 'image':
        text += inlineNodesToPlainText(node.children)
        break
      case 'html':
        text += node.content
        break
    }
  }
  return text
}
