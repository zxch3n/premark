import { describe, expect, it } from "vite-plus/test";

import { getLayoutFontSpecs, preloadLayoutFonts, resolveFonts } from "../src/index.ts";

describe("layout font loading", () => {
  it("lists only canvas font shorthands that affect measurement", () => {
    const fonts = resolveFonts("modern");
    const specs = getLayoutFontSpecs(fonts);
    expect(specs).toContain(fonts.body);
    expect(specs).toContain(fonts.bodyBold);
    expect(specs).toContain(fonts.inlineCode);
    expect(specs).toContain(fonts.heading1);
    expect(specs).toContain(fonts.heading6);
    expect(specs).not.toContain(String(fonts.fontSizes.body));
    expect(new Set(specs).size).toBe(specs.length);
  });

  it("is a no-op outside a browser FontFaceSet", async () => {
    await expect(preloadLayoutFonts(resolveFonts("modern"))).resolves.toBe(false);
  });
});
