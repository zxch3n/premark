import { describe, expect, it } from "vite-plus/test";

import { createHighlighter } from "../../highlight/src/index.ts";
import { createLayoutEngine } from "../../layout/src/index.ts";

import { renderToHtml } from "../src/index.ts";

describe("renderToHtml", () => {
  it("renders text and code blocks to HTML", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      highlighter: createHighlighter(),
    });
    const layout = engine.layout("# Hello\n\n```ts\nconst x = 1\n```", 420);
    const rendered = renderToHtml(layout);
    expect(rendered.html).toContain("pmd-block");
    expect(rendered.html).toContain("language-ts");
    expect(rendered.css).toContain(".pmd-code");
  });

  it("escapes quoted font families in style attributes", () => {
    const engine = createLayoutEngine({
      fontTheme: "modern",
      highlighter: createHighlighter(),
    });
    const layout = engine.layout("Text with `inline code` here.", 600);
    const rendered = renderToHtml(layout);
    expect(rendered.html).not.toMatch(/font:[^"]*"JetBrains Mono"/);
    expect(rendered.html).toContain("&quot;JetBrains Mono&quot;");
  });
});
