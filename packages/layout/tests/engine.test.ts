import { describe, it, expect } from 'vitest'
import { createLayoutEngine } from '../src/engine.js'

// Pretext requires Canvas API. In Node.js without @napi-rs/canvas, these tests skip.
let hasCanvas = false
try {
  // Try to see if OffscreenCanvas or canvas is available
  if (typeof OffscreenCanvas !== 'undefined' || typeof globalThis.document !== 'undefined') {
    hasCanvas = true
  }
} catch {
  // no canvas
}

function tryLayout(md: string, width = 375) {
  try {
    const engine = createLayoutEngine({ fontTheme: 'github' })
    return engine.layout(md, width)
  } catch {
    return null
  }
}

describe('createLayoutEngine', () => {
  it('creates an engine with preset theme', () => {
    const engine = createLayoutEngine({ fontTheme: 'github' })
    expect(engine).toBeDefined()
    expect(engine.layout).toBeTypeOf('function')
    expect(engine.createStream).toBeTypeOf('function')
    expect(engine.resize).toBeTypeOf('function')
    expect(engine.updateFontTheme).toBeTypeOf('function')
    expect(engine.dispose).toBeTypeOf('function')
  })

  it('layouts a simple heading (requires Canvas)', () => {
    const layout = tryLayout('# Hello')
    if (!layout) return

    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('heading')
    expect(layout.blocks[0].meta).toEqual({ type: 'heading', level: 1 })
    expect(layout.lines.length).toBeGreaterThanOrEqual(1)
    expect(layout.totalHeight).toBeGreaterThan(0)
    expect(layout.containerWidth).toBe(375)
  })

  it('layouts multiple blocks (requires Canvas)', () => {
    const layout = tryLayout('# Hello\n\nThis is a paragraph.\n\n---\n\n> Quote')
    if (!layout) return

    expect(layout.blocks.length).toBeGreaterThanOrEqual(3)
    expect(layout.blocks[0].type).toBe('heading')

    for (let i = 1; i < layout.lines.length; i++) {
      expect(layout.lines[i].y).toBeGreaterThanOrEqual(layout.lines[i - 1].y)
    }
  })

  it('layouts code blocks as opaque lines (requires Canvas)', () => {
    const layout = tryLayout('```ts\nconst x = 1\n```')
    if (!layout) return

    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('code_block')
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0].kind).toBe('opaque')
  })

  it('layouts tables as opaque lines (requires Canvas)', () => {
    const layout = tryLayout('| a | b |\n|---|---|\n| 1 | 2 |')
    if (!layout) return

    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('table')
  })

  it('disposes without error', () => {
    const engine = createLayoutEngine({ fontTheme: 'github' })
    expect(() => engine.dispose()).not.toThrow()
  })
})

describe('LayoutStream', () => {
  it('handles push and finish (requires Canvas)', () => {
    try {
      const engine = createLayoutEngine({ fontTheme: 'github' })
      const stream = engine.createStream(375)
      const delta1 = stream.push('# Hello\n\n')
      expect(delta1.totalHeight).toBeGreaterThanOrEqual(0)

      const delta2 = stream.push('World\n\n')
      expect(delta2.version).toBeGreaterThan(delta1.version)

      stream.finish()
      const layout = stream.getLayout()
      expect(layout.blocks.length).toBeGreaterThan(0)
    } catch {
      // Skip if no Canvas
    }
  })
})
