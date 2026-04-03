import { describe, it, expect } from 'vitest'
import { resolveFonts, presets, defaultSpacing } from '../src/font-theme.js'
import { measureTextBlock, getHeadingFont, getHeadingLineHeight } from '../src/measure/text-block.js'
import { measureRichText, flattenInlineNodes, inlineNodesToPlainText } from '../src/measure/rich-text.js'
import { measureCodeBlock } from '../src/measure/code-block.js'
import { measureBlock } from '../src/measure/index.js'
import type { InlineNode } from 'markdown-parser'
import type { TextLine, OpaqueLine } from '../src/types.js'

const fonts = resolveFonts(presets.github)
const spacing = defaultSpacing

describe('measureTextBlock', () => {
  it('measures a single line of text', () => {
    const lines = measureTextBlock('Hello', fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe('text')
    expect(lines[0].height).toBe(fonts.bodyLineHeight)
    expect(lines[0].width).toBeGreaterThan(0)
  })

  it('wraps long text to multiple lines', () => {
    const longText = 'This is a very long sentence that should definitely wrap when given a narrow container width for layout'
    const lines = measureTextBlock(longText, fonts.body, fonts.bodyLineHeight, 150, 0)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('handles empty text', () => {
    const lines = measureTextBlock('', fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines).toHaveLength(1)
    expect(lines[0].width).toBe(0)
  })

  it('respects x offset', () => {
    const lines = measureTextBlock('Hello', fonts.body, fonts.bodyLineHeight, 375, 0, 50)
    expect(lines[0].x).toBe(50)
  })

  it('single-line text width is consistent', () => {
    const lines1 = measureTextBlock('Test', fonts.body, fonts.bodyLineHeight, 375, 0)
    const lines2 = measureTextBlock('Test', fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines1[0].width).toBe(lines2[0].width)
  })

  it('wider container fits more text per line', () => {
    const text = 'A moderately long text that will wrap at different widths depending on container'
    const narrow = measureTextBlock(text, fonts.body, fonts.bodyLineHeight, 150, 0)
    const wide = measureTextBlock(text, fonts.body, fonts.bodyLineHeight, 800, 0)
    expect(narrow.length).toBeGreaterThanOrEqual(wide.length)
  })

  it('heading fonts produce different metrics', () => {
    const bodyLines = measureTextBlock('Test', fonts.body, fonts.bodyLineHeight, 375, 0)
    const h1Lines = measureTextBlock('Test', fonts.heading1, getHeadingLineHeight(1, fonts.bodyFontSize), 375, 0)
    expect(h1Lines[0].width).toBeGreaterThan(bodyLines[0].width) // h1 is larger font
    expect(h1Lines[0].height).toBeGreaterThan(bodyLines[0].height)
  })

  it('fragments have the correct text', () => {
    const lines = measureTextBlock('Hello World', fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines[0].fragments).toHaveLength(1)
    expect(lines[0].fragments[0].text).toBe('Hello World')
  })
})

describe('getHeadingFont', () => {
  it('returns different fonts for each level', () => {
    const f1 = getHeadingFont(1, fonts)
    const f2 = getHeadingFont(2, fonts)
    const f6 = getHeadingFont(6, fonts)
    expect(f1).not.toBe(f2)
    expect(f2).not.toBe(f6)
    expect(f1).toContain('700') // all headings are bold
  })
})

describe('getHeadingLineHeight', () => {
  it('h1 has the largest line height', () => {
    const h1 = getHeadingLineHeight(1, 16)
    const h6 = getHeadingLineHeight(6, 16)
    expect(h1).toBeGreaterThan(h6)
  })
})

describe('flattenInlineNodes', () => {
  it('flattens simple text', () => {
    const nodes: InlineNode[] = [{ type: 'text', text: 'hello' }]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('hello')
    expect(runs[0].font).toBe(fonts.body)
    expect(runs[0].type).toBe('text')
  })

  it('flattens bold text', () => {
    const nodes: InlineNode[] = [
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs).toHaveLength(1)
    expect(runs[0].font).toBe(fonts.bodyBold)
    expect(runs[0].type).toBe('strong')
  })

  it('flattens italic text', () => {
    const nodes: InlineNode[] = [
      { type: 'emphasis', children: [{ type: 'text', text: 'italic' }] },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs[0].font).toBe(fonts.bodyItalic)
    expect(runs[0].type).toBe('emphasis')
  })

  it('flattens bold+italic nested', () => {
    const nodes: InlineNode[] = [
      {
        type: 'strong',
        children: [
          { type: 'emphasis', children: [{ type: 'text', text: 'both' }] },
        ],
      },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs[0].font).toBe(fonts.bodyBoldItalic)
    expect(runs[0].type).toBe('strong_emphasis')
  })

  it('flattens code spans', () => {
    const nodes: InlineNode[] = [{ type: 'code-span', text: 'code' }]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs[0].font).toBe(fonts.inlineCode)
    expect(runs[0].type).toBe('inline_code')
  })

  it('flattens links', () => {
    const nodes: InlineNode[] = [
      { type: 'link', href: 'http://x.com', children: [{ type: 'text', text: 'click' }] },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs[0].type).toBe('link')
    expect(runs[0].meta).toEqual({ type: 'link', href: 'http://x.com', title: undefined })
  })

  it('flattens mixed inline', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'hello ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' world' },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs).toHaveLength(3)
    expect(runs[0].type).toBe('text')
    expect(runs[1].type).toBe('strong')
    expect(runs[2].type).toBe('text')
  })

  it('handles softbreak as space', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'line1' },
      { type: 'softbreak' },
      { type: 'text', text: 'line2' },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs).toHaveLength(3)
    expect(runs[1].text).toBe(' ')
  })

  it('handles hardbreak as newline', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'line1' },
      { type: 'hardbreak' },
      { type: 'text', text: 'line2' },
    ]
    const runs = flattenInlineNodes(nodes, fonts, spacing)
    expect(runs[1].text).toBe('\n')
  })
})

