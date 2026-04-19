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

// ── Template shapes + procedural generators ──────────────
// Each tile mixes a random title, prose, bullets, tables, and code snippets
// drawn from shared word pools, so no two tiles render the exact same
// markdown. Tiles are therefore not deduped — VRAM scales with note count,
// which is fine at the 1K default but expensive near the 10K slider ceiling.

type TileSize = "xs" | "s" | "m" | "l" | "xl";

const TITLE_ADJ = [
  "Ambient",
  "Arcane",
  "Azure",
  "Bright",
  "Calm",
  "Celeste",
  "Cloud",
  "Crimson",
  "Dappled",
  "Dense",
  "Drifting",
  "Dusk",
  "Echo",
  "Electric",
  "Ember",
  "Fluid",
  "Focal",
  "Forest",
  "Fossil",
  "Frozen",
  "Gilded",
  "Glacial",
  "Glass",
  "Grain",
  "Harbor",
  "Hidden",
  "Hollow",
  "Iris",
  "Jade",
  "Keen",
  "Kinetic",
  "Lagoon",
  "Latent",
  "Liminal",
  "Lucid",
  "Lunar",
  "Marbled",
  "Marine",
  "Mosaic",
  "Muted",
  "Nebula",
  "Neon",
  "North",
  "Obsidian",
  "Opal",
  "Orbital",
  "Paper",
  "Pastel",
  "Plume",
  "Prism",
  "Quartz",
  "Quiet",
  "Radiant",
  "Resin",
  "Ripple",
  "Salt",
  "Silent",
  "Silver",
  "Slate",
  "Solstice",
  "Spark",
  "Stellar",
  "Tidal",
  "Timber",
  "Trace",
  "Twilight",
  "Umbra",
  "Velvet",
  "Vesper",
  "Voyager",
  "Whisper",
  "Woven",
  "Zephyr",
  "Zodiac",
];

const TITLE_NOUN = [
  "Archive",
  "Atlas",
  "Almanac",
  "Beacon",
  "Blueprint",
  "Buffer",
  "Cache",
  "Cadence",
  "Canvas",
  "Cartridge",
  "Cascade",
  "Channel",
  "Circuit",
  "Codex",
  "Compass",
  "Compiler",
  "Conduit",
  "Contour",
  "Corridor",
  "Cradle",
  "Crest",
  "Cycle",
  "Delta",
  "Dial",
  "Diagram",
  "Dialect",
  "Dossier",
  "Draft",
  "Engine",
  "Epoch",
  "Facet",
  "Filament",
  "Fixture",
  "Foyer",
  "Fragment",
  "Frame",
  "Gallery",
  "Gauge",
  "Glyph",
  "Harness",
  "Index",
  "Journal",
  "Lattice",
  "Ledger",
  "Loom",
  "Lumen",
  "Manifold",
  "Mesh",
  "Mirror",
  "Notation",
  "Notebook",
  "Orbit",
  "Parchment",
  "Pattern",
  "Pivot",
  "Portal",
  "Quiver",
  "Radar",
  "Radix",
  "Register",
  "Relay",
  "Schema",
  "Sigil",
  "Silhouette",
  "Sketchbook",
  "Spire",
  "Stanza",
  "Strand",
  "Syntax",
  "Tablet",
  "Threshold",
  "Thread",
  "Tome",
  "Totem",
  "Transcript",
  "Trellis",
  "Vessel",
  "Voxel",
];

const SUBJECTS = [
  "The streaming layout engine",
  "Each tile",
  "A well-formed document",
  "The masonry packer",
  "Our font metric loader",
  "The parser frontier",
  "Every rasterization pass",
  "An incremental diff",
  "The texture atlas",
  "A sprite at max zoom",
  "The measurement cache",
  "The viewport scheduler",
  "A fragment graph",
  "The write-through buffer",
  "The canvas world",
];

const VERBS = [
  "keeps",
  "discards",
  "packs",
  "measures",
  "amortizes",
  "reuses",
  "invalidates",
  "rasterizes",
  "commits",
  "schedules",
  "resolves",
  "stabilizes",
  "flushes",
  "tracks",
  "clamps",
  "batches",
];

