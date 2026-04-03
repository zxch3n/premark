import { describe, it, expect } from 'vitest'
import { BlockCache } from '../src/cache.js'

describe('BlockCache', () => {
  it('stores and retrieves entries', () => {
    const cache = new BlockCache()
    const entry = {
      contentHash: 12345,
      lines: [],
      layoutWidth: 375,
    }
    cache.set(0, entry)
    expect(cache.get(0)).toBe(entry)
  })

  it('returns undefined for missing entries', () => {
    const cache = new BlockCache()
    expect(cache.get(99)).toBeUndefined()
  })

  it('checkHit: full hit', () => {
    const cache = new BlockCache()
    cache.set(0, { contentHash: 100, lines: [], layoutWidth: 375 })
    expect(cache.checkHit(0, 100, 375)).toBe('full')
  })

  it('checkHit: width changed', () => {
    const cache = new BlockCache()
    cache.set(0, { contentHash: 100, lines: [], layoutWidth: 375 })
    expect(cache.checkHit(0, 100, 500)).toBe('width_changed')
  })

  it('checkHit: content miss', () => {
    const cache = new BlockCache()
    cache.set(0, { contentHash: 100, lines: [], layoutWidth: 375 })
    expect(cache.checkHit(0, 999, 375)).toBe('miss')
  })

  it('checkHit: total miss', () => {
    const cache = new BlockCache()
    expect(cache.checkHit(0, 100, 375)).toBe('miss')
  })

  it('invalidateFrom removes entries >= index', () => {
    const cache = new BlockCache()
    cache.set(0, { contentHash: 1, lines: [], layoutWidth: 375 })
    cache.set(1, { contentHash: 2, lines: [], layoutWidth: 375 })
    cache.set(2, { contentHash: 3, lines: [], layoutWidth: 375 })

    cache.invalidateFrom(1)
    expect(cache.get(0)).toBeDefined()
    expect(cache.get(1)).toBeUndefined()
    expect(cache.get(2)).toBeUndefined()
  })

  it('clear removes all entries', () => {
    const cache = new BlockCache()
    cache.set(0, { contentHash: 1, lines: [], layoutWidth: 375 })
    cache.set(1, { contentHash: 2, lines: [], layoutWidth: 375 })
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
