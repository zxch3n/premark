import { describe, it, expect } from 'vitest'
import { createLayoutEngine } from '../src/engine.js'
import type { TextLine, OpaqueLine } from '../src/types.js'

const engine = createLayoutEngine({ fontTheme: 'github' })

describe('createLayoutEngine', () => {
  it('creates an engine with preset theme', () => {
    expect(engine).toBeDefined()
    expect(engine.layout).toBeTypeOf('function')
    expect(engine.createStream).toBeTypeOf('function')
    expect(engine.resize).toBeTypeOf('function')
    expect(engine.updateFontTheme).toBeTypeOf('function')
    expect(engine.dispose).toBeTypeOf('function')
  })

  it('disposes without error', () => {
    const e = createLayoutEngine({ fontTheme: 'github' })
    expect(() => e.dispose()).not.toThrow()
  })
})

describe('layout — headings', () => {
  it('layouts a single h1', () => {
    const layout = engine.layout('# Hello', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('heading')
    expect(layout.blocks[0].meta).toEqual({ type: 'heading', level: 1 })
    expect(layout.lines.length).toBeGreaterThanOrEqual(1)
    expect(layout.totalHeight).toBeGreaterThan(0)
    expect(layout.containerWidth).toBe(375)
  })

  it('layouts all heading levels', () => {
    const md = '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6'
    const layout = engine.layout(md, 600)
    expect(layout.blocks).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(layout.blocks[i].type).toBe('heading')
      const meta = layout.blocks[i].meta
      if (meta.type === 'heading') {
        expect(meta.level).toBe(i + 1)
      }
    }
    // H1 should be taller than H6
    expect(layout.blocks[0].height).toBeGreaterThan(layout.blocks[5].height)
  })

  it('wraps long headings', () => {
    const longText = 'This is a very long heading that should wrap to multiple lines when the container is narrow'
    const layout = engine.layout(`# ${longText}`, 200)
    expect(layout.blocks[0].lineCount).toBeGreaterThan(1)
  })
})

describe('layout — paragraphs', () => {
  it('layouts a simple paragraph', () => {
    const layout = engine.layout('Hello world', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('paragraph')
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0].kind).toBe('text')
  })

  it('wraps long paragraphs', () => {
    const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'
    const layout = engine.layout(text, 200)
    expect(layout.lines.length).toBeGreaterThan(1)
  })

  it('handles multiple paragraphs', () => {
    const layout = engine.layout('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.', 375)
    expect(layout.blocks).toHaveLength(3)
    expect(layout.blocks.every((b) => b.type === 'paragraph')).toBe(true)
  })

  it('has correct Y ordering', () => {
    const layout = engine.layout('Para 1\n\nPara 2\n\nPara 3', 375)
    for (let i = 1; i < layout.blocks.length; i++) {
      expect(layout.blocks[i].y).toBeGreaterThan(layout.blocks[i - 1].y)
    }
    for (let i = 1; i < layout.lines.length; i++) {
      expect(layout.lines[i].y).toBeGreaterThanOrEqual(layout.lines[i - 1].y)
    }
  })

  it('has margins between blocks', () => {
    const layout = engine.layout('Para 1\n\nPara 2', 375)
    expect(layout.blocks).toHaveLength(2)
    const gap = layout.blocks[1].y - (layout.blocks[0].y + layout.blocks[0].height)
    expect(gap).toBeGreaterThan(0) // block margin
  })
})

