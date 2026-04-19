# Layout Engine

Headless measurement that emits a `DocumentLayout` consumed by [[renderer]] and [[wiki-canvas]].

\`\`\`ts
interface BlockLayout {
y: number
height: number
contentBox: Rect
}
\`\`\`

> Sub-pixel accurate, deterministic, no DOM required.

Backed by Pretext font metrics. Fed by [[parser]].

See [[performance]] for benchmarks.
