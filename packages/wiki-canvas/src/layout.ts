export interface LayoutInput {
  id: string;
  /** targets referenced from this node (normalized ids) */
  links: string[];
}

export interface Placement {
  id: string;
  x: number;
  y: number;
}

export interface GridLayoutOptions {
  tileWidth: number;
  tileHeight: number;
  gap: number;
}

export interface ScatterLayoutOptions extends GridLayoutOptions {
  /** Random seed used to deterministically shuffle and jitter. */
  seed?: number;
  /** 0..1, how far inside its cell each tile may drift. */
  jitter?: number;
  /** Target width-to-height aspect ratio for the world. */
  aspect?: number;
}

export interface MasonryTile {
  id: string;
  width: number;
  height: number;
}

export interface MasonryOptions {
  /** Gap between tiles in px. */
  gap: number;
  /** Random seed for shuffle + jitter. */
  seed?: number;
  /** Max horizontal drift in px per tile (default 0). */
  jitterX?: number;
  /** Max vertical drift in px per tile (default 0). */
  jitterY?: number;
  /** Target world aspect ratio. */
  aspect?: number;
  /** Override the column count instead of deriving from aspect. */
  columns?: number;
}

export interface SizedPlacement extends Placement {
  width: number;
  height: number;
}

/**
 * Groups connected components via wikilink edges, then lays out each
 * component as a rectangular grid. Components are stacked top-to-bottom
 * with extra spacing between them.
 */
export function layoutNodes(inputs: LayoutInput[], options: GridLayoutOptions): Placement[] {
  const ids = inputs.map((node) => node.id);
  const byId = new Map(inputs.map((node) => [node.id, node]));

  const adjacency = new Map<string, Set<string>>();
  for (const id of ids) adjacency.set(id, new Set());
  for (const node of inputs) {
    for (const target of node.links) {
      if (!byId.has(target) || target === node.id) continue;
      adjacency.get(node.id)!.add(target);
      adjacency.get(target)!.add(node.id);
    }
  }

  const degree = (id: string) => adjacency.get(id)?.size ?? 0;
  const seen = new Set<string>();
  const components: string[][] = [];

  const seeds = [...ids].sort((a, b) => degree(b) - degree(a));
  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    const queue = [seed];
    const component: string[] = [];
    seen.add(seed);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const neighbors = [...(adjacency.get(current) ?? [])].sort((a, b) => degree(b) - degree(a));
      for (const neighbor of neighbors) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }

  const { tileWidth, tileHeight, gap } = options;
  const placements: Placement[] = [];

  // Singletons pack densely into their own grid so a repo with no wikilinks
  // still looks like a lively grid instead of a single vertical column.
  const connected = components.filter((component) => component.length > 1);
  const orphans = components.filter((component) => component.length === 1).flat();

  let cursorY = 0;
  for (const component of connected) {
    const size = component.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(size)));
    component.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      placements.push({
        id,
        x: col * (tileWidth + gap),
        y: cursorY + row * (tileHeight + gap),
      });
    });
    const rows = Math.ceil(size / cols);
    cursorY += rows * (tileHeight + gap) + gap * 3;
  }

  if (orphans.length > 0) {
    const cols = Math.max(1, Math.round(Math.sqrt(orphans.length)));
    orphans.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      placements.push({
        id,
        x: col * (tileWidth + gap),
        y: cursorY + row * (tileHeight + gap),
      });
    });
  }

  return placements;
}

/**
 * Place every tile into a jittered grid cell. Independent of edges, so it stays
 * evenly distributed for thousands of nodes — perfect for "starfield" demos.
 */
export function layoutScatter(ids: string[], options: ScatterLayoutOptions): Placement[] {
  const tileWidth = options.tileWidth;
  const tileHeight = options.tileHeight;
  const gap = options.gap;
  const jitter = options.jitter ?? 0.18;
  const aspect = options.aspect ?? 1.6;
  const seed = options.seed ?? 0xc0ffee;

  const cellW = tileWidth + gap;
  const cellH = tileHeight + gap;

  const targetCols = Math.max(1, Math.round(Math.sqrt((ids.length * aspect * cellH) / cellW)));
  const cols = targetCols;
  const total = ids.length;
  const rng = mulberry32(seed);

  // Deterministic shuffle to avoid template-clusters lining up on the grid.
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const placements: Placement[] = [];
  for (let index = 0; index < total; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const jx = (rng() - 0.5) * 2 * jitter * tileWidth;
    const jy = (rng() - 0.5) * 2 * jitter * tileHeight;
    placements.push({
      id: shuffled[index],
      x: col * cellW + jx,
      y: row * cellH + jy,
    });
  }
  return placements;
}

/**
 * Variable-height masonry: each tile drops into the currently-shortest column.
 * Gives a loose, organic packing that still avoids overlaps, which is what
 * you want for a pile of articles with different lengths. Adds small x/y
 * jitter so the columns don't look like a strict spreadsheet.
 */
export function layoutMasonry(tiles: MasonryTile[], options: MasonryOptions): SizedPlacement[] {
  const gap = options.gap;
  const jitterX = options.jitterX ?? 0;
  const jitterY = options.jitterY ?? 0;
  const aspect = options.aspect ?? 1.6;
  const rng = mulberry32(options.seed ?? 0xd00d1e);

  // Deterministic shuffle avoids banding when tiles come in by template.
  const order = [...tiles];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Derive column count from total area → aspect.
  const maxWidth = order.reduce((m, t) => Math.max(m, t.width), 0);
  const totalH = order.reduce((s, t) => s + t.height + gap, 0);
  const colStep = maxWidth + gap;
  const derivedCols = Math.max(1, Math.round(Math.sqrt(Math.max(1, (totalH * aspect) / colStep))));
  const cols = options.columns ?? derivedCols;

  const colHeights = Array.from({ length: cols }, () => 0);
  const placements: SizedPlacement[] = [];
  for (const tile of order) {
    // Shortest column wins.
    let chosen = 0;
    for (let i = 1; i < cols; i += 1) {
      if (colHeights[i] < colHeights[chosen]) chosen = i;
    }
    const baseX = chosen * colStep + (maxWidth - tile.width) / 2;
    const baseY = colHeights[chosen];
    const jx = jitterX > 0 ? (rng() - 0.5) * 2 * jitterX : 0;
    const jy = jitterY > 0 ? (rng() - 0.5) * 2 * jitterY : 0;
    placements.push({
      id: tile.id,
      x: baseX + jx,
      y: baseY + jy,
      width: tile.width,
      height: tile.height,
    });
    colHeights[chosen] += tile.height + gap;
  }
  return placements;
}

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