const OBJECTS = [
  "its working set in a single contiguous buffer",
  "only the blocks that changed since the last frame",
  "glyph runs at subpixel precision",
  "a few kilobytes of per-document state",
  "every layout pass on a deterministic schedule",
  "incremental parses without rebuilding the tree",
  "the bitmap cache by content hash, not position",
  "rendering work proportional to what is visible",
  "unneeded textures as soon as the user zooms out",
  "line metrics from the real font, never heuristics",
  "column placement to the shortest live stack",
  "wiki references through a stable identifier map",
];

const DETAILS = [
  "Block-level diffing keeps the frontier stable across edits.",
  "Pan and zoom share a single transform matrix on the world container.",
  "Tables reflow to column widths derived from their longest cell.",
  "Headings carry their own measured line-height budget.",
  "Every code fence re-enters the parser at the language boundary.",
  "The renderer never walks the DOM — all layout is headless.",
  "Wikilinks resolve at scan time, not on every redraw.",
  "Sprites below a pixel threshold collapse to a colored rectangle.",
  "The frame loop is idle until a viewport or content change arrives.",
  "Unrendered tiles defer their canvas allocation until first paint.",
  "The hit test walks the masonry grid in column-major order.",
  "A fade gradient signals clipped content at the bottom of tall tiles.",
];

const QUOTES = [
  "Layout is a side effect of caring about type.",
  "A document is not a page.",
  "The best map is one you can zoom into.",
  "Density becomes legibility when the grid is honest.",
  "Streaming is the only honest model for text.",
  "Every pixel should know why it is there.",
  "Caches are apologies to the future.",
  "A tile is a photograph of a thought.",
  "The unit of interaction is the glance.",
  "Masonry is order in disguise.",
  "Small edits shouldn't redraw the world.",
  "The graph exists only because we drew it.",
  "A block is a block is a block.",
  "What fits in view is the whole document now.",
];

const BULLETS = [
  "Stable prefix reuse on append",
  "Deterministic column packing",
  "Block-level diffing across edits",
  "Subpixel font metrics throughout",
  "Headless measurement with zero DOM",
  "One texture per unique tile body",
  "Dropped frame budget under 4ms",
  "Lazy rasterization past the viewport",
  "Constant-time edge lookup by id",
  "Jitter preserves readability at scale",
  "Fade masks signal clipped overflow",
  "Atlas packing aligned to tile rows",
  "Graph edges culled by zoom level",
  "Incremental reparse at block boundaries",
  "Focus mode resolves to the full document",
  "Every link has a ground-truth target",
  "Tile dedupe keyed on markdown hash",
  "Cached metrics survive font swaps",
  "Wrap boundaries honor CJK punctuation",
  "Tab size is eight, by ancient decree",
];

const SUBHEADINGS = [
  "Motivation",
  "Design notes",
  "What changed",
  "Cost model",
  "Open questions",
  "Edge cases",
  "Under the hood",
  "Performance",
  "Caveats",
  "What comes next",
  "Tradeoffs",
  "Field report",
];

const TAG_WORDS = [
  "layout",
  "streaming",
  "canvas",
  "atlas",
  "parser",
  "glyph",
  "metric",
  "block",
  "inline",
  "fragment",
  "tile",
  "sprite",
  "diff",
  "patch",
  "graph",
  "zoom",
  "viewport",
  "cache",
  "font",
  "cjk",
  "scroll",
  "masonry",
];

const TABLE_COLS = [
  "Metric",
  "Value",
  "Budget",
  "Observed",
  "Delta",
  "Phase",
  "Scope",
  "Owner",
  "Tick",
  "Count",
  "Ratio",
  "Status",
  "Size",
  "Target",
  "Layer",
];

const TABLE_ROW_LABELS = [
  "Small",
  "Medium",
  "Large",
  "Tiny",
  "Huge",
  "Warm",
  "Cold",
  "Hot",
  "Idle",
  "Busy",
  "First paint",
  "Stable frame",
  "Scroll hold",
  "Cache miss",
  "Cache hit",
  "1K notes",
  "10K notes",
  "Zoom 0.1",
  "Zoom 1.0",
  "Zoom 2.5",
];

const FUNC_NAMES = [
  "measure",
  "collect",
  "stream",
  "flush",
  "layout",
  "paint",
  "schedule",
  "diff",
  "merge",
  "scan",
  "pack",
  "resolve",
  "project",
  "quantize",
  "commit",
  "settle",
  "chunk",
];

