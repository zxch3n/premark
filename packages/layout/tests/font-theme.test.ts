import { describe, it, expect } from 'vitest'
import { resolveFonts, resolveFontTheme, presets, defaultSpacing } from '../src/font-theme.js'

describe('resolveFontTheme', () => {
  it('resolves preset names', () => {
    const theme = resolveFontTheme('github')
    expect(theme.sansFamily).toContain('apple-system')
    expect(theme.baseFontSize).toBe(16)
  })

  it('passes through FontTheme objects', () => {
    const custom = { sansFamily: 'Inter', monoFamily: 'Fira Code', baseFontSize: 14 }
    expect(resolveFontTheme(custom)).toBe(custom)
  })

  it('throws for unknown preset', () => {
    expect(() => resolveFontTheme('nonexistent')).toThrow()
  })
})

describe('resolveFonts', () => {
  it('resolves body fonts', () => {
    const fonts = resolveFonts(presets.github)
    expect(fonts.body).toContain('16px')
    expect(fonts.bodyBold).toContain('700')
    expect(fonts.bodyItalic).toContain('italic')
    expect(fonts.bodyBoldItalic).toContain('italic')
    expect(fonts.bodyBoldItalic).toContain('700')
  })

  it('resolves heading fonts with correct sizes', () => {
    const fonts = resolveFonts(presets.github)
    expect(fonts.heading1).toContain('32px') // 16 * 2.0
    expect(fonts.heading2).toContain('24px') // 16 * 1.5
    expect(fonts.heading3).toContain('20px') // 16 * 1.25
  })

  it('resolves code fonts', () => {
    const fonts = resolveFonts(presets.github)
    expect(fonts.code).toContain('14px') // 16 * 0.875 = 14
    expect(fonts.code).toContain('SFMono')
  })

  it('computes line heights', () => {
    const fonts = resolveFonts(presets.github)
    expect(fonts.bodyLineHeight).toBeCloseTo(25.6, 0) // 16 * 1.6
    expect(fonts.codeLineHeight).toBeCloseTo(19.6, 0) // 14 * 1.4
  })

  it('respects custom values', () => {
    const fonts = resolveFonts({
      sansFamily: 'Inter',
      monoFamily: 'Fira Code',
      baseFontSize: 20,
      baseLineHeight: 1.5,
      codeFontSize: 16,
      codeLineHeight: 1.3,
    })
    expect(fonts.bodyLineHeight).toBeCloseTo(30, 0) // 20 * 1.5
    expect(fonts.codeLineHeight).toBeCloseTo(20.8, 0) // 16 * 1.3
  })
})

describe('defaultSpacing', () => {
  it('has sensible defaults', () => {
    expect(defaultSpacing.blockMargin).toBe(16)
    expect(defaultSpacing.codeBlockPadding.top).toBe(16)
    expect(defaultSpacing.listIndent).toBe(24)
  })
})
