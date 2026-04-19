import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import { createHighlighter } from "@pretext-md/highlight";
import { createLayoutEngine, type LayoutEngine } from "@pretext-md/layout";

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
  /** Number of tile bitmaps actually rasterized (`<= nodes.length` thanks to cacheKey dedupe). */
  uniqueTileCount: number;
  /** Total node count. */
  nodeCount: number;
  /** Sum of placement bounds: { width, height }. */
  worldSize: { width: number; height: number };
  /** Time spent rendering the unique tile bitmaps, in ms. */
  renderTimeMs: number;
}

interface PreparedNode extends WikiNodeInput {
  links: string[];
  cacheKey: string;
}

interface TileBitmap {
  canvas: HTMLCanvasElement;
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
  // Safe at scale because we dedupe tiles via `cacheKey`, so VRAM is tied to
  // *unique* content, not node count.
  const pixelRatio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
  const maxEdges =
    options.maxEdges ??
    (layoutMode === "masonry"
      ? DEFAULT_MAX_EDGES_MASONRY
      : layoutMode === "scatter"
        ? DEFAULT_MAX_EDGES_SCATTER
        : DEFAULT_MAX_EDGES_GRAPH);

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

  // 2. Render unique tile bitmaps. cacheKey collisions reuse a single bitmap,
  // and each unique bitmap discovers its own height from the premark layout.
  const highlighter = createHighlighter();
  const engine: LayoutEngine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });
  const innerWidth = tileWidth - TILE_CONTENT_PADDING * 2;
  const renderStart = performance.now();
  const bitmapByCacheKey = new Map<string, TileBitmap>();
  let layoutMs = 0;
  let drawMs = 0;
  for (const node of prepared) {
    if (bitmapByCacheKey.has(node.cacheKey)) continue;
    const t0 = performance.now();
    const premarkLayout = engine.layout(node.markdown, innerWidth);
    const t1 = performance.now();
    let height: number;
    if (layoutMode === "masonry") {
      const natural = premarkLayout.totalHeight + TILE_CONTENT_PADDING * 2 + TILE_TITLE_HEIGHT;
      height = Math.max(minTileHeight, Math.min(tileHeight, natural));
    } else {
      height = tileHeight;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(tileWidth * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.scale(pixelRatio, pixelRatio);
    drawTile(ctx, premarkLayout, tileWidth, height, {
      title: node.title,
      palette,
    });
    const t2 = performance.now();
    layoutMs += t1 - t0;
    drawMs += t2 - t1;
    bitmapByCacheKey.set(node.cacheKey, { canvas, width: tileWidth, height });
  }
  const renderTimeMs = performance.now() - renderStart;
  const uniqueTileCount = bitmapByCacheKey.size;
  engine.dispose();
  // eslint-disable-next-line no-console
  console.debug(
    `[wiki-canvas] ${prepared.length} nodes · ${uniqueTileCount} unique tiles → layout ${layoutMs.toFixed(2)}ms · draw ${drawMs.toFixed(2)}ms · total ${renderTimeMs.toFixed(2)}ms`,
  );

  // 3. Compute placements according to the chosen layout mode. Masonry
  // consumes the per-tile heights we just measured.
  let placements: SizedPlacement[];
  if (layoutMode === "masonry") {
    const masonryTiles = prepared.map((node) => {
      const bitmap = bitmapByCacheKey.get(node.cacheKey);
      return {
        id: node.id,
        width: bitmap?.width ?? tileWidth,
        height: bitmap?.height ?? tileHeight,
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

  // 6. Build textures (one per cacheKey) and place a sprite per node.
  const textures = new Map<string, Texture>();
  for (const [key, bitmap] of bitmapByCacheKey) {
    textures.set(key, Texture.from(bitmap.canvas));
  }

  for (const node of prepared) {
    const texture = textures.get(node.cacheKey);
    const placement = placementById.get(node.id);
    if (!texture || !placement) continue;
    const sprite = new Sprite(texture);
    sprite.position.set(placement.x, placement.y);
    sprite.width = placement.width;
    sprite.height = placement.height;
    sprite.eventMode = options.onSelect ? "static" : "none";
    sprite.cursor = options.onSelect ? "pointer" : "default";
    if (options.onSelect) {
      sprite.on("pointertap", () => options.onSelect?.(node.id));
    }
    world.addChild(sprite);
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

  return {
    destroy: () => {
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