const TYPE_PARTS = [
  "Tile",
  "Block",
  "Fragment",
  "Cache",
  "Layer",
  "Span",
  "Buffer",
  "Range",
  "Glyph",
  "Metric",
  "Spec",
  "Frame",
  "Scene",
  "Node",
  "Edge",
];

const FIELD_NAMES = [
  "width",
  "height",
  "offset",
  "count",
  "stride",
  "phase",
  "alpha",
  "tint",
  "bucket",
  "cursor",
  "capacity",
  "baseline",
  "gap",
  "delta",
  "ticks",
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function sampleN<T>(arr: T[], n: number, rng: () => number): T[] {
  const picked: T[] = [];
  const used = new Set<number>();
  const target = Math.min(n, arr.length);
  while (picked.length < target) {
    const idx = Math.floor(rng() * arr.length);
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(arr[idx]!);
  }
  return picked;
}

function rollInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function randomTitle(rng: () => number): string {
  return `${pick(TITLE_ADJ, rng)} ${pick(TITLE_NOUN, rng)}`;
}

function paragraph(rng: () => number, sentences: number): string {
  const parts: string[] = [];
  const subjectSentences = Math.ceil(sentences / 2);
  for (let i = 0; i < subjectSentences; i += 1) {
    parts.push(`${pick(SUBJECTS, rng)} ${pick(VERBS, rng)} ${pick(OBJECTS, rng)}.`);
  }
  for (let i = subjectSentences; i < sentences; i += 1) {
    parts.push(pick(DETAILS, rng));
  }
  return parts.join(" ");
}

function quoteBlock(rng: () => number): string {
  return `> ${pick(QUOTES, rng)}`;
}

function bulletList(rng: () => number, n: number): string {
  return sampleN(BULLETS, n, rng)
    .map((b) => `- ${b}`)
    .join("\n");
}

function checklist(rng: () => number, n: number): string {
  return sampleN(BULLETS, n, rng)
    .map((b, i) => `- [${i % 3 === 0 ? "x" : " "}] ${b}`)
    .join("\n");
}

function inlineTags(rng: () => number): string {
  return sampleN(TAG_WORDS, 3, rng)
    .map((t) => `\`#${t}\``)
    .join(" · ");
}

function codeBlockTs(rng: () => number): string {
  const fn = pick(FUNC_NAMES, rng);
  const type = capitalize(pick(TYPE_PARTS, rng)) + capitalize(pick(TYPE_PARTS, rng));
  const a = pick(FIELD_NAMES, rng);
  let b = pick(FIELD_NAMES, rng);
  while (b === a) b = pick(FIELD_NAMES, rng);
  const n1 = rollInt(rng, 4, 999);
  const n2 = rollInt(rng, 100, 9999);
  return [
    "```ts",
    `interface ${type} {`,
    `  ${a}: number`,
    `  ${b}: number`,
    "}",
    "",
    `export function ${fn}(input: ${type}): number {`,
    `  return input.${a} * ${n1} + input.${b} * ${n2};`,
    "}",
    "```",
  ].join("\n");
}

function codeBlockRust(rng: () => number): string {
  const struct = capitalize(pick(TYPE_PARTS, rng)) + capitalize(pick(TYPE_PARTS, rng));
  const a = pick(FIELD_NAMES, rng);
  let b = pick(FIELD_NAMES, rng);
  while (b === a) b = pick(FIELD_NAMES, rng);
  const method = pick(FUNC_NAMES, rng);
  return [
    "```rust",
    "#[derive(Debug, Clone)]",
    `pub struct ${struct} {`,
    `    pub ${a}: f32,`,
    `    pub ${b}: usize,`,
    "}",
    "",
    `impl ${struct} {`,
    `    pub fn ${method}(&self) -> f32 {`,
    `        self.${a} * self.${b} as f32`,
    "    }",
    "}",
    "```",
  ].join("\n");
}

function codeBlockPython(rng: () => number): string {
  const cls = capitalize(pick(TYPE_PARTS, rng)) + capitalize(pick(TYPE_PARTS, rng));
  const a = pick(FIELD_NAMES, rng);
  let b = pick(FIELD_NAMES, rng);
  while (b === a) b = pick(FIELD_NAMES, rng);
  const method = pick(FUNC_NAMES, rng);
  const defA = rollInt(rng, 10, 999);
  const defB = (rng() * 10).toFixed(2);
  return [
    "```python",
    "@dataclass(frozen=True)",
    `class ${cls}:`,
    `    ${a}: int = ${defA}`,
    `    ${b}: float = ${defB}`,
    "",
    `    def ${method}(self) -> float:`,
    `        return self.${a} * self.${b}`,
    "```",
  ].join("\n");
}

const CODE_BLOCK_FLAVORS = [codeBlockTs, codeBlockRust, codeBlockPython];

function codeBlock(rng: () => number): string {
  return pick(CODE_BLOCK_FLAVORS, rng)(rng);
}

function tableBlock(rng: () => number): string {
  const colCount = rollInt(rng, 3, 4);
  const cols = sampleN(TABLE_COLS, colCount, rng);
  const header = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => ":---").join(" | ")} |`;
  const rowCount = rollInt(rng, 3, 5);
  const labels = sampleN(TABLE_ROW_LABELS, rowCount, rng);
  const units = ["ms", "KB", "%", "px", "fps"];
  const rows: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const cells: string[] = [labels[i]!];
    for (let c = 1; c < colCount; c += 1) {
      if (rng() < 0.5) {
        cells.push(`${rollInt(rng, 1, 99)}${pick(units, rng)}`);
      } else {
        cells.push((rng() * 10).toFixed(rng() < 0.5 ? 1 : 2));
      }
    }
    rows.push(`| ${cells.join(" | ")} |`);
  }
  return [header, sep, ...rows].join("\n");
}

interface TemplateShape {
  size: TileSize;
  build: (rng: () => number, title: string) => string;
}

const TEMPLATES: TemplateShape[] = [
  // xs — one-liner
  {
    size: "xs",
    build: (rng, title) => `# ${title}\n\n${quoteBlock(rng)}\n`,
  },
  {
    size: "xs",
    build: (rng, title) => `# ${title}\n\n${inlineTags(rng)}\n`,
  },
  // s — short paragraph
  {
    size: "s",
    build: (rng, title) => `# ${title}\n\n${paragraph(rng, 2)}\n`,
  },
  {
    size: "s",
    build: (rng, title) => `# ${title}\n\n${paragraph(rng, 1)}\n\n${quoteBlock(rng)}\n`,
  },
  // m — prose + code / bullets / checklist
  {
    size: "m",
    build: (rng, title) => `# ${title}\n\n${paragraph(rng, 2)}\n\n${codeBlock(rng)}\n`,
  },
  {
    size: "m",
    build: (rng, title) => `# ${title}\n\n${paragraph(rng, 1)}\n\n${bulletList(rng, 4)}\n`,
  },
  {
    size: "m",
    build: (rng, title) => `# ${title}\n\n${paragraph(rng, 1)}\n\n${checklist(rng, 4)}\n`,
  },
  // l — table + prose, or long code + prose
  {
    size: "l",
    build: (rng, title) =>
      `# ${title}\n\n${paragraph(rng, 2)}\n\n${tableBlock(rng)}\n\n${quoteBlock(rng)}\n`,
  },
  {
    size: "l",
    build: (rng, title) =>
      `# ${title}\n\n${paragraph(rng, 1)}\n\n${codeBlock(rng)}\n\n${paragraph(rng, 1)}\n`,
  },
  // xl — long-form article
  {
    size: "xl",
    build: (rng, title) =>
      `# ${title}\n\n${paragraph(rng, 3)}\n\n## ${pick(SUBHEADINGS, rng)}\n\n${bulletList(rng, 5)}\n\n## ${pick(SUBHEADINGS, rng)}\n\n${paragraph(rng, 2)}\n\n${codeBlock(rng)}\n\n${tableBlock(rng)}\n\n${paragraph(rng, 2)}\n`,
  },
  {
    size: "xl",
    build: (rng, title) =>
      `# ${title}\n\n${paragraph(rng, 3)}\n\n${quoteBlock(rng)}\n\n## ${pick(SUBHEADINGS, rng)}\n\n${paragraph(rng, 3)}\n\n${codeBlock(rng)}\n\n## ${pick(SUBHEADINGS, rng)}\n\n${paragraph(rng, 2)}\n\n${bulletList(rng, 5)}\n`,
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
  const bag: TemplateShape[] = [];
  for (const t of TEMPLATES) {
    const w = WEIGHTS[t.size];
    for (let i = 0; i < w; i += 1) bag.push(t);
  }

  for (let i = 0; i < count; i += 1) {
    const template = bag[Math.floor(rng() * bag.length)]!;
    const id = `note-${i.toString().padStart(4, "0")}`;
    const title = randomTitle(rng);
    const markdown = template.build(rng, title);

    const linkTargets: string[] = [];
    for (let j = 0; j < 3; j += 1) {
      let target = Math.floor(rng() * count);
      if (target === i) target = (target + 1) % count;
      linkTargets.push(`note-${target.toString().padStart(4, "0")}`);
    }

    nodes.push({
      id,
      title,
      markdown,
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

// The default note count for the procedural showcase. Each tile gets its own
// unique markdown, so every node triggers a fresh parse+layout+rasterization
// on the main thread. Keeping this modest so the page opens quickly; the
// `noteCount` slider in Storybook's Controls panel lets you push it up.
const NOTE_COUNT = 250;

interface MasonryStoryArgs {
  /** How many tiles to drop on the canvas. */
  noteCount: number;
  /** Max tile height in px — content taller than this gets clipped with a fade. */
  maxTileHeight: number;
  /** Min tile height in px — keeps one-liner notes from collapsing to a strip. */
  minTileHeight: number;
  /** Gap between tiles in px. */
  tileGap: number;
  /** Hard cap on cross-tile edges drawn. */
  maxEdges: number;
}

export const ThousandNotes = {
  render: (args: MasonryStoryArgs) => {
    const { root, stage } = buildShell();
    const hud = buildOverlay(root);
    hud.titleEl.textContent = `Wiki Canvas · ${args.noteCount} notes (masonry)`;
    hud.hintEl.textContent =
      "Masonry of variable-height tiles · drag to pan · scroll or pinch to zoom · R to reset · tweak count in Controls →";

    const nodes = buildNotes(args.noteCount);

    hud.countBadge.textContent = `${args.noteCount} notes · width 625`;
    hud.uniqueBadge.textContent = `…`;
    hud.edgeBadge.textContent = `…`;
    hud.renderBadge.textContent = `rendering…`;

    void mountWikiCanvas(stage, {
      nodes,
      layoutMode: "masonry",
      tileHeight: args.maxTileHeight,
      minTileHeight: args.minTileHeight,
      tileGap: args.tileGap,
      maxEdges: args.maxEdges,
    }).then((controller) => {
      hud.uniqueBadge.textContent = `${controller.uniqueTileCount} unique tiles`;
      hud.edgeBadge.textContent = `${controller.edgeCount} wikilinks`;
      hud.renderBadge.textContent = `${controller.renderTimeMs.toFixed(1)}ms layout · paint streaming`;
      hud.fitBtn.addEventListener("click", () => controller.fit());
      window.addEventListener("keydown", (event) => {
        if (event.key === "r" || event.key === "R") controller.fit();
      });
      autoCleanup(root, controller);
    });

    return root;
  },
  args: {
    noteCount: NOTE_COUNT,
    maxTileHeight: 1000,
    minTileHeight: 170,
    tileGap: 180,
    maxEdges: 900,
  },
  argTypes: {
    noteCount: {
      control: { type: "range", min: 50, max: 2000, step: 50 },
      description:
        "How many markdown tiles to generate. Every tile is unique, so this is a main-thread parse+layout+raster cost.",
    },
    maxTileHeight: {
      control: { type: "range", min: 400, max: 1500, step: 50 },
      description: "Tile height ceiling — taller content is clipped with a fade.",
    },
    minTileHeight: {
      control: { type: "range", min: 100, max: 400, step: 10 },
      description: "Tile height floor so one-liners still have presence.",
    },
    tileGap: {
      control: { type: "range", min: 40, max: 400, step: 10 },
      description: "Gap between tiles in px.",
    },
    maxEdges: {
      control: { type: "range", min: 0, max: 3000, step: 50 },
      description: "Hard cap on the curves drawn between linked tiles.",
    },
  },
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
    hud.renderBadge.textContent = `${controller.renderTimeMs.toFixed(1)}ms layout · paint streaming`;
    hud.fitBtn.addEventListener("click", () => controller.fit());
    autoCleanup(root, controller);
  });

  return root;
};
