import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import { createHighlighter } from "@pretext-md/highlight";
import {
  createLayoutEngine,
  resolveFonts,
  type DocumentLayout,
  type LayoutEngine,
  type ResolvedFonts,
} from "@pretext-md/layout";

import { darkTilePalette, drawTile, type TilePalette } from "./canvas-draw.ts";
import {
  layoutMasonry,
  layoutNodes,
  layoutScatter,
  type LayoutInput,
  type SizedPlacement,
} from "./layout.ts";
import { extractWikilinks, normalizeTarget } from "./wikilinks.ts";

export interface WikiNodeInput {
  /** Stable id, usually a normalized path. */
  id: string;
  /** Display title (filename or first heading). */
  title: string;
  /** Markdown source. */
  markdown: string;
  /**
   * If two nodes share the same `cacheKey`, only one tile bitmap is rendered
   * and the resulting texture is reused across all sprites. Defaults to the
   * full markdown source.
   */
  cacheKey?: string;
  /**
   * Explicit cross-tile link targets (normalized ids). When provided, the
   * markdown body is no longer scanned for `[[wikilinks]]` — useful when
   * cached templates intentionally omit the link list from the rendered tile.
   */
  linkTargets?: string[];
}

export type LayoutMode = "graph" | "scatter" | "masonry";

export interface WikiCanvasOptions {
  nodes: WikiNodeInput[];
  /** Width of every tile in px (default 625). */
  tileWidth?: number;
  /**
   * Default/fallback tile height in px. In "masonry" mode this becomes the
   * *maximum* height — content taller than this gets clipped with a fade.
   * In "graph"/"scatter" modes every tile uses this exact height (default 625).
   */
  tileHeight?: number;
  /** Minimum tile height in masonry mode (default 180). */
  minTileHeight?: number;
  /** Gap between tiles in px (default 80). */
  tileGap?: number;
  palette?: TilePalette;
  pixelRatio?: number;
  /** "graph"/"scatter" keep a uniform tile size; "masonry" sizes each tile to its content. */
  layoutMode?: LayoutMode;
  /** Hard cap on rendered cross-tile edges. */
  maxEdges?: number;
  /** Optional callback when a tile is clicked. Receives the original node id. */
  onSelect?: (id: string) => void;
}

export interface WikiCanvasController {
  destroy(): void;
  fit(): void;
  app: Application;
  /** Number of cross-tile edges drawn. */
  edgeCount: number;
  /** Number of unique tile bitmaps needed (`<= nodes.length` thanks to cacheKey dedupe). */
  uniqueTileCount: number;
  /** Total node count. */
  nodeCount: number;
  /** Sum of placement bounds: { width, height }. */
  worldSize: { width: number; height: number };
  /**
   * Time spent on the synchronous layout pass (time to first interactive
   * sprite). Actual tile rasterization streams in progressively after this
   * and is not included in the number.
   */
  renderTimeMs: number;
}

interface PreparedNode extends WikiNodeInput {
  links: string[];
  cacheKey: string;
}

interface TileLayout {
  layout: DocumentLayout;
  width: number;
  height: number;
}

const DEFAULT_MAX_EDGES_GRAPH = Infinity;
const DEFAULT_MAX_EDGES_SCATTER = 2000;
const DEFAULT_MAX_EDGES_MASONRY = 1500;
const TILE_CONTENT_PADDING = 28;
const TILE_TITLE_HEIGHT = 44;

