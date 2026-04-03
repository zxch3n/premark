import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";

const highlighter = createHighlighter();
const engine = createLayoutEngine({
  fontTheme: "github",
  highlighter,
});

export function renderMarkdownStory(markdown: string, width = 680) {
  const layout = engine.layout(markdown, width);
  const rendered = renderToHtml(layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });
  const wrapper = document.createElement("div");
  wrapper.style.padding = "32px";
  wrapper.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
  return wrapper;
}
