import { type BlockNode } from 'markdown-parser'
import { StreamParser, hashBlock, diffBlocks } from '@pretext-md/parser'
import type {
  DocumentLayout,
  BlockLayout,
  LayoutLine,
  LayoutDelta,
  BlockType,
  BlockMeta,
  Highlighter,
} from './types.js'
import type { ResolvedFonts, SpacingConfig } from './font-theme.js'
import { BlockCache } from './cache.js'
import { measureBlock } from './measure/index.js'

/**
 * LayoutStream: streaming incremental layout for LLM token-by-token output.
 *
 * Usage:
 *   const stream = engine.createStream(width)
 *   stream.push(chunk) → LayoutDelta
 *   stream.finish() → LayoutDelta
 *   stream.getLayout() → DocumentLayout
 */
export class LayoutStream {
  private parser = new StreamParser()
  private cache = new BlockCache()
  private currentLayout: DocumentLayout
  private previousBlocks: BlockNode[] = []
  private version = 0

  constructor(
    private fonts: ResolvedFonts,
    private spacing: SpacingConfig,
    private containerWidth: number,
    private highlighter?: Highlighter,
  ) {
    this.currentLayout = {
      lines: [],
      blocks: [],
      totalHeight: 0,
      containerWidth,
      version: 0,
    }
  }

  /**
   * Push a chunk of markdown text. Returns the incremental changes.
   */
  push(chunk: string): LayoutDelta {
    const previousTotalHeight = this.currentLayout.totalHeight
    const previousLineCount = this.currentLayout.lines.length

    // Parse incrementally
    this.parser.push(chunk)

    // Get all blocks (finalized + partial for optimistic rendering)
    const finalized = this.parser.getFinalizedBlocks()
    const partial = this.parser.getPartialBlocks()
    const allBlocks = [...finalized, ...partial]

    // Diff against previous blocks
    const diff = diffBlocks(this.previousBlocks, allBlocks)

    // Invalidate cache from dirty point
    this.cache.invalidateFrom(diff.firstDirtyIndex)

    // Re-layout from dirty point
    this.currentLayout = this.layoutFromDirty(
      allBlocks,
      diff.firstDirtyIndex,
    )

    this.previousBlocks = allBlocks

    // Build delta
    const newLines = this.currentLayout.lines
    const appendedLines = newLines.slice(previousLineCount)
    const modifiedLines: { index: number; line: LayoutLine }[] = []

    // Check for modified lines in the dirty region
    for (let i = diff.firstDirtyIndex; i < Math.min(previousLineCount, newLines.length); i++) {
      // Find lines belonging to this block
      for (const line of newLines) {
        if (line.blockIndex >= diff.firstDirtyIndex && line.index < previousLineCount) {
          modifiedLines.push({ index: line.index, line })
        }
      }
      break // Only check once
    }

    return {
      version: this.currentLayout.version,
      dirtyFromBlock: diff.firstDirtyIndex,
      previousTotalHeight,
      totalHeight: this.currentLayout.totalHeight,
      heightDelta: this.currentLayout.totalHeight - previousTotalHeight,
      appendedLines,
      modifiedLines,
      removedLineCount: Math.max(0, previousLineCount - newLines.length),
    }
  }

  /**
   * Finish the stream. Returns final delta.
   */
  finish(): LayoutDelta {
    const previousTotalHeight = this.currentLayout.totalHeight
    const previousLineCount = this.currentLayout.lines.length

    const remaining = this.parser.finish()
    const allBlocks = this.parser.getFinalizedBlocks()

    const diff = diffBlocks(this.previousBlocks, allBlocks)
    this.cache.invalidateFrom(diff.firstDirtyIndex)

    this.currentLayout = this.layoutFromDirty(allBlocks, diff.firstDirtyIndex)
    this.previousBlocks = allBlocks

    const newLines = this.currentLayout.lines

    return {
      version: this.currentLayout.version,
      dirtyFromBlock: diff.firstDirtyIndex,
      previousTotalHeight,
      totalHeight: this.currentLayout.totalHeight,
      heightDelta: this.currentLayout.totalHeight - previousTotalHeight,
      appendedLines: newLines.slice(previousLineCount),
      modifiedLines: [],
      removedLineCount: Math.max(0, previousLineCount - newLines.length),
    }
  }

