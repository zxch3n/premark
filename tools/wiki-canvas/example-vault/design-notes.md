# Design Notes

Tiles as a substrate.

The canvas is unbounded; pan/zoom uses a single `Container` for the world. Each tile is positioned absolutely, with edges drawn as quadratic curves between centroids.

- Tile size: **625×625** (configurable via `tileWidth`/`tileHeight`)
- Padding: 28px gutter inside each card
- Title bar: traffic-light dots + filename
- Edges: indigo curves at 22% opacity

Influences: [[premark]], [[wiki-canvas]], Obsidian's graph view.

\`\`\`ts
gfx.moveTo(x1, y1)
.quadraticCurveTo(cx, cy, x2, y2)
.stroke({ color: accent, width: 4 })
\`\`\`
