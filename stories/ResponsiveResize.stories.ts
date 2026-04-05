import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import {
  color,
  createBadge,
  createGreenBadge,
  createHeader,
  createRoot,
  enhancedCss,
} from "./theme.ts";

export default {
  title: "Layout/Responsive Resize",
};

const SHOWCASE_MD = `# Responsive Layout

Drag the handle on the right edge to resize this container and watch the layout **reflow in real time**. The headless layout engine re-measures every line and repositions every block instantly.

## Rich Content Reflow

This paragraph contains **bold**, _italic_, \`inline code\`, [links](https://example.com), and ~~strikethrough~~ — all of which reflow correctly when the container width changes. 中文内容也会正确换行，包括标点禁则处理。Emoji 同样没有问题：🚀✨📐

### Code Block

\`\`\`ts
interface StreamConfig {
  containerWidth: number
  fontTheme: "github" | "modern" | "chinese"
  highlighter?: PrismHighlighter
}

export function createStream(config: StreamConfig): LayoutStream {
  const engine = createLayoutEngine(config)
  return engine.createStream(config.containerWidth)
}
\`\`\`

### Nested Lists

- Layout engine supports arbitrary nesting
  - Each level computes its own indent offset
  - Text wraps within the available width
    - Even deeply nested items reflow correctly
- Ordered lists also work:
  1. First ordered item with enough text to wrap across multiple lines in narrow containers
  2. Second item with \`code\` and **bold**

> **Note**: The \`resize()\` API recomputes layout from a previous snapshot, reusing block-level caches for blocks whose content hasn't changed. Only line breaks and vertical positions need recalculation.

### Table

| Property | Type | Default |
| :--- | :---: | ---: |
| containerWidth | \`number\` | 680 |
| fontTheme | \`string\` | "github" |
| blockGap | \`number\` | 12 |
| codePaddingX | \`number\` | 16 |

---

Try dragging from **320px** (mobile) to **1200px** (desktop) to see how every element responds.`;

export const DragToResize = () => {
  const highlighter = createHighlighter();
  const engine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });
  const codeThemeCss = highlighter.getThemeCss("dark");

  const root = createRoot();
  const header = createHeader();

  const widthBadge = createBadge("width: 680px");
  const timeBadge = createGreenBadge("resize: —");
  const heightBadge = createBadge("height: —");
  const statsRow = document.createElement("div");
  statsRow.style.cssText = "display:flex;gap:12px;align-items:center;flex:1;flex-wrap:wrap";
  statsRow.append(widthBadge, timeBadge, heightBadge);
  header.append(statsRow);

  // Content area
  const scrollArea = document.createElement("div");
  scrollArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: 40px 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(148,163,184,.15) transparent;
  `;

  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    width: 680px;
    min-width: 280px;
    max-width: 1200px;
    flex-shrink: 0;
  `;

  const surface = document.createElement("div");
  surface.style.cssText = "padding: 0 20px";

  // Right border
  const borderLine = document.createElement("div");
  borderLine.style.cssText = `
    position: absolute;
    top: 0; right: 0;
    width: 1px; height: 100%;
    background: ${color.border};
  `;

  // Resize handle
  const handle = document.createElement("div");
  handle.style.cssText = `
    position: absolute;
    top: 0; right: -8px;
    width: 16px; height: 100%;
    cursor: col-resize;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  const handleBar = document.createElement("div");
  handleBar.style.cssText = `
    width: 4px;
    height: 40px;
    border-radius: 4px;
    background: ${color.accentBorder};
    transition: background .2s ease, height .2s ease, box-shadow .2s ease;
  `;
  handle.append(handleBar);

  let dragging = false;
  handle.addEventListener("mouseenter", () => {
    handleBar.style.background = color.accent;
    handleBar.style.height = "72px";
    handleBar.style.boxShadow = `0 0 12px ${color.accentSoft}`;
  });
  handle.addEventListener("mouseleave", () => {
    if (dragging) return;
    handleBar.style.background = color.accentBorder;
    handleBar.style.height = "40px";
    handleBar.style.boxShadow = "none";
  });

  container.append(surface, borderLine, handle);
  scrollArea.append(container);
  root.append(header, scrollArea);

  // Render state
  const PAD = 40;
  let currentWidth = 680;
  let currentLayout = engine.layout(SHOWCASE_MD, currentWidth - PAD);

  function render() {
    const rendered = renderToHtml(currentLayout, { codeThemeCss });
    surface.innerHTML = `<style>${rendered.css}${enhancedCss}</style>${rendered.html}`;
    widthBadge.textContent = `width: ${currentWidth}px`;
    heightBadge.textContent = `height: ${currentLayout.totalHeight.toFixed(0)}px`;
  }

  render();

  // Drag logic
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    handleBar.style.background = color.accent;
    handleBar.style.height = "72px";
    handleBar.style.boxShadow = `0 0 16px rgba(129,140,248,.25)`;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = container.parentElement!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const newWidth = Math.max(280, Math.min(1200, (e.clientX - centerX) * 2));
    if (Math.abs(newWidth - currentWidth) < 2) return;

    currentWidth = Math.round(newWidth);
    container.style.width = `${currentWidth}px`;

    const t0 = performance.now();
    currentLayout = engine.resize(currentLayout, currentWidth - PAD);
    const ms = performance.now() - t0;
    timeBadge.textContent = `resize: ${ms.toFixed(2)}ms`;
    render();
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    handleBar.style.background = color.accentBorder;
    handleBar.style.height = "40px";
    handleBar.style.boxShadow = "none";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  return root;
};
