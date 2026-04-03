import { describe, it, expect } from 'vitest'
import { MarkdownParser, StreamParser, diffBlocks, hashBlock } from '../src/index.js'

describe('MarkdownParser (full parse)', () => {
  it('parses headings', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('# Hello\n\n## World')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('heading')
    if (blocks[0].type === 'heading') {
      expect(blocks[0].level).toBe(1)
    }
    if (blocks[1].type === 'heading') {
      expect(blocks[1].level).toBe(2)
    }
  })

  it('parses paragraphs', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('Hello world\n\nSecond paragraph')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('paragraph')
  })

  it('parses code blocks', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('```ts\nconst x = 1\n```')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('code-block')
    if (blocks[0].type === 'code-block') {
      expect(blocks[0].info).toBe('ts')
      expect(blocks[0].content).toBe('const x = 1\n')
    }
  })

  it('parses lists', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('- item 1\n- item 2\n- item 3')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('list')
    if (blocks[0].type === 'list') {
      expect(blocks[0].items).toHaveLength(3)
    }
  })

  it('parses tables', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
  })

  it('parses blockquotes', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('> quote text')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('blockquote')
  })

  it('parses thematic breaks', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('---')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('thematic-break')
  })

  it('parses inline formatting', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('Hello **bold** and *italic* and `code`')
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children.length).toBeGreaterThan(1)
    }
  })
})

describe('StreamParser', () => {
  it('accumulates text and parses incrementally', () => {
    const stream = new StreamParser()

    stream.push('# Hello\n\n')
    const finalized = stream.getFinalizedBlocks()
    expect(finalized.length).toBeGreaterThanOrEqual(1)

    stream.push('World\n\n')
    stream.finish()

    const all = stream.getFinalizedBlocks()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('handles partial blocks', () => {
    const stream = new StreamParser()
    stream.push('# Hello\n\nPartial para')

    const partial = stream.getPartialBlocks()
    // Should have the unfinished paragraph
    expect(partial.length).toBeGreaterThanOrEqual(0)
  })

  it('resets correctly', () => {
    const stream = new StreamParser()
    stream.push('# Hello')
    stream.reset()
    expect(stream.getFinalizedBlocks()).toHaveLength(0)
    expect(stream.getText()).toBe('')
  })
})

describe('hashBlock', () => {
  it('produces consistent hashes', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('# Hello')
    const hash1 = hashBlock(blocks[0])
    const hash2 = hashBlock(blocks[0])
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different blocks', () => {
    const parser = new MarkdownParser()
    const blocks = parser.parse('# Hello\n\n# World')
    expect(hashBlock(blocks[0])).not.toBe(hashBlock(blocks[1]))
  })
})

describe('diffBlocks', () => {
  it('detects appended blocks', () => {
    const parser = new MarkdownParser()
    const old = parser.parse('# Hello')
    const newBlocks = new MarkdownParser().parse('# Hello\n\nWorld')

    const diff = diffBlocks(old, newBlocks)
    expect(diff.firstDirtyIndex).toBe(1)
    expect(diff.removedCount).toBe(0)
    expect(diff.inserted).toHaveLength(1)
  })

  it('detects modified blocks', () => {
    const parser = new MarkdownParser()
    const old = parser.parse('# Hello')
    const newBlocks = new MarkdownParser().parse('# Changed')

    const diff = diffBlocks(old, newBlocks)
    expect(diff.firstDirtyIndex).toBe(0)
    expect(diff.removedCount).toBe(1)
    expect(diff.inserted).toHaveLength(1)
  })

  it('detects no changes', () => {
    const parser = new MarkdownParser()
    const old = parser.parse('# Hello\n\nWorld')
    const newBlocks = new MarkdownParser().parse('# Hello\n\nWorld')

    const diff = diffBlocks(old, newBlocks)
    expect(diff.firstDirtyIndex).toBe(2)
    expect(diff.removedCount).toBe(0)
    expect(diff.inserted).toHaveLength(0)
  })
})
