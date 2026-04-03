// ─── Font Theme ───

export interface FontTheme {
  sansFamily: string
  monoFamily: string
  baseFontSize: number
  baseLineHeight?: number
  codeFontSize?: number
  codeLineHeight?: number
}

export interface ResolvedFonts {
  body: string
  bodyBold: string
  bodyItalic: string
  bodyBoldItalic: string
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  code: string
  inlineCode: string

  // Computed values
  bodyLineHeight: number
  codeLineHeight: number
  bodyFontSize: number
  codeFontSize: number
}

export interface SpacingConfig {
  /** Margin between blocks in px */
  blockMargin: number
  /** Heading top margin multiplier (relative to blockMargin) */
  headingTopMarginMultiplier: number
  /** Code block padding */
  codeBlockPadding: { top: number; right: number; bottom: number; left: number }
  /** Blockquote left padding (per nesting level) */
  blockquoteLeftPadding: number
  /** Blockquote border width */
  blockquoteBorderWidth: number
  /** List indent per level */
  listIndent: number
  /** Table cell padding */
  tableCellPadding: { x: number; y: number }
  /** Thematic break height */
  thematicBreakHeight: number
  /** Inline code horizontal padding */
  inlineCodePadding: number
}

// ─── Presets ───

export const presets: Record<string, FontTheme> = {
  github: {
    sansFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    monoFamily:
      '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    baseFontSize: 16,
  },
  modern: {
    sansFamily: 'Inter',
    monoFamily: '"JetBrains Mono"',
    baseFontSize: 16,
  },
  chinese: {
    sansFamily:
      '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    monoFamily: '"JetBrains Mono", "Noto Sans Mono", monospace',
    baseFontSize: 16,
  },
}

// ─── Defaults ───

export const defaultSpacing: SpacingConfig = {
  blockMargin: 16,
  headingTopMarginMultiplier: 1.5,
  codeBlockPadding: { top: 16, right: 16, bottom: 16, left: 16 },
  blockquoteLeftPadding: 16,
  blockquoteBorderWidth: 4,
  listIndent: 24,
  tableCellPadding: { x: 8, y: 6 },
  thematicBreakHeight: 1,
  inlineCodePadding: 4,
}

// ─── Heading scale ───

const headingScales: Record<number, { scale: number; weight: number }> = {
  1: { scale: 2.0, weight: 700 },
  2: { scale: 1.5, weight: 700 },
  3: { scale: 1.25, weight: 700 },
  4: { scale: 1.0, weight: 700 },
  5: { scale: 0.875, weight: 700 },
  6: { scale: 0.85, weight: 700 },
}

// ─── Resolve ───

export function resolveFonts(theme: FontTheme): ResolvedFonts {
  const base = theme.baseFontSize
  const lineHeight = theme.baseLineHeight ?? 1.6
  const codeFontSize = theme.codeFontSize ?? Math.round(base * 0.875)
  const codeLineHeight = theme.codeLineHeight ?? 1.4

  const bodyLineHeight = Math.round(base * lineHeight * 100) / 100
  const codeLineHeightPx = Math.round(codeFontSize * codeLineHeight * 100) / 100

  const sans = theme.sansFamily
  const mono = theme.monoFamily

  function headingFont(level: number): string {
    const { scale, weight } = headingScales[level]
    const size = Math.round(base * scale * 100) / 100
    return `${weight} ${size}px ${sans}`
  }

  return {
    body: `${base}px ${sans}`,
    bodyBold: `700 ${base}px ${sans}`,
    bodyItalic: `italic ${base}px ${sans}`,
    bodyBoldItalic: `italic 700 ${base}px ${sans}`,
    heading1: headingFont(1),
    heading2: headingFont(2),
    heading3: headingFont(3),
    heading4: headingFont(4),
    heading5: headingFont(5),
    heading6: headingFont(6),
    code: `${codeFontSize}px ${mono}`,
    inlineCode: `${codeFontSize}px ${mono}`,

    bodyLineHeight,
    codeLineHeight: codeLineHeightPx,
    bodyFontSize: base,
    codeFontSize,
  }
}

export function resolveFontTheme(
  theme: FontTheme | string,
): FontTheme {
  if (typeof theme === 'string') {
    const preset = presets[theme]
    if (!preset) {
      throw new Error(`Unknown font theme preset: ${theme}`)
    }
    return preset
  }
  return theme
}
