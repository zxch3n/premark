import type { BlockNode, InlineNode } from 'markdown-parser'
import type { TextLine, LayoutLine, BlockLayout, BlockMeta } from '../types.js'
import type { ResolvedFonts, SpacingConfig } from '../font-theme.js'
import { measureRichText, inlineNodesToPlainText } from './rich-text.js'
import { measureBlock } from './index.js'

/**
 * Measure a list (ordered or unordered) and its items.
 * Each list item produces TextLine[].
 */
export function measureList(
  block: BlockNode & { type: 'list' },
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  maxWidth: number,
  blockIndex: number,
  highlighter?: import('../types.js').Highlighter,
  depth: number = 0,
): LayoutLine[] {
  const indent = spacing.listIndent * (depth + 1)
  const lines: LayoutLine[] = []

  for (let i = 0; i < block.items.length; i++) {
    const item = block.items[i]
    const marker =
      block.kind === 'ordered' ? `${block.start + i}.` : '•'

    for (const child of item.children) {
      if (child.type === 'paragraph') {
        const itemLines = measureRichText(
          child.children,
          fonts,
          spacing,
          fonts.body,
          fonts.bodyLineHeight,
          maxWidth - indent,
          blockIndex,
          indent,
        )
        lines.push(...itemLines)
      } else if (child.type === 'list') {
        const subLines = measureList(
          child,
          fonts,
          spacing,
          maxWidth,
          blockIndex,
          highlighter,
          depth + 1,
        )
        lines.push(...subLines)
      } else {
        // Other block types inside list items
        const childLines = measureBlock(
          child,
          fonts,
          spacing,
          maxWidth - indent,
          blockIndex,
          highlighter,
        )
        // Shift x by indent
        for (const line of childLines) {
          line.x += indent
        }
        lines.push(...childLines)
      }
    }
  }

  return lines
}

/**
 * Measure a blockquote and its children.
 */
export function measureBlockquote(
  block: BlockNode & { type: 'blockquote' },
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  maxWidth: number,
  blockIndex: number,
  highlighter?: import('../types.js').Highlighter,
  depth: number = 0,
): LayoutLine[] {
  const indent =
    spacing.blockquoteBorderWidth +
    spacing.blockquoteLeftPadding
  const indentTotal = indent * (depth + 1)
  const lines: LayoutLine[] = []

  for (const child of block.children) {
    if (child.type === 'blockquote') {
      const subLines = measureBlockquote(
        child,
        fonts,
        spacing,
        maxWidth - indent,
        blockIndex,
        highlighter,
        depth + 1,
      )
      lines.push(...subLines)
    } else {
      const childLines = measureBlock(
        child,
        fonts,
        spacing,
        maxWidth - indentTotal,
        blockIndex,
        highlighter,
      )
      // Shift x by indent
      for (const line of childLines) {
        line.x += indentTotal
      }
      lines.push(...childLines)
    }
  }

  return lines
}
