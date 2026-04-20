import type { ResolvedFonts } from "./types.ts";

const DEFAULT_FONT_SAMPLE =
  "Premark Markdown controls # **bold** `code` link 中文 عربى עברית 12345 WWWW iiiii";

export interface LayoutFontPreloadOptions {
  readonly sampleText?: string;
}

export function getLayoutFontSpecs(fonts: ResolvedFonts): string[] {
  return [
    fonts.body,
    fonts.bodyBold,
    fonts.bodyItalic,
    fonts.bodyBoldItalic,
    fonts.inlineCode,
    fonts.code,
    fonts.heading1,
    fonts.heading2,
    fonts.heading3,
    fonts.heading4,
    fonts.heading5,
    fonts.heading6,
  ].filter((font, index, all) => all.indexOf(font) === index);
}

export async function preloadLayoutFonts(
  fonts: ResolvedFonts,
  options: LayoutFontPreloadOptions = {},
): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;

  const fontFaceSet = document.fonts;
  const sampleText = options.sampleText ?? DEFAULT_FONT_SAMPLE;
  try {
    await Promise.all(getLayoutFontSpecs(fonts).map((spec) => fontFaceSet.load(spec, sampleText)));
    await fontFaceSet.ready;
    return true;
  } catch {
    return false;
  }
}