describe('layout — rich text inline formatting', () => {
  it('handles bold text', () => {
    const layout = engine.layout('Hello **bold** world', 375)
    expect(layout.blocks).toHaveLength(1)
    const line = layout.lines[0] as TextLine
    expect(line.kind).toBe('text')
    expect(line.fragments.length).toBeGreaterThan(1)
    const boldFrag = line.fragments.find((f) => f.type === 'strong')
    expect(boldFrag).toBeDefined()
    expect(boldFrag!.text).toContain('bold')
  })

  it('handles italic text', () => {
    const layout = engine.layout('Hello *italic* world', 375)
    const line = layout.lines[0] as TextLine
    const italicFrag = line.fragments.find((f) => f.type === 'emphasis')
    expect(italicFrag).toBeDefined()
    expect(italicFrag!.text).toContain('italic')
  })

  it('handles inline code', () => {
    const layout = engine.layout('Use `console.log()` here', 375)
    const line = layout.lines[0] as TextLine
    const codeFrag = line.fragments.find((f) => f.type === 'inline_code')
    expect(codeFrag).toBeDefined()
    expect(codeFrag!.text).toContain('console.log()')
  })

  it('handles links', () => {
    const layout = engine.layout('Visit [example](https://example.com)', 375)
    const line = layout.lines[0] as TextLine
    const linkFrag = line.fragments.find((f) => f.type === 'link')
    expect(linkFrag).toBeDefined()
    expect(linkFrag!.meta).toEqual({
      type: 'link',
      href: 'https://example.com',
      title: undefined,
    })
  })

  it('handles bold + italic nesting', () => {
    const layout = engine.layout('***bold and italic***', 375)
    const line = layout.lines[0] as TextLine
    const frag = line.fragments.find(
      (f) => f.type === 'strong_emphasis' || f.type === 'strong' || f.type === 'emphasis',
    )
    expect(frag).toBeDefined()
  })

  it('handles mixed inline formatting in one paragraph', () => {
    const md = 'Normal **bold** then *italic* and `code` plus [link](http://x.com)'
    const layout = engine.layout(md, 600)
    const line = layout.lines[0] as TextLine
    const types = new Set(line.fragments.map((f) => f.type))
    expect(types.has('text')).toBe(true)
    expect(types.has('strong')).toBe(true)
    expect(types.has('emphasis')).toBe(true)
    expect(types.has('inline_code')).toBe(true)
    expect(types.has('link')).toBe(true)
  })

  it('fragments have non-overlapping x positions', () => {
    const layout = engine.layout('Hello **bold** world', 600)
    const line = layout.lines[0] as TextLine
    for (let i = 1; i < line.fragments.length; i++) {
      const prev = line.fragments[i - 1]
      expect(line.fragments[i].x).toBeGreaterThanOrEqual(prev.x + prev.width - 1) // allow 1px rounding
    }
  })
})

describe('layout — code blocks', () => {
  it('creates an OpaqueLine for code blocks', () => {
    const layout = engine.layout('```ts\nconst x = 1\n```', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('code_block')
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0].kind).toBe('opaque')
  })

  it('has correct CodeBlockContent', () => {
    const layout = engine.layout('```python\ndef hello():\n  print("hi")\n```', 375)
    const line = layout.lines[0] as OpaqueLine
    expect(line.content.type).toBe('code_block')
    if (line.content.type === 'code_block') {
      expect(line.content.lang).toBe('python')
      expect(line.content.code).toContain('def hello')
      expect(line.content.sourceLineCount).toBe(3) // 2 lines + trailing newline from parser
      expect(line.content.padding.top).toBeGreaterThan(0)
    }
  })

  it('computes height based on line count', () => {
    const shortCode = '```\na\n```'
    const longCode = '```\na\nb\nc\nd\ne\nf\ng\n```'
    const short = engine.layout(shortCode, 375)
    const long = engine.layout(longCode, 375)
    expect(long.totalHeight).toBeGreaterThan(short.totalHeight)
  })

  it('handles empty code blocks', () => {
    const layout = engine.layout('```\n```', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.lines[0].height).toBeGreaterThan(0)
  })

  it('handles code blocks without language', () => {
    const layout = engine.layout('```\nplain code\n```', 375)
    const line = layout.lines[0] as OpaqueLine
    if (line.content.type === 'code_block') {
      expect(line.content.lang).toBe('')
    }
  })
})

describe('layout — tables', () => {
  it('creates OpaqueLine for tables', () => {
    const layout = engine.layout('| a | b |\n|---|---|\n| 1 | 2 |', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('table')
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0].kind).toBe('opaque')
  })

  it('has correct TableContent', () => {
    const layout = engine.layout('| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |', 600)
    const line = layout.lines[0] as OpaqueLine
    expect(line.content.type).toBe('table')
    if (line.content.type === 'table') {
      expect(line.content.header).toHaveLength(2)
      expect(line.content.rows).toHaveLength(2)
      expect(line.content.rowCount).toBe(2)
      expect(line.content.columnWidths).toHaveLength(2)
      expect(line.content.rowHeights).toHaveLength(2)
    }
  })

  it('handles column alignments', () => {
    const layout = engine.layout('| L | C | R |\n|:---|:---:|---:|\n| 1 | 2 | 3 |', 600)
    const line = layout.lines[0] as OpaqueLine
    if (line.content.type === 'table') {
      expect(line.content.alignments).toEqual(['left', 'center', 'right'])
    }
  })
})

