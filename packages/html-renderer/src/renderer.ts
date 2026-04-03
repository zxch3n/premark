import type {
  DocumentLayout,
  LayoutLine,
  TextLine,
  OpaqueLine,
  InlineFragment,
  CodeBlockContent,
  TableContent,
  BlockLayout,
} from '@pretext-md/layout'

export interface RenderOptions {
  /** Include inline styles for positioning (default: true) */
  inlineStyles?: boolean
  /** CSS class prefix (default: 'pmd') */
  classPrefix?: string
  /** Whether to include wrapper div (default: true) */
  includeWrapper?: boolean
}

/**
 * Render a DocumentLayout to an HTML string.
 */
export function renderToHtml(
  layout: DocumentLayout,
  options: RenderOptions = {},
): { html: string; css: string } {
  const prefix = options.classPrefix ?? 'pmd'
  const inlineStyles = options.inlineStyles ?? true
  const includeWrapper = options.includeWrapper ?? true

  const parts: string[] = []

  if (includeWrapper) {
    const wrapperStyle = inlineStyles
      ? ` style="position:relative;width:${layout.containerWidth}px;height:${layout.totalHeight}px"`
      : ''
    parts.push(`<div class="${prefix}-doc"${wrapperStyle}>`)
  }

  // Group lines by block
  let blockIndex = -1
  let blockLines: LayoutLine[] = []

  for (const line of layout.lines) {
    if (line.blockIndex !== blockIndex) {
      if (blockLines.length > 0) {
        parts.push(renderBlock(blockLines, layout.blocks[blockIndex], prefix, inlineStyles))
      }
      blockIndex = line.blockIndex
      blockLines = [line]
    } else {
      blockLines.push(line)
    }
  }

  // Emit last block
  if (blockLines.length > 0) {
    parts.push(renderBlock(blockLines, layout.blocks[blockIndex], prefix, inlineStyles))
  }

  if (includeWrapper) {
    parts.push('</div>')
  }

  return {
    html: parts.join('\n'),
    css: generateCss(prefix),
  }
}

function renderBlock(
  lines: LayoutLine[],
  block: BlockLayout,
  prefix: string,
  inlineStyles: boolean,
): string {
  const blockType = block.type
  const meta = block.meta

  // Determine HTML tag
  let tag = 'div'
  let cssClass = `${prefix}-block ${prefix}-${blockType}`
  const extraAttrs: string[] = []

  if (meta.type === 'heading') {
    tag = `h${meta.level}`
    cssClass = `${prefix}-heading ${prefix}-h${meta.level}`
  } else if (blockType === 'thematic_break') {
    tag = 'hr'
    cssClass = `${prefix}-hr`
  }

  const style = inlineStyles
    ? ` style="position:absolute;top:${block.y}px;left:${block.contentBox.x}px;width:${block.contentBox.width}px"`
    : ''

  if (tag === 'hr') {
    return `<hr class="${cssClass}"${style} />`
  }

  const inner = lines.map((line) => renderLine(line, prefix, inlineStyles)).join('\n')

  return `<${tag} class="${cssClass}"${style} ${extraAttrs.join(' ')}>${inner}</${tag}>`
}

function renderLine(
  line: LayoutLine,
  prefix: string,
  inlineStyles: boolean,
): string {
  if (line.kind === 'opaque') {
    return renderOpaqueLine(line, prefix, inlineStyles)
  }

  const textLine = line as TextLine
  const style = inlineStyles
    ? ` style="position:absolute;top:${line.y}px;left:${line.x}px;height:${line.height}px"`
    : ''

  const fragments = textLine.fragments
    .map((f) => renderFragment(f, prefix))
    .join('')

  return `<div class="${prefix}-line"${style}>${fragments}</div>`
}

function renderOpaqueLine(
  line: OpaqueLine,
  prefix: string,
  inlineStyles: boolean,
): string {
  const content = line.content

  if (content.type === 'code_block') {
    return renderCodeBlock(content, line, prefix, inlineStyles)
  }

  if (content.type === 'table') {
    return renderTable(content, line, prefix, inlineStyles)
  }

  return ''
}

function renderCodeBlock(
  content: CodeBlockContent,
  line: OpaqueLine,
  prefix: string,
  inlineStyles: boolean,
): string {
  const style = inlineStyles
    ? ` style="position:absolute;top:${line.y}px;left:${line.x}px;width:${line.width}px;height:${line.height}px;padding:${content.padding.top}px ${content.padding.right}px ${content.padding.bottom}px ${content.padding.left}px;font:${content.font};line-height:${content.lineHeight}px;overflow-x:auto"`
    : ''

  const langClass = content.lang ? ` language-${escapeAttr(content.lang)}` : ''

  // Use pre-highlighted HTML if available
  const codeHtml = content.html
    ? content.html
    : escapeHtml(content.code)

  return `<pre class="${prefix}-code-block${langClass}"${style}><code>${codeHtml}</code></pre>`
}

