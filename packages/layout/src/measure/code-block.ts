import { prepare, layout } from '@chenglou/pretext'
import type { OpaqueLine, CodeBlockContent, Highlighter } from '../types.js'
import type { ResolvedFonts, SpacingConfig } from '../font-theme.js'

/**
 * Measure a code block and produce an OpaqueLine.
 * Height is computed by Pretext using pre-wrap mode.
 * Syntax highlighting is done by the optional Highlighter.
 */
export function measureCodeBlock(
  code: string,
  lang: string,
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
  maxWidth: number,
  blockIndex: number,
  highlighter?: Highlighter,
): OpaqueLine {
  const padding = spacing.codeBlockPadding
  const codeFont = fonts.code
  const codeLineHeight = fonts.codeLineHeight

  // Calculate the content width (minus padding)
  const contentWidth = maxWidth - padding.left - padding.right

  // Use Pretext to measure the code with pre-wrap
  const prepared = prepare(code || ' ', codeFont, { whiteSpace: 'pre-wrap' })
  const result = layout(prepared, contentWidth, codeLineHeight)

  const totalHeight = result.height + padding.top + padding.bottom

  // Get syntax highlighting if available
  let tokens: { content: string; tokenType: string }[][] | undefined
  let html: string | undefined

  if (highlighter && lang) {
    tokens = highlighter.tokenize(code, lang) ?? undefined
    html = highlighter.highlight(code, lang) ?? undefined
  }

  const sourceLineCount = (code.match(/\n/g) || []).length + 1

  const content: CodeBlockContent = {
    type: 'code_block',
    code,
    lang,
    tokens,
    html,
    font: codeFont,
    lineHeight: codeLineHeight,
    sourceLineCount,
    padding,
  }

  return {
    kind: 'opaque',
    index: 0, // assigned by engine
    blockIndex,
    lineIndexInBlock: 0,
    y: 0, // assigned by engine
    height: totalHeight,
    width: maxWidth,
    x: 0,
    content,
  }
}