describe('layout — lists', () => {
  it('layouts unordered lists', () => {
    const layout = engine.layout('- item 1\n- item 2\n- item 3', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('list')
    expect(layout.lines.length).toBeGreaterThanOrEqual(3)
  })

  it('layouts ordered lists', () => {
    const layout = engine.layout('1. first\n2. second\n3. third', 375)
    expect(layout.blocks).toHaveLength(1)
    const meta = layout.blocks[0].meta
    if (meta.type === 'list') {
      expect(meta.ordered).toBe(true)
    }
  })

  it('list items are indented', () => {
    const layout = engine.layout('- item', 375)
    const line = layout.lines[0]
    expect(line.x).toBeGreaterThan(0)
  })

  it('nested lists have deeper indent', () => {
    const layout = engine.layout('- outer\n  - inner', 375)
    // Find the inner item line (should have larger x)
    const xs = layout.lines.map((l) => l.x)
    const maxX = Math.max(...xs)
    const minX = Math.min(...xs)
    expect(maxX).toBeGreaterThan(minX)
  })
})

describe('layout — blockquotes', () => {
  it('layouts blockquotes', () => {
    const layout = engine.layout('> quoted text', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('blockquote')
    expect(layout.lines[0].x).toBeGreaterThan(0)
  })

  it('nested blockquotes have deeper indent', () => {
    const layout = engine.layout('> outer\n>> inner', 375)
    const xs = layout.lines.map((l) => l.x)
    const maxX = Math.max(...xs)
    const minX = Math.min(...xs)
    expect(maxX).toBeGreaterThan(minX)
  })
})

describe('layout — thematic breaks', () => {
  it('layouts horizontal rules', () => {
    const layout = engine.layout('---', 375)
    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0].type).toBe('thematic_break')
  })
})

describe('layout — mixed content', () => {
  it('handles a complex document', () => {
    const md = `# Title

This is a paragraph with **bold** and *italic*.

## Code Example

\`\`\`typescript
const x: number = 42
console.log(x)
\`\`\`

## Table

| Feature | Status |
|---------|--------|
| Bold | Yes |
| Italic | Yes |

- List item 1
- List item 2

> A blockquote

---

Final paragraph.`

    const layout = engine.layout(md, 600)

    // Should have many blocks
    expect(layout.blocks.length).toBeGreaterThanOrEqual(8)

    // Total height should be substantial
    expect(layout.totalHeight).toBeGreaterThan(200)

    // Lines should be sorted by y
    for (let i = 1; i < layout.lines.length; i++) {
      expect(layout.lines[i].y).toBeGreaterThanOrEqual(layout.lines[i - 1].y)
    }

    // Version should be set
    expect(layout.version).toBeGreaterThan(0)

    // Check block types are present
    const blockTypes = new Set(layout.blocks.map((b) => b.type))
    expect(blockTypes.has('heading')).toBe(true)
    expect(blockTypes.has('paragraph')).toBe(true)
    expect(blockTypes.has('code_block')).toBe(true)
    expect(blockTypes.has('table')).toBe(true)
    expect(blockTypes.has('list')).toBe(true)
    expect(blockTypes.has('blockquote')).toBe(true)
    expect(blockTypes.has('thematic_break')).toBe(true)
  })

  it('totalHeight equals last block bottom', () => {
    const layout = engine.layout('# Hi\n\nText\n\n---', 375)
    const lastBlock = layout.blocks[layout.blocks.length - 1]
    expect(layout.totalHeight).toBeCloseTo(lastBlock.y + lastBlock.height, 0)
  })

  it('block firstLineIndex and lineCount are consistent', () => {
    const layout = engine.layout('# A\n\nPara\n\n```\ncode\n```', 375)
    let expectedIndex = 0
    for (const block of layout.blocks) {
      expect(block.firstLineIndex).toBe(expectedIndex)
      expect(block.lineCount).toBeGreaterThan(0)
      expectedIndex += block.lineCount
    }
    expect(expectedIndex).toBe(layout.lines.length)
  })
})

