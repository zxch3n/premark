/**
 * Re-export the types from markdown-parser with our own aliases
 * for clarity in the layout engine.
 */
export type {
  BlockNode,
  InlineNode,
} from 'markdown-parser'

/**
 * Represents a diff between two block arrays.
 * Used for incremental layout updates.
 */
export interface BlockDiff {
  /** Index of the first changed block */
  firstDirtyIndex: number
  /** Number of blocks removed starting at firstDirtyIndex */
  removedCount: number
  /** New blocks inserted at firstDirtyIndex */
  inserted: import('markdown-parser').BlockNode[]
}
