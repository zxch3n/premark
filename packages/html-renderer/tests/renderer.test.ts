import { describe, it, expect } from 'vitest'
import { renderToHtml } from '../src/renderer.js'
import type { DocumentLayout, TextLine, OpaqueLine } from '@pretext-md/layout'

function makeTextLine(overrides: Partial<TextLine> = {}): TextLine {
  return {
    kind: 'text',
    index: 0,
    blockIndex: 0,
    lineIndexInBlock: 0,
    y: 0,
    height: 25.6,
    width: 100,
    x: 0,
    fragments: [
      { text: 'Hello', x: 0, width: 50, font: '16px Inter', type: 'text', meta: undefined },
    ],
    ...overrides,
  }
}

function makeLayout(overrides: Partial<DocumentLayout> = {}): DocumentLayout {
  return {
    lines: [makeTextLine()],
    blocks: [
      {
        index: 0,
        type: 'paragraph',
        firstLineIndex: 0,
        lineCount: 1,
        y: 0,
        height: 25.6,
        contentBox: { x: 0, y: 0, width: 375, height: 25.6 },
        meta: { type: 'paragraph' },
      },
    ],
    totalHeight: 25.6,
    containerWidth: 375,
    version: 1,
    ...overrides,
  }
}

describe('renderToHtml', () => {
  it('renders a simple paragraph', () => {
    const layout = makeLayout()
    const { html, css } = renderToHtml(layout)

    expect(html).toContain('Hello')
    expect(html).toContain('pmd-doc')
    expect(html).toContain('pmd-line')
    expect(css).toContain('.pmd-doc')
  })

  it('renders with custom class prefix', () => {
    const layout = makeLayout()
    const { html, css } = renderToHtml(layout, { classPrefix: 'md' })

    expect(html).toContain('md-doc')
    expect(css).toContain('.md-doc')
  })

  it('renders inline styles with positioning', () => {
    const layout = makeLayout()
    const { html } = renderToHtml(layout, { inlineStyles: true })

    expect(html).toContain('position:relative')
    expect(html).toContain('width:375px')
    expect(html).toContain('height:25.6px')
  })

  it('renders without wrapper when disabled', () => {
    const layout = makeLayout()
    const { html } = renderToHtml(layout, { includeWrapper: false })

    expect(html).not.toContain('pmd-doc')
  })

  it('renders strong fragments', () => {
    const layout = makeLayout({
      lines: [
        makeTextLine({
          fragments: [
            { text: 'Bold', x: 0, width: 40, font: '700 16px Inter', type: 'strong', meta: undefined },
          ],
        }),
      ],
    })
    const { html } = renderToHtml(layout)
    expect(html).toContain('<strong')
    expect(html).toContain('Bold')
  })

  it('renders emphasis fragments', () => {
    const layout = makeLayout({
      lines: [
        makeTextLine({
          fragments: [
            { text: 'Italic', x: 0, width: 40, font: 'italic 16px Inter', type: 'emphasis', meta: undefined },
          ],
        }),
      ],
    })
    const { html } = renderToHtml(layout)
    expect(html).toContain('<em')
    expect(html).toContain('Italic')
  })

  it('renders link fragments', () => {
    const layout = makeLayout({
      lines: [
        makeTextLine({
          fragments: [
            {
              text: 'Click',
              x: 0,
              width: 40,
              font: '16px Inter',
              type: 'link',
              meta: { type: 'link', href: 'https://example.com', title: 'Example' },
            },
          ],
        }),
      ],
    })
    const { html } = renderToHtml(layout)
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('title="Example"')
    expect(html).toContain('Click')
  })

  it('renders inline code fragments', () => {
    const layout = makeLayout({
      lines: [
        makeTextLine({
          fragments: [
            { text: 'code', x: 0, width: 40, font: '14px monospace', type: 'inline_code', meta: undefined },
          ],
        }),
      ],
    })
    const { html } = renderToHtml(layout)
    expect(html).toContain('<code')
    expect(html).toContain('code')
  })

  it('escapes HTML in text', () => {
    const layout = makeLayout({
      lines: [
        makeTextLine({
          fragments: [
            { text: '<script>alert("xss")</script>', x: 0, width: 100, font: '16px Inter', type: 'text', meta: undefined },
          ],
        }),
      ],
    })
    const { html } = renderToHtml(layout)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders headings with correct tags', () => {
    const layout: DocumentLayout = {
      lines: [makeTextLine()],
      blocks: [
        {
          index: 0,
          type: 'heading',
          firstLineIndex: 0,
          lineCount: 1,
          y: 0,
          height: 40,
          contentBox: { x: 0, y: 0, width: 375, height: 40 },
          meta: { type: 'heading', level: 2 },
        },
      ],
      totalHeight: 40,
      containerWidth: 375,
      version: 1,
    }
    const { html } = renderToHtml(layout)
    expect(html).toContain('<h2')
    expect(html).toContain('</h2>')
  })

  it('renders thematic break as hr', () => {
    const layout: DocumentLayout = {
      lines: [
        makeTextLine({ height: 1, fragments: [] }),
      ],
      blocks: [
        {
          index: 0,
          type: 'thematic_break',
          firstLineIndex: 0,
          lineCount: 1,
          y: 0,
          height: 1,
          contentBox: { x: 0, y: 0, width: 375, height: 1 },
          meta: { type: 'thematic_break' },
        },
      ],
      totalHeight: 1,
      containerWidth: 375,
      version: 1,
    }
    const { html } = renderToHtml(layout)
    expect(html).toContain('<hr')
  })

  it('renders code block opaque lines', () => {
    const codeLine: OpaqueLine = {
      kind: 'opaque',
      index: 0,
      blockIndex: 0,
      lineIndexInBlock: 0,
      y: 0,
      height: 100,
      width: 375,
      x: 0,
      content: {
        type: 'code_block',
        code: 'const x = 1',
        lang: 'ts',
        html: '<span class="token keyword">const</span> x = <span class="token number">1</span>',
        font: '14px monospace',
        lineHeight: 19.6,
        sourceLineCount: 1,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      },
    }
    const layout: DocumentLayout = {
      lines: [codeLine],
      blocks: [
        {
          index: 0,
          type: 'code_block',
          firstLineIndex: 0,
          lineCount: 1,
          y: 0,
          height: 100,
          contentBox: { x: 0, y: 0, width: 375, height: 100 },
          meta: { type: 'code_block', lang: 'ts', highlighted: true },
        },
      ],
      totalHeight: 100,
      containerWidth: 375,
      version: 1,
    }
    const { html } = renderToHtml(layout)
    expect(html).toContain('<pre')
    expect(html).toContain('<code>')
    expect(html).toContain('token keyword')
    expect(html).toContain('language-ts')
  })

  it('generates CSS with syntax highlighting rules', () => {
    const { css } = renderToHtml(makeLayout())
    expect(css).toContain('.token.keyword')
    expect(css).toContain('.token.string')
    expect(css).toContain('prefers-color-scheme: dark')
  })
})
