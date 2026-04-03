import type { BlockNode } from 'markdown-parser'
import type { LayoutLine, Highlighter } from '../types.js'
import type { ResolvedFonts, SpacingConfig } from '../font-theme.js'
import { measureTextBlock, getHeadingFont, getHeadingLineHeight } from './text-block.js'
import { measureRichText, inlineNodesToPlainText } from './rich-text.js'
import { measureCodeBlock } from './code-block.js'
import { measureTable } from './table.js'
import { measureList, measureBlockquote } from './list.js'

export { measureTextBlock, getHeadingFont, getHeadingLineHeight } from './text-block.js'
export { measureRichText, flattenInlineNodes, inlineNodesToPlainText } from './rich-text.js'
export { measureCodeBlock } from './code-block.js'
export { measureTable } from './table.js'
export { measureList, measureBlockquote } from './list.js'

/**
 * Measure a single block node, dispatching to the appropriate measurement function.
 * Returns LayoutLine[] (TextLine[] or [OpaqueLine]).
 */
export function measureBlock(
  block: BlockNode,
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  maxWidth: number,
  blockIndex: number,
  highlighter?: Highlighter,
): LayoutLine[] {
  switch (block.type) {
    case 'heading': {
      const font = getHeadingFont(block.level, fonts)
      const lineHeight = getHeadingLineHeight(block.level, fonts.bodyFontSize)
      const hasInlineFormatting = block.children.some(
        (c) => c.type !== 'text' && c.type !== 'softbreak',
      )
      if (hasInlineFormatting) {
        return measureRichText(
          block.children,
          fonts,
          spacing,
          font,
          lineHeight,
          maxWidth,
          blockIndex,
        )
      }
      const text = inlineNodesToPlainText(block.children)
      return measureTextBlock(text, font, lineHeight, maxWidth, blockIndex)
    }

    case 'paragraph': {
      const hasInlineFormatting = block.children.some(
        (c) => c.type !== 'text' && c.type !== 'softbreak',
      )
      if (hasInlineFormatting) {
        return measureRichText(
          block.children,
          fonts,
          spacing,
          fonts.body,
          fonts.bodyLineHeight,
          maxWidth,
          blockIndex,
        )
      }
      const text = inlineNodesToPlainText(block.children)
      return measureTextBlock(
        text,
        fonts.body,
        fonts.bodyLineHeight,
        maxWidth,
        blockIndex,
      )
    }

    case 'code-block': {
      const lang = block.info ?? ''
      return [
        measureCodeBlock(
          block.content,
          lang,
          fonts,
          spacing,
          maxWidth,
          blockIndex,
          highlighter,
        ),
      ]
    }

    case 'table': {
      return [
        measureTable(
          block.head,
          block.body,
          fonts,
          spacing,
          maxWidth,
          blockIndex,
        ),
      ]
    }

    case 'list': {
      return measureList(block, fonts, spacing, maxWidth, blockIndex, highlighter)
    }

    case 'blockquote': {
      return measureBlockquote(
        block,
        fonts,
        spacing,
        maxWidth,
        blockIndex,
        highlighter,
      )
    }

    case 'thematic-break': {
      return [
        {
          kind: 'text' as const,
          index: 0,
          blockIndex,
          lineIndexInBlock: 0,
          y: 0,
          height: spacing.thematicBreakHeight,
          width: maxWidth,
          x: 0,
          fragments: [],
        },
      ]
    }

    case 'html-block': {
      // HTML blocks: estimate height based on line count
      const lineCount = (block.content.match(/\n/g) || []).length + 1
      const estimatedHeight = lineCount * fonts.bodyLineHeight
      return [
        {
          kind: 'opaque' as const,
          index: 0,
          blockIndex,
          lineIndexInBlock: 0,
          y: 0,
          height: estimatedHeight,
          width: maxWidth,
          x: 0,
          content: {
            type: 'code_block' as const,
            code: block.content,
            lang: 'html',
            font: fonts.code,
            lineHeight: fonts.codeLineHeight,
            sourceLineCount: lineCount,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
      ]
    }

    default:
      // Unknown block type - return empty line
      return [
        {
          kind: 'text' as const,
          index: 0,
          blockIndex,
          lineIndexInBlock: 0,
          y: 0,
          height: fonts.bodyLineHeight,
          width: 0,
          x: 0,
          fragments: [],
        },
      ]
  }
}