export async function mountWikiCanvas(
  container: HTMLElement,
  options: WikiCanvasOptions,
): Promise<WikiCanvasController> {
  const tileWidth = options.tileWidth ?? 625;
  const tileHeight = options.tileHeight ?? 625;
  const minTileHeight = options.minTileHeight ?? 180;
  const tileGap = options.tileGap ?? 80;
  const palette = options.palette ?? darkTilePalette;
  const layoutMode: LayoutMode = options.layoutMode ?? "graph";
  const nodeCount = options.nodes.length;
  // Render tile bitmaps at the device pixel ratio (capped at 2) so text stays
  // crisp on Retina/4K displays. CSS still displays each sprite at its logical
  // 1x size — the DPR only scales the off-screen canvas' backing store.
  const pixelRatio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
  const maxEdges =
    options.maxEdges ??
    (layoutMode === "masonry"
      ? DEFAULT_MAX_EDGES_MASONRY
      : layoutMode === "scatter"
        ? DEFAULT_MAX_EDGES_SCATTER
        : DEFAULT_MAX_EDGES_GRAPH);

  // 0. Ensure the themed fonts are fully loaded before the layout engine
  // measures text. `canvas.measureText` returns fallback-font widths if the
  // real font (e.g. Inter) is still downloading, and the rasterizer paints
  // later when the font is ready — producing text that no longer matches the
  // layout, with visible overflow or clipping. `document.fonts.ready` alone
  // can resolve before Inter has even been requested, so we kick off loads
  // for each canvas-font string the engine will use.
  const resolvedFonts: ResolvedFonts = resolveFonts("modern");
  await preloadCanvasFonts(resolvedFonts);

  // 1. Build node + link metadata.
  const prepared: PreparedNode[] = options.nodes.map((node) => {
    const links = node.linkTargets
      ? dedupe(node.linkTargets.map(normalizeTarget))
      : dedupe(extractWikilinks(node.markdown).map((link) => normalizeTarget(link.target)));
    return {
      ...node,
      links,
      cacheKey: node.cacheKey ?? node.markdown,
    };
  });
  const nodeIds = new Set(prepared.map((node) => node.id));

  // 2. Phase A: layout every unique cacheKey. This gives us tile heights
  // (needed for placement) and a reusable DocumentLayout for the paint phase.
  // No canvas rasterization happens here — that's deferred to Phase C so the
  // viewer can show sprites as soon as possible.
  const highlighter = createHighlighter();
  const engine: LayoutEngine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });
  const innerWidth = tileWidth - TILE_CONTENT_PADDING * 2;
  const layoutByCacheKey = new Map<string, TileLayout>();
  const layoutStart = performance.now();
  for (const node of prepared) {
    if (layoutByCacheKey.has(node.cacheKey)) continue;
    const premarkLayout = engine.layout(node.markdown, innerWidth);
    let height: number;
    if (layoutMode === "masonry") {
      const natural = premarkLayout.totalHeight + TILE_CONTENT_PADDING * 2 + TILE_TITLE_HEIGHT;
      height = Math.max(minTileHeight, Math.min(tileHeight, natural));
    } else {
      height = tileHeight;
    }
    layoutByCacheKey.set(node.cacheKey, {
      layout: premarkLayout,
      width: tileWidth,
      height,
    });
  }
  const renderTimeMs = performance.now() - layoutStart;
  const uniqueTileCount = layoutByCacheKey.size;
  // eslint-disable-next-line no-console
  console.debug(
    `[wiki-canvas] ${prepared.length} nodes · ${uniqueTileCount} unique tiles · layout ${renderTimeMs.toFixed(2)}ms (paint runs progressively)`,
  );

  // 3. Compute placements according to the chosen layout mode. Masonry
  // consumes the per-tile heights we just measured.
  let placements: SizedPlacement[];
  if (layoutMode === "masonry") {
    const masonryTiles = prepared.map((node) => {
      const tl = layoutByCacheKey.get(node.cacheKey);
      return {
        id: node.id,
        width: tl?.width ?? tileWidth,
        height: tl?.height ?? tileHeight,
      };
    });
    placements = layoutMasonry(masonryTiles, {
      gap: tileGap,
      jitterX: tileGap * 0.3,
      jitterY: tileGap * 0.35,
      aspect: 1.6,
    });
  } else if (layoutMode === "scatter") {
    placements = layoutScatter(
      prepared.map((n) => n.id),
      {
        tileWidth,
        tileHeight,
        gap: tileGap,
      },
    ).map((p) => ({ ...p, width: tileWidth, height: tileHeight }));
  } else {
    const layoutInputs: LayoutInput[] = prepared.map((node) => ({
      id: node.id,
      links: node.links.filter((target) => nodeIds.has(target) && target !== node.id),
    }));
    placements = layoutNodes(layoutInputs, { tileWidth, tileHeight, gap: tileGap }).map((p) => ({
      ...p,
      width: tileWidth,
      height: tileHeight,
    }));
  }
  const placementById = new Map(placements.map((p) => [p.id, p]));

  // 4. World bounds.
  const worldWidth = placements.reduce(
    (max, placement) => Math.max(max, placement.x + placement.width),
    0,
  );
  const worldHeight = placements.reduce(
    (max, placement) => Math.max(max, placement.y + placement.height),
    0,
  );

  // 5. PIXI app.
  const app = new Application();
  await app.init({
    resizeTo: container,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: pixelRatio,
    powerPreference: "high-performance",
  });

  Object.assign(app.canvas.style, {
    width: "100%",
    height: "100%",
    display: "block",
  });
  container.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const edgesGfx = new Graphics();
  world.addChild(edgesGfx);

  // 6. Phase B: place a sprite per node using a shared placeholder texture.
  // The viewer is interactive immediately — real tile bitmaps stream in
  // during Phase C, prioritized by distance to the viewport center.
  const placeholderTexture = createPlaceholderTexture(palette);
  const spriteByNodeId = new Map<string, Sprite>();

  for (const node of prepared) {
    const placement = placementById.get(node.id);
    if (!placement) continue;
    const sprite = new Sprite(placeholderTexture);
    sprite.position.set(placement.x, placement.y);
    sprite.width = placement.width;
    sprite.height = placement.height;
    sprite.eventMode = options.onSelect ? "static" : "none";
    sprite.cursor = options.onSelect ? "pointer" : "default";
    if (options.onSelect) {
      sprite.on("pointertap", () => options.onSelect?.(node.id));
    }
    world.addChild(sprite);
    spriteByNodeId.set(node.id, sprite);
  }

  // 7. Draw edges between linked tiles. Big graphs get thinner, fainter strokes
  // so the constellation doesn't devolve into a wall of curves.
  const edgeAlpha = nodeCount > 400 ? 0.08 : nodeCount > 100 ? 0.14 : 0.22;
  const edgeWidth = nodeCount > 400 ? 3 : 4;
  let edgeCount = 0;
  const seenEdges = new Set<string>();
  outer: for (const node of prepared) {
    const from = placementById.get(node.id);
    if (!from) continue;
    for (const target of node.links) {
      if (!nodeIds.has(target)) continue;
      const key = node.id < target ? `${node.id}|${target}` : `${target}|${node.id}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const to = placementById.get(target);
      if (!to) continue;
      const fromX = from.x + from.width / 2;
      const fromY = from.y + from.height / 2;
      const toX = to.x + to.width / 2;
      const toY = to.y + to.height / 2;
      drawEdge(edgesGfx, fromX, fromY, toX, toY, palette.accent, edgeWidth, edgeAlpha);
      edgeCount += 1;
      if (edgeCount >= maxEdges) break outer;
    }
  }

  // 8. Pan/zoom. For giant worlds the "fit everything" scale shrinks each
  // tile to illegible specks — clamp the initial view to something readable
  // and let the user zoom out if they want the full constellation.
  const minScale = layoutMode === "graph" ? 0.05 : 0.015;
  const view = createPanZoom(app, world, container, {
    worldWidth,
    worldHeight,
    minScale,
    maxScale: 2.5,
    initialMinScale: layoutMode === "graph" ? 0 : 0.28,
  });
  view.fit();

  // 9. Phase C: progressive rasterization, prioritized by distance to the
  // current viewport center. Each iteration paints one unique cacheKey,
  // yielding to the main thread whenever the frame budget is exceeded.
  let cancelled = false;
  const paintBudgetMs = 12;

  interface PendingMember {
    nodeId: string;
    cx: number;
    cy: number;
    width: number;
    height: number;
    title: string;
  }
  interface PendingEntry {
    cacheKey: string;
    members: PendingMember[];
  }
  const pendingByCacheKey = new Map<string, PendingEntry>();
  for (const node of prepared) {
    const placement = placementById.get(node.id);
    if (!placement) continue;
    const member: PendingMember = {
      nodeId: node.id,
      cx: placement.x + placement.width / 2,
      cy: placement.y + placement.height / 2,
      width: placement.width,
      height: placement.height,
      title: node.title,
    };
    const existing = pendingByCacheKey.get(node.cacheKey);
    if (existing) {
      existing.members.push(member);
    } else {
      pendingByCacheKey.set(node.cacheKey, {
        cacheKey: node.cacheKey,
        members: [member],
      });
    }
  }

  const paintPromise = (async () => {
    let frameStart = performance.now();
    while (!cancelled && pendingByCacheKey.size > 0) {
      const center = viewportCenterInWorld(app, world);
      // Scan every pending member to find the one nearest the viewport.
      // O(n) per pick, O(n²) overall — fine for node counts in the low thousands
      // and keeps the ordering responsive to mid-paint pans.
      let bestKey: string | null = null;
      let bestDist = Infinity;
      for (const entry of pendingByCacheKey.values()) {
        for (const m of entry.members) {
          const dx = m.cx - center.x;
          const dy = m.cy - center.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestKey = entry.cacheKey;
          }
        }
      }
      if (!bestKey) break;

      const entry = pendingByCacheKey.get(bestKey)!;
      pendingByCacheKey.delete(bestKey);

      const tl = layoutByCacheKey.get(bestKey);
      if (!tl) continue;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(tl.width * pixelRatio);
      canvas.height = Math.round(tl.height * pixelRatio);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.scale(pixelRatio, pixelRatio);
      drawTile(ctx, tl.layout, tl.width, tl.height, {
        title: entry.members[0]?.title,
        palette,
      });
      const texture = Texture.from(canvas);

      for (const m of entry.members) {
        const sprite = spriteByNodeId.get(m.nodeId);
        if (!sprite) continue;
        // PIXI caches sprite.scale from the placeholder texture's dimensions;
        // re-assigning width/height after the texture swap recomputes it for
        // the real (DPR-scaled) bitmap so the tile renders at its placement.
        sprite.texture = texture;
        sprite.width = m.width;
        sprite.height = m.height;
      }

      if (performance.now() - frameStart > paintBudgetMs) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
        frameStart = performance.now();
      }
    }
    if (!cancelled) {
      engine.dispose();
      placeholderTexture.destroy(true);
    }
  })();
  // Swallow unhandled rejections — the caller can observe state via the
  // controller, and we don't want a late destroy() to surface as a log error.
  void paintPromise.catch(() => {});

  return {
    destroy: () => {
      cancelled = true;
      engine.dispose();
      app.destroy(true, { children: true, texture: true });
      view.destroy();
    },
    fit: view.fit,
    app,
    edgeCount,
    uniqueTileCount,
    nodeCount,
    worldSize: { width: worldWidth, height: worldHeight },
    renderTimeMs,
  };
}

function drawEdge(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  alpha: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = (x1 + x2) / 2 - dy * 0.08;
  const cy = (y1 + y2) / 2 + dx * 0.08;
  gfx.moveTo(x1, y1).quadraticCurveTo(cx, cy, x2, y2).stroke({ color, width, alpha, cap: "round" });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

async function preloadCanvasFonts(fonts: ResolvedFonts): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const canvasFonts = [
    fonts.body,
    fonts.bodyBold,
    fonts.bodyItalic,
    fonts.bodyBoldItalic,
    fonts.inlineCode,
    fonts.code,
    fonts.heading1,
    fonts.heading2,
    fonts.heading3,
    fonts.heading4,
    fonts.heading5,
    fonts.heading6,
  ];
  try {
    await Promise.all(canvasFonts.map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // Ignore — fall back to whatever the browser resolves.
  }
}

function createPlaceholderTexture(palette: TilePalette): Texture {
  // 64×64 stretched to every tile — loses the rounded corners during loading
  // but the gradient reads as a card at a glance and costs one canvas upload.
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, palette.background);
    gradient.addColorStop(1, palette.backgroundEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

function viewportCenterInWorld(app: Application, world: Container): { x: number; y: number } {
  const screen = app.screen;
  const scale = world.scale.x || 1;
  return {
    x: (screen.width / 2 - world.position.x) / scale,
    y: (screen.height / 2 - world.position.y) / scale,
  };
}

interface PanZoomOptions {
  worldWidth: number;
  worldHeight: number;
  minScale: number;
  maxScale: number;
  /** Floor for the initial `fit()` scale so tiles stay legible on giant worlds. */
  initialMinScale?: number;
}

function createPanZoom(
  app: Application,
  world: Container,
  container: HTMLElement,
  opts: PanZoomOptions,
) {
  let scale = 1;
  let isPanning = false;
  let panPointerId = -1;
  let lastX = 0;
  let lastY = 0;

  const apply = () => {
    world.scale.set(scale);
  };

  const fit = () => {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const padding = 60;
    const sx = (rect.width - padding * 2) / Math.max(opts.worldWidth, 1);
    const sy = (rect.height - padding * 2) / Math.max(opts.worldHeight, 1);
    const floor = Math.max(opts.minScale, opts.initialMinScale ?? 0);
    scale = clamp(Math.min(sx, sy), floor, opts.maxScale);
    world.scale.set(scale);
    // When we clamp up, the world no longer fits the viewport — center on it
    // so the user can immediately pan around.
    world.position.set(
      (rect.width - opts.worldWidth * scale) / 2,
      (rect.height - opts.worldHeight * scale) / 2,
    );
  };

  const canvas = app.canvas;
  canvas.style.touchAction = "none";

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // Ctrl/pinch = stronger zoom (trackpad pinch fires with ctrlKey=true).
    const intensity = event.ctrlKey ? 0.006 : 0.0018;
    const factor = Math.exp(-event.deltaY * intensity);
    const next = clamp(scale * factor, opts.minScale, opts.maxScale);
    if (next === scale) return;
    const wx = (px - world.position.x) / scale;
    const wy = (py - world.position.y) / scale;
    scale = next;
    world.scale.set(scale);
    world.position.set(px - wx * scale, py - wy * scale);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    isPanning = true;
    panPointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isPanning || event.pointerId !== panPointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    world.position.x += dx;
    world.position.y += dy;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== panPointerId) return;
    isPanning = false;
    panPointerId = -1;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    canvas.style.cursor = "grab";
  };

  canvas.style.cursor = "grab";
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  apply();

  return {
    fit,
    destroy: () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Re-export Text so consumers can extend overlays if needed.
export { Text };
