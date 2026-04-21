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

  it("renders bare HTTP URLs as anchor tags", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
    });
    const layout = engine.layout("Visit https://example.com.", 420);
    const rendered = renderToHtml(layout);

    expect(rendered.html).toContain('href="https://example.com"');
    expect(rendered.html).toContain(">https://example.com</a>");
  });

  it("keeps source blank-line runs as rendered block vertical gaps", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("a\n\nb\n\n\n\nc", 420);
    const rendered = renderToHtml(layout);
    const tops = Array.from(
      rendered.html.matchAll(/class="pmd-block[^"]*" style="top:([^;]+)px/gu),
    ).map((match) => Number(match[1]));
    const lineHeight = layout.lines.find((line) => line.kind === "text")?.height ?? Number.NaN;

    expect(tops).toHaveLength(3);
    expect(tops[1]! - tops[0]!).toBeCloseTo(lineHeight * 2, 5);
    expect(tops[2]! - tops[1]!).toBeCloseTo(lineHeight * 4, 5);
  });

  it("keeps blank-only source documents as rendered surface height", () => {
    const engine = createLayoutEngine({
      fontTheme: "github",
      lineBreakMode: "source",
    });
    const layout = engine.layout("\n\n", 420);
    const rendered = renderToHtml(layout);

    expect(layout.totalHeight).toBeGreaterThan(0);
    expect(rendered.html).toContain(`height:${layout.totalHeight}px`);
    expect(rendered.html).not.toContain("pmd-block");
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
