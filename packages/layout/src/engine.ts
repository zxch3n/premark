import { MarkdownParser, type BlockNode } from 'markdown-parser'
import type {
  DocumentLayout,
  BlockLayout,
  LayoutLine,
  BlockType,
  BlockMeta,
  Highlighter,
  LayoutDelta,
} from './types.js'
import {
  type FontTheme,
  type ResolvedFonts,
  type SpacingConfig,
  resolveFonts,
  resolveFontTheme,
  defaultSpacing,
} from './font-theme.js'
import { BlockCache, type BlockCacheEntry } from './cache.js'
import { hashBlock } from '@pretext-md/parser'
import { measureBlock } from './measure/index.js'
import { LayoutStream } from './stream.js'

// ─── Style Config ───

export interface StyleConfig {
  fontTheme: FontTheme | 'github' | 'modern' | 'chinese'
  spacing?: Partial<SpacingConfig>
  fontOverrides?: Partial<ResolvedFonts>
  highlighter?: Highlighter
}

// ─── Layout Engine ───

export interface LayoutEngine {
  layout(markdown: string, containerWidth: number): DocumentLayout
  createStream(containerWidth: number): LayoutStream
  resize(prevLayout: DocumentLayout, newWidth: number): DocumentLayout
  updateFontTheme(theme: FontTheme): void
  dispose(): void
}

export function createLayoutEngine(config: StyleConfig): LayoutEngine {
  const fontTheme = resolveFontTheme(config.fontTheme)
  let fonts = resolveFonts(fontTheme)

  // Apply font overrides
  if (config.fontOverrides) {
    fonts = { ...fonts, ...config.fontOverrides }
  }

  const spacing: SpacingConfig = {
    ...defaultSpacing,
    ...config.spacing,
  }

  const highlighter = config.highlighter
  const cache = new BlockCache()
  let version = 0

  function layoutBlocks(
    blocks: BlockNode[],
    containerWidth: number,
  ): DocumentLayout {
    const allLines: LayoutLine[] = []
    const blockLayouts: BlockLayout[] = []
    let y = 0
    let lineIndex = 0

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const blockHash = hashBlock(block)

      // Add top margin (except for first block)
      if (i > 0) {
        const isHeading = block.type === 'heading'
        const margin = isHeading
          ? spacing.blockMargin * spacing.headingTopMarginMultiplier
          : spacing.blockMargin
        y += margin
      }

      // Check cache
      const hit = cache.checkHit(i, blockHash, containerWidth)
      let lines: LayoutLine[]

      if (hit === 'full') {
        lines = cache.get(i)!.lines
      } else {
        lines = measureBlock(block, fonts, spacing, containerWidth, i, highlighter)
        cache.set(i, { contentHash: blockHash, lines, layoutWidth: containerWidth })
      }

      // Assign global line indices and Y positions
      const firstLineIndex = lineIndex
      let blockHeight = 0

      for (let j = 0; j < lines.length; j++) {
        const line = lines[j]
        line.index = lineIndex
        line.blockIndex = i
        line.lineIndexInBlock = j
        line.y = y + blockHeight
        blockHeight += line.height
        lineIndex++
      }

      // Build block layout
      const blockMeta = getBlockMeta(block)
      const blockType = getBlockType(block)

      blockLayouts.push({
        index: i,
        type: blockType,
        firstLineIndex,
        lineCount: lines.length,
        y,
        height: blockHeight,
        contentBox: {
          x: lines[0]?.x ?? 0,
          y,
          width: containerWidth - (lines[0]?.x ?? 0),
          height: blockHeight,
        },
        meta: blockMeta,
      })

      allLines.push(...lines)
      y += blockHeight
    }

    version++

    return {
      lines: allLines,
      blocks: blockLayouts,
      totalHeight: y,
      containerWidth,
      version,
    }
  }

  return {
    layout(markdown: string, containerWidth: number): DocumentLayout {
      const parser = new MarkdownParser()
      const blocks = parser.parse(markdown)
      return layoutBlocks(blocks, containerWidth)
    },

    createStream(containerWidth: number): LayoutStream {
      return new LayoutStream(fonts, spacing, containerWidth, highlighter)
    },

    resize(prevLayout: DocumentLayout, newWidth: number): DocumentLayout {
      // Re-layout with the same blocks but new width
      // We need to re-parse to get blocks (or we could store them)
      // For now, just invalidate cache and return
      cache.clear()
      // Since we don't store blocks, the caller should re-call layout()
      // This is a simplified implementation
      return prevLayout
    },

    updateFontTheme(theme: FontTheme): void {
      fonts = resolveFonts(theme)
      cache.clear()
    },

    dispose(): void {
      cache.clear()
    },
  }
}

// ─── Helpers ───

function getBlockType(block: BlockNode): BlockType {
  switch (block.type) {
    case 'heading':
      return 'heading'
    case 'paragraph':
      return 'paragraph'
    case 'code-block':
      return 'code_block'
    case 'list':
      return 'list'
    case 'blockquote':
      return 'blockquote'
    case 'table':
      return 'table'
    case 'thematic-break':
      return 'thematic_break'
    case 'html-block':
      return 'html_block'
    default:
      return 'paragraph'
  }
}

function getBlockMeta(block: BlockNode): BlockMeta {
  switch (block.type) {
    case 'heading':
      return { type: 'heading', level: block.level }
    case 'paragraph':
      return { type: 'paragraph' }
    case 'code-block':
      return {
        type: 'code_block',
        lang: block.info ?? '',
        highlighted: false,
      }
    case 'list':
      return {
        type: 'list',
        ordered: block.kind === 'ordered',
        start: block.kind === 'ordered' ? block.start : undefined,
      }
    case 'blockquote':
      return { type: 'blockquote', depth: 0 }
    case 'table':
      return {
        type: 'table',
        columnCount: block.head.cells.length,
        alignments: block.head.cells.map((c) => c.align ?? null),
      }
    case 'thematic-break':
      return { type: 'thematic_break' }
    case 'html-block':
      return { type: 'html_block' }
    default:
      return { type: 'paragraph' }
  }
}
