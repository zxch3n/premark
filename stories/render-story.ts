import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import { color, enhancedCss } from "./theme.ts";

const highlighter = createHighlighter();
const engine = createLayoutEngine({
  fontTheme: "modern",
  highlighter,
});

export function renderMarkdownStory(markdown: string, width = 680) {
  const layout = engine.layout(markdown, width);
  const rendered = renderToHtml(layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    padding: 40px 32px;
    min-height: 100vh;
    background: ${color.bg};
    color: ${color.text};
    font-family: "Inter", -apple-system, sans-serif;
  `;
  wrapper.innerHTML = `<style>${rendered.css}${enhancedCss}</style>${rendered.html}`;
  return wrapper;
}
