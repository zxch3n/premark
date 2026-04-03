import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";

export default {
  title: "Validation/Height Accuracy",
};

export const Compare = () => {
  const markdown = `# Height Accuracy

This story compares the computed layout height to the real DOM height for the same rendered output.`;
  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
  });
  const layout = engine.layout(markdown, 520);
  const rendered = renderToHtml(layout);
  const root = document.createElement("div");
  const note = document.createElement("p");
  root.style.padding = "32px";
  root.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
  note.style.marginTop = "16px";
  note.style.font = '14px/1.5 "IBM Plex Sans", sans-serif';
  requestAnimationFrame(() => {
    const article = root.querySelector<HTMLElement>(".pmd-doc");
    note.textContent = `layout=${layout.totalHeight.toFixed(2)}px, dom=${article?.getBoundingClientRect().height.toFixed(2)}px`;
  });
  root.append(note);
  return root;
};
