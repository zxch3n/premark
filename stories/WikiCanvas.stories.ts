import {
  mountWikiCanvas,
  type WikiCanvasController,
  type WikiNodeInput,
} from "../packages/wiki-canvas/src/index.ts";
import { color, createBadge, createButton, createGreenBadge } from "./theme.ts";

export default {
  title: "Showcase/Wiki Canvas",
  parameters: {
    layout: "fullscreen",
  },
};

// ── Template pool ─────────────────────────────────────────
// A handful of distinct markdown shapes with deliberately different lengths:
// single-paragraph micro notes, mid-size code snippets, and long-form articles
// with tables and prose. Tile bitmaps are deduped by `cacheKey`, so 1000
// sprites only ever rasterize ~15 unique canvases even though they land at
// very different heights.

type TileSize = "xs" | "s" | "m" | "l" | "xl";

interface Template {
  key: string;
  title: string;
  size: TileSize;
  build: () => string;
}

const TEMPLATES: Template[] = [
  // ── extra-small: one-liner quotes ────────────────────────
  {
    key: "quote-xs",
    title: "Quote",
    size: "xs",
    build: () => `# Quote

> Layout is what you don't notice.
`,
  },
  {
    key: "tag-xs",
    title: "Tag",
    size: "xs",
    build: () => `# Tag

\`#layout\` · \`#streaming\` · \`#canvas\`
`,
  },
  // ── small: short paragraphs ──────────────────────────────
  {
    key: "intro-s",
    title: "About",
    size: "s",
    build: () => `# About

Premark is a streaming Markdown pipeline. Three packages, one document model, zero runtime JS in the output.
`,
  },
  {
    key: "fonts-s",
    title: "Fonts",
    size: "s",
    build: () => `# Fonts

Sans: \`Inter\`. Mono: \`JetBrains Mono\`.

中文段落用于验证混合排版与禁则。
`,
  },
  {
    key: "reflect-s",
    title: "Reflection",
    size: "s",
    build: () => `# Reflection

> The best UI for a wiki isn't a sidebar tree — it's a map you can zoom into until any leaf becomes the whole world.
`,
  },
  // ── medium: typical note ─────────────────────────────────
  {
    key: "engine-m",
    title: "Layout Engine",
    size: "m",
    build: () => `# Layout Engine

Headless measurement that emits a \`DocumentLayout\`.

\`\`\`ts
const engine = createLayoutEngine({ fontTheme: "modern" })
const layout = engine.layout(markdown, 625)
\`\`\`

> Sub-pixel accurate, deterministic, no DOM required.
`,
  },
  {
    key: "parser-m",
    title: "Streaming Parser",
    size: "m",
    build: () => `# Streaming Parser

Wraps \`@lezer/markdown\` with **incremental** parsing.

- Stable prefix reuse on append
- Block-level diffing
- O(1) amortized per token
`,
  },
  {
    key: "roadmap-m",
    title: "Roadmap",
    size: "m",
    build: () => `# Roadmap

- [x] Streaming layout deltas
- [x] Wiki-canvas viewer
- [ ] Sprite atlas packing
- [ ] LOD summaries when zoomed out
- [ ] Click → focus mode
`,
  },
  // ── large: code snippets + prose ─────────────────────────
  {
    key: "perf-l",
    title: "Performance Notes",
    size: "l",
    build: () => `# Performance Notes

Tile dedupe keeps VRAM proportional to **unique** content, not node count.

| Doc size | Layout | Draw | Total |
| :--- | ---: | ---: | ---: |
| 1 KB | 0.5ms | 1.2ms | 1.7ms |
| 10 KB | 3.1ms | 4.0ms | 7.1ms |
| 100 KB | 18ms | 22ms | 40ms |

> Caching the \`Texture.from(canvas)\` lets PIXI batch upload at scale.

The masonry layout keeps tall tiles and tiny notes in the same picture without a vertical ribbon of whitespace.
`,
  },
  {
    key: "code-rust-l",
    title: "Rust",
    size: "l",
    build: () => `# Rust

\`\`\`rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub kind: BlockKind,
    pub y: f32,
    pub height: f32,
}

impl Block {
    pub fn area(&self, width: f32) -> f32 {
        self.height * width
    }
}
\`\`\`

Streaming layout in Rust mirrors the TypeScript engine closely.
`,
  },
  {
    key: "code-py-l",
    title: "Python",
    size: "l",
    build: () => `# Python

\`\`\`python
from dataclasses import dataclass

@dataclass(frozen=True)
class TileSpec:
    width: int = 625
    height: int = 625
    pixel_ratio: float = 1.0

    def memory_bytes(self) -> int:
        w = self.width * self.pixel_ratio
        h = self.height * self.pixel_ratio
        return int(w * h * 4)
\`\`\`

Back-of-envelope memory math when you scale tile count into the thousands.
`,
  },
  // ── extra-large: long-form article with table + code ─────
  {
    key: "design-xl",
    title: "Design Notes",
    size: "xl",
    build: () => `# Design Notes

Tiles as a substrate.

The canvas is unbounded; pan/zoom uses a single \`Container\` for the world. Each tile is positioned absolutely, with curve edges drawn between centroids.

- Tile width: **625px** (fixed)
- Tile height: **measured from content** (180–900px)
- Padding: 28px gutter inside each card
- Title bar: traffic-light dots + filename
- Edges: indigo curves at 13% opacity

## Masonry

Each tile drops into the shortest column. Small jitter on both axes keeps the grid from looking like a spreadsheet.

\`\`\`ts
const placements = layoutMasonry(tiles, {
  gap: 140,
  jitterX: 40,
  jitterY: 45,
  aspect: 1.6,
})
\`\`\`

## Tables

| Length | Content | Feels |
| :--- | :--- | :--- |
| xs | one-liner quote | punctuation |
| s  | short paragraph | breath |
| m  | snippet + prose | comfy |
| l  | table + code | meaty |
| xl | this very note | long read |

Influences: Premark, Obsidian's graph view, Figma's infinite canvas.
`,
  },
  {
    key: "essay-xl",
    title: "Essay",
    size: "xl",
    build: () => `# Essay

A thousand notes can look like a city from the sky.

At the smallest zoom, the grid is texture — a starfield of rectangles, lit by the occasional accent. Zoom in one click and the shapes resolve into cards. Zoom again and each card resolves into text: headings, bullets, the little red of a keyword in a code block.

The trick is that nothing on the page is an image. Every tile is a \`DocumentLayout\` produced by the same engine that drives your HTML output — rendered once to a Canvas2D bitmap, then shipped to the GPU as a PIXI sprite.

## Why tiles?

A linear list of notes always loses the shape of the thing you're writing. Graphs make the shape visible, but graph layout is slow and fiddly at scale.

Masonry splits the difference: it preserves **reading order** (columns run top-to-bottom) while letting heights vary so the eye has something to follow.

> Dense at a glance. Readable up close. Explorable by hand.

## Links

The \`[[wikilinks]]\` in these bodies are ground truth. The scanner resolves each one to a real node id and draws a curve between the centers. At 1000 nodes with ~3 outbound links each we cap the edge count so the picture doesn't fill with noise.

The edges you see at max-zoom-out are the skeleton of the graph. Zoom in and they fade into the background.
`,
  },
];

