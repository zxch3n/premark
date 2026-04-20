import { preloadLayoutFonts, resolveFonts } from "../packages/layout/src/index.ts";

export async function waitForPremarkStoryFonts(): Promise<boolean> {
  const stylePromise = (
    window as typeof window & {
      __premarkStoryFontStylesReady?: Promise<void>;
    }
  ).__premarkStoryFontStylesReady;

  if (stylePromise !== undefined) {
    await stylePromise.catch(() => undefined);
  }

  return preloadLayoutFonts(resolveFonts("modern"));
}
