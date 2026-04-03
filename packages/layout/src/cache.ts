import type { LayoutLine } from './types.js'

/**
 * Cache entry for a single block.
 * Stores the prepared measurement result and computed lines.
 */
export interface BlockCacheEntry {
  contentHash: number
  lines: LayoutLine[]
  layoutWidth: number
}

/**
 * Block-level cache for incremental layout.
 *
 * Three hit paths:
 * 1. Full hit (same hash + same width) → reuse lines, only shift Y
 * 2. Width changed (same hash) → need re-layout (but not re-prepare in future)
 * 3. Content changed → full re-measure
 */
export class BlockCache {
  private entries = new Map<number, BlockCacheEntry>()

  /**
   * Try to get a cached entry for a block.
   */
  get(blockIndex: number): BlockCacheEntry | undefined {
    return this.entries.get(blockIndex)
  }

  /**
   * Store a cache entry.
   */
  set(blockIndex: number, entry: BlockCacheEntry): void {
    this.entries.set(blockIndex, entry)
  }

  /**
   * Check if a block can reuse its cached lines.
   * Returns the hit type.
   */
  checkHit(
    blockIndex: number,
    contentHash: number,
    layoutWidth: number,
  ): 'full' | 'width_changed' | 'miss' {
    const entry = this.entries.get(blockIndex)
    if (!entry) return 'miss'
    if (entry.contentHash !== contentHash) return 'miss'
    if (entry.layoutWidth !== layoutWidth) return 'width_changed'
    return 'full'
  }

  /**
   * Invalidate entries from a given block index onwards.
   */
  invalidateFrom(blockIndex: number): void {
    for (const key of this.entries.keys()) {
      if (key >= blockIndex) {
        this.entries.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