// ── Procedural note generator ─────────────────────────────

interface GeneratedNode extends WikiNodeInput {}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNotes(count: number, seed = 42): GeneratedNode[] {
  const rng = mulberry32(seed);
  const nodes: GeneratedNode[] = [];

  // Pick templates with a bias towards medium/short notes so the page has
  // breathing room instead of a wall of long articles.
  const WEIGHTS: Record<TileSize, number> = { xs: 3, s: 4, m: 4, l: 2, xl: 1 };
  const bag: Template[] = [];
  for (const t of TEMPLATES) {
    const w = WEIGHTS[t.size];
    for (let i = 0; i < w; i += 1) bag.push(t);
  }

  for (let i = 0; i < count; i += 1) {
    const template = bag[Math.floor(rng() * bag.length)];
    const id = `note-${i.toString().padStart(4, "0")}`;
    // Three random outbound links per node, no self-references.
    const linkTargets: string[] = [];
    for (let j = 0; j < 3; j += 1) {
      let target = Math.floor(rng() * count);
      if (target === i) target = (target + 1) % count;
      linkTargets.push(`note-${target.toString().padStart(4, "0")}`);
    }
    nodes.push({
      id,
      // Tile title is the template name only — every sprite sharing a
      // `cacheKey` must display the exact same bitmap, so we keep the
      // per-note number out of the bar to avoid a lie at the pixel level.
      title: template.title,
      markdown: template.build(),
      cacheKey: template.key,
      linkTargets,
    });
  }

