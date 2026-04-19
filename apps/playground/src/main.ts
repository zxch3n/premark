import { createHighlighter } from "@pretext-md/highlight";
import { renderToHtml } from "@pretext-md/html-renderer";
import { createLayoutEngine } from "@pretext-md/layout";

import "./style.css";
import { mountCanvasEditorApp } from "./canvas-editor/index.ts";
import { mountVisualParityApp } from "./visual-parity/index.ts";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
const mode = new URLSearchParams(window.location.search).get("mode");

const sampleMarkdown = `# @pretext-md

High-speed Markdown layout with **rich text**, \`inline code\`, tables and fenced blocks.

> The layout engine computes height without DOM measurement.

1. Stream tokens into the parser
2. Re-layout only the dirty tail
3. Render with pure HTML + CSS

| Package | Purpose |
| --- | --- |
| \`@pretext-md/parser\` | Streaming block AST |
| \`@pretext-md/layout\` | Layout IR and measurement |
| \`@pretext-md/html-renderer\` | Pure renderer |

\`\`\`ts
export function greet(name: string) {
  return \`hello, \${name}\`
}
\`\`\`
`;

const highlighter = createHighlighter();
const engine = createLayoutEngine({
  fontTheme: "github",
  highlighter,
});

function mountPlayground(root: HTMLDivElement) {
  root.innerHTML = `
  <div class="shell">
    <aside class="controls">
      <div>
        <p class="eyebrow">pretext-md</p>
        <h1>Markdown Layout Playground</h1>
        <p class="lede">Edit markdown, change width, inspect the generated layout and compare the rendered output.</p>
      </div>
      <label class="field">
        <span>Container Width</span>
        <input id="width" type="range" min="260" max="960" step="1" value="640" />
        <output id="width-value">640px</output>
      </label>
      <label class="field grow">
        <span>Markdown</span>
        <textarea id="markdown"></textarea>
      </label>
      <div class="stats">
        <div>
          <span class="label">Height</span>
          <strong id="height">0px</strong>
        </div>
        <div>
          <span class="label">Blocks</span>
          <strong id="blocks">0</strong>
        </div>
        <div>
          <span class="label">Lines</span>
          <strong id="lines">0</strong>
        </div>
      </div>
    </aside>
    <main class="preview">
      <section class="card">
        <header>
          <h2>Rendered HTML</h2>
        </header>
        <div class="canvas-wrap">
          <div id="canvas" class="canvas"></div>
        </div>
      </section>
      <section class="card">
        <header>
          <h2>Layout JSON</h2>
        </header>
        <pre id="json" class="json"></pre>
      </section>
    </main>
  </div>
`;

  const markdownInput = root.querySelector<HTMLTextAreaElement>("#markdown")!;
  const widthInput = root.querySelector<HTMLInputElement>("#width")!;
  const widthValue = root.querySelector<HTMLOutputElement>("#width-value")!;
  const heightValue = root.querySelector<HTMLElement>("#height")!;
  const blocksValue = root.querySelector<HTMLElement>("#blocks")!;
  const linesValue = root.querySelector<HTMLElement>("#lines")!;
  const canvas = root.querySelector<HTMLDivElement>("#canvas")!;
  const json = root.querySelector<HTMLPreElement>("#json")!;

  markdownInput.value = sampleMarkdown;

  function render() {
    const width = Number(widthInput.value);
    widthValue.value = `${width}px`;

    const layout = engine.layout(markdownInput.value, width);
    const rendered = renderToHtml(layout, {
      codeThemeCss: highlighter.getThemeCss("dark"),
    });

    canvas.style.width = `${width}px`;
    canvas.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
    json.textContent = JSON.stringify(layout, null, 2);
    heightValue.textContent = `${Math.round(layout.totalHeight)}px`;
    blocksValue.textContent = String(layout.blocks.length);
    linesValue.textContent = String(layout.lines.length);
  }

  markdownInput.addEventListener("input", render);
  widthInput.addEventListener("input", render);

  render();
}

if (mode === "visual-parity") {
  mountVisualParityApp(appRoot);
} else if (mode === "canvas-editor") {
  mountCanvasEditorApp(appRoot);
} else {
  mountPlayground(appRoot);
}