describe('layout — width sensitivity', () => {
  it('narrower width produces more lines', () => {
    const text = 'The quick brown fox jumps over the lazy dog and keeps running and running'
    const wide = engine.layout(text, 800)
    const narrow = engine.layout(text, 150)
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length)
    expect(narrow.totalHeight).toBeGreaterThan(wide.totalHeight)
  })

  it('very wide container keeps text on one line', () => {
    const layout = engine.layout('Short text', 2000)
    expect(layout.lines).toHaveLength(1)
  })
})

describe('layout — version increments', () => {
  it('increments version on each call', () => {
    const e = createLayoutEngine({ fontTheme: 'github' })
    const l1 = e.layout('# A', 375)
    const l2 = e.layout('# B', 375)
    const l3 = e.layout('# C', 375)
    expect(l2.version).toBe(l1.version + 1)
    expect(l3.version).toBe(l2.version + 1)
  })
})

describe('LayoutStream', () => {
  it('handles basic push and finish', () => {
    const stream = engine.createStream(375)
    const d1 = stream.push('# Hello\n\n')
    expect(d1.totalHeight).toBeGreaterThan(0)

    const d2 = stream.push('World paragraph.\n\n')
    expect(d2.version).toBeGreaterThan(d1.version)

    stream.finish()
    const layout = stream.getLayout()
    expect(layout.blocks.length).toBeGreaterThanOrEqual(2)
  })

  it('height grows as content is appended', () => {
    const stream = engine.createStream(375)
    stream.push('# Title\n\n')
    const h1 = stream.getLayout().totalHeight

    stream.push('Paragraph text.\n\n')
    const h2 = stream.getLayout().totalHeight

    stream.push('Another paragraph.\n\n')
    const h3 = stream.getLayout().totalHeight

    expect(h2).toBeGreaterThanOrEqual(h1)
    expect(h3).toBeGreaterThanOrEqual(h2)
  })

  it('returns correct LayoutDelta', () => {
    const stream = engine.createStream(375)
    const delta = stream.push('# Hello\n\nWorld\n\n')

    expect(delta.version).toBeGreaterThan(0)
    expect(delta.totalHeight).toBeGreaterThan(0)
    expect(delta.previousTotalHeight).toBe(0) // first push
  })

  it('finish finalizes remaining blocks', () => {
    const stream = engine.createStream(375)
    stream.push('# Title\n\nIncomplete paragraph') // no trailing \n\n
    const beforeFinish = stream.getLayout()

    stream.finish()
    const afterFinish = stream.getLayout()

    expect(afterFinish.blocks.length).toBeGreaterThanOrEqual(beforeFinish.blocks.length)
  })

  it('resize works during streaming', () => {
    const stream = engine.createStream(600)
    stream.push('# Title\n\nA long paragraph that takes up some width.\n\n')
    const wide = stream.getLayout()

    stream.resize(200)
    const narrow = stream.getLayout()

    expect(narrow.containerWidth).toBe(200)
    expect(narrow.totalHeight).toBeGreaterThanOrEqual(wide.totalHeight)
  })

  it('handles large streaming input', () => {
    const stream = engine.createStream(600)
    // Simulate LLM streaming: push many small chunks
    const chunks = [
      '# Introduction\n\n',
      'This ',
      'is ',
      'a ',
      'streaming ',
      'test.\n\n',
      '## Section 2\n\n',
      '```python\n',
      'def ',
      'hello',
      '():\n',
      '  pass\n',
      '```\n\n',
      'End.',
    ]
    for (const chunk of chunks) {
      stream.push(chunk)
    }
    stream.finish()
    const layout = stream.getLayout()

    expect(layout.blocks.length).toBeGreaterThanOrEqual(3)
    expect(layout.totalHeight).toBeGreaterThan(0)
  })
})

describe('layout with highlighter', () => {
  it('uses highlighter for code blocks when provided', async () => {
    const { createHighlighter } = await import('@pretext-md/highlight')
    const hl = createHighlighter()
    const e = createLayoutEngine({ fontTheme: 'github', highlighter: hl })

    const layout = e.layout('```typescript\nconst x = 1\n```', 375)
    const line = layout.lines[0] as OpaqueLine

    expect(line.content.type).toBe('code_block')
    if (line.content.type === 'code_block') {
      expect(line.content.html).toBeDefined()
      expect(line.content.html).toContain('token')
      expect(line.content.tokens).toBeDefined()
      expect(line.content.tokens!.length).toBeGreaterThan(0)
    }
  })
})
