import type { BlockNode } from 'markdown-parser'
import type { BlockDiff } from './types.js'

/**
 * Compute a content hash for a block node.
 * Used for cache invalidation in the layout engine.
 */
export function hashBlock(block: BlockNode): number {
  const str = JSON.stringify(block)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash
}

/**
 * Diff two block arrays, returning the minimal dirty region.
 * Assumes blocks are generally appended or the tail is modified (LLM streaming pattern).
 */
export function diffBlocks(
  oldBlocks: BlockNode[],
  newBlocks: BlockNode[],
): BlockDiff {
  // Find first differing index from the start
  const minLen = Math.min(oldBlocks.length, newBlocks.length)
  let firstDirty = 0

  for (let i = 0; i < minLen; i++) {
    if (hashBlock(oldBlocks[i]) !== hashBlock(newBlocks[i])) {
      break
    }
    firstDirty = i + 1
  }

  // Everything from firstDirty onwards is dirty
  const removedCount = oldBlocks.length - firstDirty
  const inserted = newBlocks.slice(firstDirty)

  return {
    firstDirtyIndex: firstDirty,
    removedCount,
    inserted,
  }
}
