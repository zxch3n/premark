import type { FontTheme, ResolvedFonts } from "./types.ts";

export const presets = {
  github: {
    sansFamily: '"Segoe UI", Helvetica, Arial, sans-serif',
    monoFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    baseFontSize: 16,
  },
  modern: {
    sansFamily: "Inter",
    monoFamily: '"JetBrains Mono"',
    baseFontSize: 16,
  },
  chinese: {
    sansFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    monoFamily: '"JetBrains Mono", "Noto Sans Mono", monospace',
    baseFontSize: 16,
  },
} satisfies Record<string, FontTheme>;

const headingScale = {
  1: 2.125,
  2: 1.75,
  3: 1.5,
  4: 1.25,
  5: 1.125,
  6: 1,
} as const;

function px(value: number): string {
  return `${value}px`;
}

function normalizeWeight(weight: number): number {
  return Math.min(900, Math.max(100, Math.floor(weight / 100) * 100));
}

function font(style: string, weight: number, size: number, family: string): string {
  return `${style} ${normalizeWeight(weight)} ${px(size)} ${family}`;
}

export function resolveFonts(
  theme: FontTheme | keyof typeof presets,
  overrides?: Partial<ResolvedFonts>,
): ResolvedFonts {
  const resolvedTheme: FontTheme = typeof theme === "string" ? presets[theme] : theme;
  const baseLineHeight = resolvedTheme.baseLineHeight ?? 1.6;
  const codeFontSize = resolvedTheme.codeFontSize ?? resolvedTheme.baseFontSize * 0.875;
  const codeLineHeight = resolvedTheme.codeLineHeight ?? 1.4;

  const resolved = {
    body: font("normal", 400, resolvedTheme.baseFontSize, resolvedTheme.sansFamily),
    bodyBold: font("normal", 700, resolvedTheme.baseFontSize, resolvedTheme.sansFamily),
    bodyItalic: font("italic", 400, resolvedTheme.baseFontSize, resolvedTheme.sansFamily),
    bodyBoldItalic: font("italic", 700, resolvedTheme.baseFontSize, resolvedTheme.sansFamily),
    inlineCode: font("normal", 500, codeFontSize, resolvedTheme.monoFamily),
    code: font("normal", 400, codeFontSize, resolvedTheme.monoFamily),
    heading1: font(
      "normal",
      750,
      resolvedTheme.baseFontSize * headingScale[1],
      resolvedTheme.sansFamily,
    ),
    heading2: font(
      "normal",
      740,
      resolvedTheme.baseFontSize * headingScale[2],
      resolvedTheme.sansFamily,
    ),
    heading3: font(
      "normal",
      720,
      resolvedTheme.baseFontSize * headingScale[3],
      resolvedTheme.sansFamily,
    ),
    heading4: font(
      "normal",
      700,
      resolvedTheme.baseFontSize * headingScale[4],
      resolvedTheme.sansFamily,
    ),
    heading5: font(
      "normal",
      680,
      resolvedTheme.baseFontSize * headingScale[5],
      resolvedTheme.sansFamily,
    ),
    heading6: font(
      "normal",
      660,
      resolvedTheme.baseFontSize * headingScale[6],
      resolvedTheme.sansFamily,
    ),
    fontSizes: {
      body: resolvedTheme.baseFontSize,
      code: codeFontSize,
      heading1: resolvedTheme.baseFontSize * headingScale[1],
      heading2: resolvedTheme.baseFontSize * headingScale[2],
      heading3: resolvedTheme.baseFontSize * headingScale[3],
      heading4: resolvedTheme.baseFontSize * headingScale[4],
      heading5: resolvedTheme.baseFontSize * headingScale[5],
      heading6: resolvedTheme.baseFontSize * headingScale[6],
    },
    lineHeights: {
      body: resolvedTheme.baseFontSize * baseLineHeight,
      code: codeFontSize * codeLineHeight,
      heading1: resolvedTheme.baseFontSize * headingScale[1] * 1.18,
      heading2: resolvedTheme.baseFontSize * headingScale[2] * 1.2,
      heading3: resolvedTheme.baseFontSize * headingScale[3] * 1.22,
      heading4: resolvedTheme.baseFontSize * headingScale[4] * 1.25,
      heading5: resolvedTheme.baseFontSize * headingScale[5] * 1.3,
      heading6: resolvedTheme.baseFontSize * headingScale[6] * 1.35,
    },
  } satisfies ResolvedFonts;

  return {
    ...resolved,
    ...overrides,
    fontSizes: {
      ...resolved.fontSizes,
      ...overrides?.fontSizes,
    },
    lineHeights: {
      ...resolved.lineHeights,
      ...overrides?.lineHeights,
    },
  };
}

export function createDefaultSpacing() {
  return {
    blockGap: 16,
    paragraphMarginTop: 8,
    paragraphMarginBottom: 8,
    headingMarginTop: 24,
    headingMarginBottom: 12,
    listIndent: 28,
    listMarkerGap: 10,
    blockquoteIndent: 18,
    blockquoteBorderWidth: 3,
    codePaddingX: 16,
    codePaddingY: 12,
    codeBorderRadius: 14,
    tableCellPaddingX: 12,
    tableCellPaddingY: 10,
    tableBorderWidth: 1,
    thematicBreakHeight: 24,
    imagePlaceholderHeight: 240,
  };
}