  return nodes;
}

// ── Stats overlay HUD ─────────────────────────────────────

function buildOverlay(root: HTMLElement): {
  titleEl: HTMLElement;
  countBadge: HTMLElement;
  uniqueBadge: HTMLElement;
  edgeBadge: HTMLElement;
  renderBadge: HTMLElement;
  fitBtn: HTMLButtonElement;
  hintEl: HTMLElement;
} {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    pointer-events: none;
    z-index: 10;
  `;
  root.append(overlay);

  const title = document.createElement("div");
  title.textContent = "Wiki Canvas";
  title.style.cssText = `
    font: 600 15px/1 "Inter", sans-serif;
    color: ${color.text};
    padding: 8px 14px;
    background: ${color.surface};
    border: 1px solid ${color.border};
    border-radius: 10px;
    backdrop-filter: blur(12px);
    pointer-events: auto;
  `;
  overlay.append(title);

  const countBadge = createBadge("…");
  countBadge.style.pointerEvents = "auto";
  overlay.append(countBadge);

  const uniqueBadge = createBadge("…");
  uniqueBadge.style.pointerEvents = "auto";
  overlay.append(uniqueBadge);

  const edgeBadge = createBadge("…");
  edgeBadge.style.pointerEvents = "auto";
  overlay.append(edgeBadge);

  const renderBadge = createGreenBadge("…");
  renderBadge.style.pointerEvents = "auto";
  overlay.append(renderBadge);

  const fitBtn = createButton("Reset view");
  fitBtn.style.pointerEvents = "auto";
  fitBtn.style.marginLeft = "auto";
  overlay.append(fitBtn);

  const hintEl = document.createElement("div");
  hintEl.style.cssText = `
    position: absolute;
    bottom: 18px;
    left: 0;
    right: 0;
    text-align: center;
    font: 400 12.5px/1 "Inter", sans-serif;
    color: ${color.textMuted};
    pointer-events: none;
    z-index: 10;
  `;
  hintEl.textContent =
    "Drag to pan · scroll to zoom · each tile is rendered with Premark + drawn as a Pixi sprite.";
  root.append(hintEl);

  return {
    titleEl: title,
    countBadge,
    uniqueBadge,
    edgeBadge,
    renderBadge,
    fitBtn,
    hintEl,
  };
}

function buildShell(): { root: HTMLDivElement; stage: HTMLDivElement } {
  const root = document.createElement("div");
  root.style.cssText = `
    position: relative;
    width: 100vw;
    height: 100vh;
    background: radial-gradient(circle at 50% 30%, #1a2030 0%, ${color.bg} 70%);
    color: ${color.text};
    font-family: "Inter", -apple-system, sans-serif;
    overflow: hidden;
  `;

  const stage = document.createElement("div");
  stage.style.cssText = "position:absolute;inset:0;";
  root.append(stage);
  return { root, stage };
}

function autoCleanup(root: HTMLElement, controller: WikiCanvasController) {
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      controller.destroy();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { subtree: true, childList: true });
}

// ── Stories ───────────────────────────────────────────────

export const ThousandNotes = () => {
  const { root, stage } = buildShell();
  const hud = buildOverlay(root);
  hud.titleEl.textContent = "Wiki Canvas · 1000 notes (masonry)";
  hud.hintEl.textContent =
    "1000 notes · masonry of variable-height tiles · drag to pan · scroll or pinch to zoom · R to reset.";

  const NOTE_COUNT = 1000;
  const nodes = buildNotes(NOTE_COUNT);

  hud.countBadge.textContent = `${NOTE_COUNT} notes · width 625`;
  hud.uniqueBadge.textContent = `…`;
  hud.edgeBadge.textContent = `…`;
  hud.renderBadge.textContent = `rendering…`;

  void mountWikiCanvas(stage, {
    nodes,
    layoutMode: "masonry",
    tileHeight: 900,
    minTileHeight: 170,
    tileGap: 180,
    maxEdges: 900,
  }).then((controller) => {
    hud.uniqueBadge.textContent = `${controller.uniqueTileCount} unique tiles`;
    hud.edgeBadge.textContent = `${controller.edgeCount} wikilinks`;
    hud.renderBadge.textContent = `${controller.renderTimeMs.toFixed(1)}ms render`;
    hud.fitBtn.addEventListener("click", () => controller.fit());
    window.addEventListener("keydown", (event) => {
      if (event.key === "r" || event.key === "R") controller.fit();
    });
    autoCleanup(root, controller);
  });

  return root;
};

// ── Hand-crafted small graph (kept for design clarity) ────

const HAND_CRAFTED: WikiNodeInput[] = [
  {
    id: "premark",
    title: "premark.md",
    markdown: `# Premark

A streaming Markdown rendering pipeline. The big picture lives across these notes:

- [[layout-engine]] computes positions
- [[parser]] turns text into blocks
- [[renderer]] paints fragments
- See also: [[wiki-canvas|Wiki Canvas viewer]]

> Headless layout, **zero-JS** HTML output, sub-pixel font metrics.
`,
  },
  {
    id: "parser",
    title: "parser.md",
    markdown: `# Parser

Wraps \`@lezer/markdown\` with **incremental** parsing.

Linked from [[premark]] and [[wiki-canvas]].
`,
  },
  {
    id: "layout-engine",
    title: "layout-engine.md",
    markdown: `# Layout Engine

Headless measurement consumed by [[renderer]] and [[wiki-canvas]].

Backed by Pretext font metrics. Fed by [[parser]].
`,
  },
  {
    id: "renderer",
    title: "renderer.md",
    markdown: `# HTML Renderer

Reads \`DocumentLayout\` from [[layout-engine]]. Pairs with [[wiki-canvas]].
`,
  },
  {
    id: "wiki-canvas",
    title: "wiki-canvas.md",
    markdown: `# Wiki Canvas

A **PixiJS** viewer. Each note becomes a 625×625 sprite, drawn via Canvas2D using the [[layout-engine]].

Related: [[premark]], [[parser]], [[renderer]].
`,
  },
];

export const HandCraftedGraph = () => {
  const { root, stage } = buildShell();
  const hud = buildOverlay(root);
  hud.titleEl.textContent = "Wiki Canvas · hand-crafted graph";
  hud.hintEl.textContent =
    "Five hand-written notes that link to each other — the small reference design.";

  hud.countBadge.textContent = `${HAND_CRAFTED.length} tiles · 625 × 625`;
  hud.uniqueBadge.textContent = `${HAND_CRAFTED.length} unique bitmaps`;
  hud.edgeBadge.textContent = `…`;
  hud.renderBadge.textContent = `rendering…`;

  void mountWikiCanvas(stage, {
    nodes: HAND_CRAFTED,
    layoutMode: "graph",
  }).then((controller) => {
    hud.uniqueBadge.textContent = `${controller.uniqueTileCount} unique bitmaps`;
    hud.edgeBadge.textContent = `${controller.edgeCount} wikilinks`;
    hud.renderBadge.textContent = `${controller.renderTimeMs.toFixed(1)}ms render`;
    hud.fitBtn.addEventListener("click", () => controller.fit());
    autoCleanup(root, controller);
  });

  return root;
};