describe('inlineNodesToPlainText', () => {
  it('extracts plain text', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'hello ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' world' },
    ]
    expect(inlineNodesToPlainText(nodes)).toBe('hello bold world')
  })

  it('extracts text from nested structures', () => {
    const nodes: InlineNode[] = [
      {
        type: 'link',
        href: 'x',
        children: [
          { type: 'strong', children: [{ type: 'text', text: 'bold link' }] },
        ],
      },
    ]
    expect(inlineNodesToPlainText(nodes)).toBe('bold link')
  })

  it('handles code spans', () => {
    const nodes: InlineNode[] = [{ type: 'code-span', text: 'console.log' }]
    expect(inlineNodesToPlainText(nodes)).toBe('console.log')
  })
})

describe('measureRichText', () => {
  it('measures simple text', () => {
    const nodes: InlineNode[] = [{ type: 'text', text: 'Hello World' }]
    const lines = measureRichText(nodes, fonts, spacing, fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0].width).toBeGreaterThan(0)
  })

  it('measures mixed font text', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'Normal ' },
      { type: 'code-span', text: 'code' },
      { type: 'text', text: ' text' },
    ]
    const lines = measureRichText(nodes, fonts, spacing, fonts.body, fonts.bodyLineHeight, 375, 0)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    // Should have multiple fragments
    expect(lines[0].fragments.length).toBeGreaterThan(1)
  })

  it('wraps long rich text', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'This is a long paragraph with ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold text' }] },
      { type: 'text', text: ' and ' },
      { type: 'emphasis', children: [{ type: 'text', text: 'italic text' }] },
      { type: 'text', text: ' that should wrap to multiple lines.' },
    ]
    const lines = measureRichText(nodes, fonts, spacing, fonts.body, fonts.bodyLineHeight, 150, 0)
    expect(lines.length).toBeGreaterThan(1)
  })
})

describe('measureCodeBlock', () => {
  it('measures a code block', () => {
    const line = measureCodeBlock('const x = 1', 'ts', fonts, spacing, 375, 0)
    expect(line.kind).toBe('opaque')
    expect(line.height).toBeGreaterThan(0)
    if (line.content.type === 'code_block') {
      expect(line.content.code).toBe('const x = 1')
      expect(line.content.lang).toBe('ts')
    }
  })

  it('taller for more lines', () => {
    const short = measureCodeBlock('a', '', fonts, spacing, 375, 0)
    const long = measureCodeBlock('a\nb\nc\nd\ne', '', fonts, spacing, 375, 0)
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('includes padding in height', () => {
    const line = measureCodeBlock('x', '', fonts, spacing, 375, 0)
    // Height should be at least padding.top + padding.bottom + one line
    expect(line.height).toBeGreaterThanOrEqual(
      spacing.codeBlockPadding.top + spacing.codeBlockPadding.bottom + fonts.codeLineHeight,
    )
  })
})

describe('measureBlock — dispatch', () => {
  it('dispatches heading', () => {
    const lines = measureBlock(
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'Title' }] },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines.length).toBeGreaterThanOrEqual(1)
  })

  it('dispatches paragraph', () => {
    const lines = measureBlock(
      { type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines.length).toBeGreaterThanOrEqual(1)
  })

  it('dispatches code-block', () => {
    const lines = measureBlock(
      { type: 'code-block', content: 'code here', info: 'js' },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe('opaque')
  })

  it('dispatches thematic-break', () => {
    const lines = measureBlock(
      { type: 'thematic-break' },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].height).toBe(spacing.thematicBreakHeight)
  })

  it('dispatches list', () => {
    const lines = measureBlock(
      {
        type: 'list',
        kind: 'unordered',
        marker: '-',
        tight: true,
        items: [
          { type: 'list-item', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'item' }] }] },
        ],
      },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0].x).toBeGreaterThan(0) // indented
  })

  it('dispatches blockquote', () => {
    const lines = measureBlock(
      {
        type: 'blockquote',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'quoted' }] },
        ],
      },
      fonts,
      spacing,
      375,
      0,
    )
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0].x).toBeGreaterThan(0) // indented
  })
})
