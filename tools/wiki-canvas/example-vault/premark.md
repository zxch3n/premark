# Premark

A streaming Markdown rendering pipeline split into focused packages.

- [[parser]] turns text into blocks
- [[layout-engine]] computes positions
- [[renderer]] paints fragments

> Headless layout, **zero-JS** HTML output, sub-pixel font metrics.

\`\`\`ts
const engine = createLayoutEngine({ fontTheme: "modern" })
const layout = engine.layout(markdown, 625)
\`\`\`

Used by [[wiki-canvas]] for every tile in the graph.