  /**
   * Get the current layout snapshot.
   */
  getLayout(): DocumentLayout {
    return this.currentLayout
  }

  /**
   * Resize during streaming.
   */
  resize(newWidth: number): DocumentLayout {
    this.containerWidth = newWidth
    this.cache.clear()
    this.currentLayout = this.layoutFromDirty(this.previousBlocks, 0)
    return this.currentLayout
  }

  /**
   * Re-layout from a dirty block index, reusing cached lines for clean blocks.
   */
  private layoutFromDirty(
    blocks: BlockNode[],
    dirtyFrom: number,
  ): DocumentLayout {
    const allLines: LayoutLine[] = []
    const blockLayouts: BlockLayout[] = []
    let y = 0
    let lineIndex = 0

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const blockHash = hashBlock(block)

      // Margin
      if (i > 0) {
        const isHeading = block.type === 'heading'
        const margin = isHeading
          ? this.spacing.blockMargin * this.spacing.headingTopMarginMultiplier
          : this.spacing.blockMargin
        y += margin
      }

      // Check cache
      const hit = this.cache.checkHit(i, blockHash, this.containerWidth)
      let lines: LayoutLine[]

      if (hit === 'full' && i < dirtyFrom) {
        lines = this.cache.get(i)!.lines
      } else {
        lines = measureBlock(
          block,
          this.fonts,
          this.spacing,
          this.containerWidth,
          i,
          this.highlighter,
        )
        this.cache.set(i, {
          contentHash: blockHash,
          lines,
          layoutWidth: this.containerWidth,
        })
      }

      // Assign positions
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

      blockLayouts.push({
        index: i,
        type: getBlockType(block),
        firstLineIndex,
        lineCount: lines.length,
        y,
        height: blockHeight,
        contentBox: {
          x: lines[0]?.x ?? 0,
          y,
          width: this.containerWidth - (lines[0]?.x ?? 0),
          height: blockHeight,
        },
        meta: getBlockMeta(block),
      })

      allLines.push(...lines)
      y += blockHeight
    }

    this.version++

    return {
      lines: allLines,
      blocks: blockLayouts,
      totalHeight: y,
      containerWidth: this.containerWidth,
      version: this.version,
    }
  }
}

// ─── Helpers (duplicated from engine.ts to avoid circular deps) ───

function getBlockType(block: BlockNode): BlockType {
  switch (block.type) {
    case 'heading': return 'heading'
    case 'paragraph': return 'paragraph'
    case 'code-block': return 'code_block'
    case 'list': return 'list'
    case 'blockquote': return 'blockquote'
    case 'table': return 'table'
    case 'thematic-break': return 'thematic_break'
    case 'html-block': return 'html_block'
    default: return 'paragraph'
  }
}

function getBlockMeta(block: BlockNode): BlockMeta {
  switch (block.type) {
    case 'heading': return { type: 'heading', level: block.level }
    case 'paragraph': return { type: 'paragraph' }
    case 'code-block': return { type: 'code_block', lang: block.info ?? '', highlighted: false }
    case 'list': return { type: 'list', ordered: block.kind === 'ordered', start: block.kind === 'ordered' ? block.start : undefined }
    case 'blockquote': return { type: 'blockquote', depth: 0 }
    case 'table': return { type: 'table', columnCount: block.head.cells.length, alignments: block.head.cells.map(c => c.align ?? null) }
    case 'thematic-break': return { type: 'thematic_break' }
    case 'html-block': return { type: 'html_block' }
    default: return { type: 'paragraph' }
  }
}