function renderTable(
  content: TableContent,
  line: OpaqueLine,
  prefix: string,
  inlineStyles: boolean,
): string {
  const style = inlineStyles
    ? ` style="position:absolute;top:${line.y}px;left:${line.x}px;width:${line.width}px"`
    : ''

  const parts: string[] = []
  parts.push(`<table class="${prefix}-table"${style}>`)

  // Header
  parts.push('<thead><tr>')
  for (let i = 0; i < content.header.length; i++) {
    const cell = content.header[i]
    const align = content.alignments[i]
    const alignAttr = align ? ` style="text-align:${align}"` : ''
    const cellHtml = cell.fragments.map((f) => renderFragment(f, prefix)).join('')
    parts.push(`<th${alignAttr}>${cellHtml}</th>`)
  }
  parts.push('</tr></thead>')

  // Body
  parts.push('<tbody>')
  for (const row of content.rows) {
    parts.push('<tr>')
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]
      const align = content.alignments[i]
      const alignAttr = align ? ` style="text-align:${align}"` : ''
      const cellHtml = cell.fragments.map((f) => renderFragment(f, prefix)).join('')
      parts.push(`<td${alignAttr}>${cellHtml}</td>`)
    }
    parts.push('</tr>')
  }
  parts.push('</tbody>')

  parts.push('</table>')
  return parts.join('\n')
}

function renderFragment(fragment: InlineFragment, prefix: string): string {
  const text = escapeHtml(fragment.text)

  switch (fragment.type) {
    case 'strong':
      return `<strong class="${prefix}-strong">${text}</strong>`
    case 'emphasis':
      return `<em class="${prefix}-em">${text}</em>`
    case 'strong_emphasis':
      return `<strong class="${prefix}-strong"><em class="${prefix}-em">${text}</em></strong>`
    case 'inline_code':
      return `<code class="${prefix}-inline-code">${text}</code>`
    case 'link': {
      const meta = fragment.meta as { type: 'link'; href: string; title?: string }
      const href = escapeAttr(meta.href)
      const title = meta.title ? ` title="${escapeAttr(meta.title)}"` : ''
      return `<a class="${prefix}-link" href="${href}"${title}>${text}</a>`
    }
    case 'strikethrough':
      return `<del class="${prefix}-del">${text}</del>`
    default:
      return text
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Generate the base CSS for the renderer.
 */
function generateCss(prefix: string): string {
  return `/* @pretext-md/html-renderer base styles */
.${prefix}-doc {
  position: relative;
  overflow: hidden;
}

.${prefix}-line {
  position: absolute;
  white-space: nowrap;
}

.${prefix}-heading {
  margin: 0;
  padding: 0;
}

.${prefix}-h1 { font-size: 2em; font-weight: 700; }
.${prefix}-h2 { font-size: 1.5em; font-weight: 700; }
.${prefix}-h3 { font-size: 1.25em; font-weight: 700; }
.${prefix}-h4 { font-size: 1em; font-weight: 700; }
.${prefix}-h5 { font-size: 0.875em; font-weight: 700; }
.${prefix}-h6 { font-size: 0.85em; font-weight: 700; }

.${prefix}-code-block {
  margin: 0;
  background: #f6f8fa;
  border-radius: 6px;
  overflow-x: auto;
  box-sizing: border-box;
}

.${prefix}-inline-code {
  background: rgba(175, 184, 193, 0.2);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 85%;
}

.${prefix}-table {
  border-collapse: collapse;
  border-spacing: 0;
  width: 100%;
}

.${prefix}-table th,
.${prefix}-table td {
  border: 1px solid #d0d7de;
  padding: 6px 8px;
}

.${prefix}-table th {
  font-weight: 700;
  background: #f6f8fa;
}

.${prefix}-strong { font-weight: 700; }
.${prefix}-em { font-style: italic; }
.${prefix}-link { color: #0969da; text-decoration: underline; }
.${prefix}-del { text-decoration: line-through; }

.${prefix}-hr {
  border: none;
  border-top: 1px solid #d0d7de;
  margin: 0;
}

/* Code syntax highlighting (Prism-compatible) */
.token.comment,
.token.prolog,
.token.doctype,
.token.cdata { color: #6e7781; font-style: italic; }
.token.punctuation { color: #24292e; }
.token.property,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted { color: #0550ae; }
.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted { color: #0a3069; }
.token.operator,
.token.entity,
.token.url { color: #24292e; }
.token.atrule,
.token.attr-value,
.token.keyword { color: #cf222e; }
.token.function,
.token.class-name { color: #8250df; }
.token.regex,
.token.important,
.token.variable { color: #953800; }

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .${prefix}-code-block { background: #161b22; color: #e6edf3; }
  .${prefix}-inline-code { background: rgba(110, 118, 129, 0.4); }
  .${prefix}-table th { background: #161b22; }
  .${prefix}-table th,
  .${prefix}-table td { border-color: #30363d; }
  .${prefix}-link { color: #58a6ff; }
  .${prefix}-hr { border-top-color: #30363d; }

  .token.comment,
  .token.prolog,
  .token.doctype,
  .token.cdata { color: #8b949e; }
  .token.punctuation { color: #e6edf3; }
  .token.property,
  .token.tag,
  .token.boolean,
  .token.number,
  .token.constant,
  .token.symbol,
  .token.deleted { color: #79c0ff; }
  .token.selector,
  .token.attr-name,
  .token.string,
  .token.char,
  .token.builtin,
  .token.inserted { color: #a5d6ff; }
  .token.operator,
  .token.entity,
  .token.url { color: #e6edf3; }
  .token.atrule,
  .token.attr-value,
  .token.keyword { color: #ff7b72; }
  .token.function,
  .token.class-name { color: #d2a8ff; }
  .token.regex,
  .token.important,
  .token.variable { color: #ffa657; }
}
`
}
