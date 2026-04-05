import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import { createBadge, createButton, createHeader, createRoot, enhancedCss } from "./theme.ts";

export default {
  title: "Streaming/Long Document 120Hz",
};

// ── Long document content ─────────────────────────────────

const LONG_DOC = `# Building a High-Performance Markdown Rendering Pipeline

Modern applications demand real-time rendering of rich text content. Whether it's a collaborative editor, an AI chat interface streaming tokens, or a documentation platform handling thousands of pages — **performance is non-negotiable**.

This document demonstrates Premark's streaming layout engine rendering a substantial document at 120Hz, character by character. Every frame triggers an incremental layout pass, yet the page remains silky smooth.

## Architecture Overview

The rendering pipeline is composed of four stages, each designed for incremental updates:

1. **Parser** — An incremental Markdown parser that reuses stable prefix blocks when only the tail of the document changes. It leverages \`@lezer/markdown\` under the hood, but wraps it in a block-level diff layer.
2. **Layout Engine** — A headless measurement engine that computes precise line breaks, block positions, and total document height without touching the DOM. It caches per-block layout and invalidates only dirty regions.
3. **Syntax Highlighter** — Prism-based tokenization that runs lazily on code blocks. Tokens are cached alongside block identity, so re-highlighting is skipped for unchanged code.
4. **HTML Renderer** — Generates absolute-positioned HTML + CSS from layout data. No runtime JavaScript in the output — just static elements.

### Why Headless Layout?

Traditional Markdown renderers convert to HTML and let the browser handle layout. This is fine for static content, but falls apart when you need:

- **Predictable heights** before rendering (virtual scrolling, canvas output)
- **Streaming deltas** that tell you exactly which lines changed
- **Deterministic output** across environments (Node.js, browser, canvas)

> The layout engine measures text using \`@chenglou/pretext\`, which provides sub-pixel-accurate font metrics without requiring a live DOM. This means the same Markdown input produces identical layout on server and client.

## Streaming: The Core Innovation

When tokens arrive from an LLM, the naive approach is to re-render the entire document on every token. This is \`O(n)\` per token, making it \`O(n²)\` overall. Premark's streaming API is fundamentally different:

\`\`\`ts
const engine = createLayoutEngine({ fontTheme: "github", highlighter })
const stream = engine.createStream(containerWidth)

// Each push returns a LayoutDelta describing exactly what changed
for (const token of llmTokens) {
  const delta = stream.push(token)
  // delta.appendedLines — new lines at the bottom
  // delta.modifiedLines — lines that reflowed
  // delta.removedLineCount — lines that were merged/removed
  applyDelta(delta)  // O(delta size), not O(document size)
}
\`\`\`

The \`LayoutDelta\` object is the key abstraction. Instead of diffing two complete document layouts, the engine **tracks** changes as they happen during incremental parsing and layout. This means:

| Operation | Naive Approach | Premark Streaming |
| --- | --- | --- |
| Parse | Full reparse | Append-only fast path |
| Layout | Full relayout | Dirty-region only |
| Render | Full re-render | Delta patch |
| Complexity | O(n) per token | O(1) amortized |

### Append-Only Fast Path

When the user (or LLM) is only appending text — which is the common case for streaming — the parser detects that the existing block prefix is stable and skips straight to parsing the new tail. Combined with block-level layout caching, this makes appending a single character nearly free.

## Font Themes and Typography

Premark ships with three built-in font themes that control the entire typographic stack:

### GitHub Theme

The default theme mirrors GitHub's Markdown rendering:

- **Sans family**: \`-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial\`
- **Mono family**: \`"SFMono-Regular", Consolas, "Liberation Mono", Menlo\`
- Base font size: 16px, line height: 1.5
- Code font size: 13.6px, line height: 1.45

### Modern Theme

A cleaner, more contemporary look:

- **Sans family**: \`"Inter", "SF Pro Display", -apple-system, sans-serif\`
- **Mono family**: \`"JetBrains Mono", "Fira Code", monospace\`
- Base font size: 15px, line height: 1.6

### CJK-Optimized Theme

Specifically tuned for Chinese, Japanese, and Korean text:

- **Sans family**: \`"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif\`
- **Mono family**: \`"Noto Sans Mono", "Source Han Mono", monospace\`
- Wider line height (1.75) for better CJK readability

## Code Highlighting Deep Dive

The syntax highlighter supports a wide range of languages out of the box:

\`\`\`rust
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct LayoutCache {
    blocks: HashMap<u64, BlockLayout>,
    hit_count: usize,
    miss_count: usize,
}

impl LayoutCache {
    pub fn new() -> Self {
        Self {
            blocks: HashMap::new(),
            hit_count: 0,
            miss_count: 0,
        }
    }

    pub fn get(&mut self, hash: u64) -> Option<&BlockLayout> {
        match self.blocks.get(&hash) {
            Some(block) => {
                self.hit_count += 1;
                Some(block)
            }
            None => {
                self.miss_count += 1;
                None
            }
        }
    }

    pub fn hit_rate(&self) -> f64 {
        let total = self.hit_count + self.miss_count;
        if total == 0 { return 0.0; }
        self.hit_count as f64 / total as f64
    }
}
\`\`\`

And here's a Python example showing data processing:

\`\`\`python
import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator

@dataclass
class StreamMetrics:
    tokens_received: int = 0
    layout_passes: int = 0
    total_layout_ms: float = 0.0
    peak_frame_ms: float = 0.0
    _frame_times: list[float] = field(default_factory=list)

    @property
    def avg_layout_ms(self) -> float:
        if self.layout_passes == 0:
            return 0.0
        return self.total_layout_ms / self.layout_passes

    @property
    def p99_frame_ms(self) -> float:
        if not self._frame_times:
            return 0.0
        sorted_times = sorted(self._frame_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

async def stream_tokens(source: AsyncIterator[str]) -> StreamMetrics:
    metrics = StreamMetrics()
    async for token in source:
        metrics.tokens_received += 1
        metrics.layout_passes += 1
    return metrics
\`\`\`

## Lists, Blockquotes, and Nesting

The layout engine handles arbitrarily nested structures:

- **Top-level bullet** with some explanatory text that wraps
  - Nested bullet with \`inline code\` and **bold**
  - Another nested bullet
    - Third level with _emphasis_ and ~~strikethrough~~
    - And a [hyperlink](https://example.com) for good measure
  - Back to second level
- **Another top-level bullet** demonstrating list continuity

Ordered lists with deep nesting:

1. First item in the sequence
2. Second item with enough text to demonstrate wrapping behavior in ordered lists
   1. Nested ordered item alpha
   2. Nested ordered item beta with \`code\` and **formatting**
      1. Third-level nesting to stress-test indent calculation
      2. The layout engine computes precise marker widths for "10.", "100.", etc.
   3. Back to second level
3. Third top-level item

> **Blockquote**: This is a top-level blockquote with **bold**, _italic_, and \`code\` formatting. It demonstrates the visual indent and the left border rendering.
>
> > **Nested blockquote**: When blockquotes nest, the indent stacks and each level gets its own border. The layout engine tracks \`quoteDepth\` in the block context to compute correct offsets.
> >
> > > **Triple-nested**: Three levels deep. The text still wraps correctly, respecting the accumulated indent from all three quote levels.

## Tables with Rich Content

| Feature | Status | Performance | Notes |
| :--- | :---: | ---: | :--- |
| Incremental parsing | **Stable** | ~0.2ms | Block-level diff with prefix reuse |
| Headless layout | **Stable** | ~0.5ms | Sub-pixel accurate via Pretext |
| Streaming deltas | **Stable** | ~0.1ms | O(1) amortized per token |
| HTML renderer | **Stable** | ~0.3ms | Zero-JS output, absolute positioning |
| Canvas renderer | _Beta_ | ~2.0ms | Node.js static image generation |
| Virtual scrolling | _Planned_ | — | Delta-driven viewport updates |
| Collaborative editing | _Planned_ | — | OT/CRDT integration layer |

## Performance Characteristics

The streaming pipeline achieves its performance through several key techniques:

### Block Identity and Caching

Each parsed Markdown block carries a content hash. When the parser detects that a block's content hasn't changed (common during append-only streaming), the layout engine reuses the cached \`BlockLayout\` object directly — zero measurement, zero allocation.

### Dirty Region Tracking

When a block does change, the layout engine marks it as dirty and re-measures only that block and any subsequent blocks whose \`y\` position depends on the changed block's height. In practice, appending text to the last paragraph only re-measures that one paragraph.

### Immutable Block Objects

Block layouts are treated as immutable values. When a block is modified, a new \`BlockLayout\` object is created rather than mutating the existing one. This enables:

- Cheap equality checks (\`oldBlock === newBlock\`)
- Safe sharing across layout snapshots
- Predictable delta computation

\`\`\`ts
interface BlockLayout {
  readonly index: number
  readonly type: BlockType
  readonly y: number
  readonly height: number
  readonly contentBox: Readonly<{
    x: number; y: number; width: number; height: number
  }>
  readonly meta: Readonly<BlockMeta>
  readonly context: Readonly<BlockContext>
}
\`\`\`

## Real-World Use Cases

### AI Chat Interfaces

The primary motivation for Premark's streaming architecture. When an LLM generates a response token by token, the UI needs to:

1. Show each token as it arrives (low latency)
2. Maintain smooth scrolling and animation (high frame rate)
3. Handle long responses without degrading (linear scaling)
4. Support rich formatting — code blocks, tables, lists — mid-stream

Traditional approaches re-render the entire response on each token, which becomes quadratic. Premark's delta-based approach keeps each frame's work proportional to the change size, not the document size.

### Documentation Platforms

Static documentation sites can use Premark's Node.js support to pre-compute exact layout heights for virtual scrolling, generate Open Graph preview images via the canvas renderer, and ensure pixel-perfect consistency between server-rendered and client-rendered output.

### Collaborative Editors

The immutable block model and delta-based updates map naturally onto operational transformation (OT) and CRDT architectures. Each edit produces a minimal delta that can be serialized, transmitted, and applied on remote clients.

---

## Conclusion

This document contains **1500+ words** across headings, paragraphs, code blocks, tables, lists, and blockquotes. Every character you just watched stream in was processed through the full pipeline — parse, layout, highlight, render — at up to 120 frames per second.

The key insight: by treating layout as a **pure function** from (markdown, width) to layout, and by caching aggressively at the block level, we can achieve streaming performance that scales linearly with document size while keeping per-frame work constant.

> _"The fastest code is the code that doesn't run."_ — Every cache hit in Premark's layout engine is a measurement that didn't need to happen.
`;

// ── Story ─────────────────────────────────────────────────

export const CharacterStream120Hz = () => {
  const highlighter = createHighlighter();
  const engine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });
  const codeThemeCss = highlighter.getThemeCss("dark");

  const root = createRoot();
  const header = createHeader();

  // Stats row
  const statsRow = document.createElement("div");
  statsRow.style.cssText = "display:flex;gap:12px;align-items:center;flex:1;flex-wrap:wrap";
  const charsBadge = createBadge("chars: 0");
  const fpsBadge = createBadge("fps: —");
  const layoutBadge = createBadge("layout: —");
  const heightBadge = createBadge("height: 0px");
  statsRow.append(charsBadge, fpsBadge, layoutBadge, heightBadge);

  const controlBtn = createButton("Pause");
  header.append(statsRow, controlBtn);

  // Scrollable content
  const scrollArea = document.createElement("div");
  scrollArea.style.cssText = `flex:1;overflow-y:auto;padding:40px 32px;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.15) transparent`;

  const surface = document.createElement("div");
  surface.style.cssText = `max-width:720px;margin:0 auto`;
  scrollArea.append(surface);
  root.append(header, scrollArea);

  // Streaming state
  const contentWidth = Math.min(720, window.innerWidth - 96);
  const stream = engine.createStream(contentWidth);
  let charIndex = 0;
  let paused = false;
  let stopped = false;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let lastLayoutMs = 0;

  const CHARS_PER_FRAME = 3;

  controlBtn.addEventListener("click", () => {
    if (stopped) {
      // Full restart — rebuild stream from scratch
      charIndex = 0;
      stopped = false;
      paused = false;
      controlBtn.textContent = "Pause";
      const fresh = engine.createStream(contentWidth);
      // Replace closed stream with a fresh one by re-binding via closure
      Object.assign(stream, fresh);
      surface.innerHTML = "";
      tick();
      return;
    }
    paused = !paused;
    controlBtn.textContent = paused ? "Resume" : "Pause";
    if (!paused) tick();
  });

  function updateStats() {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsTime;
    if (elapsed >= 400) {
      const fps = (frameCount / elapsed) * 1000;
      fpsBadge.textContent = `fps: ${fps.toFixed(0)}`;
      frameCount = 0;
      lastFpsTime = now;
    }
    charsBadge.textContent = `chars: ${charIndex} / ${LONG_DOC.length}`;
    layoutBadge.textContent = `layout: ${lastLayoutMs.toFixed(2)}ms`;
    heightBadge.textContent = `height: ${stream.getLayout().totalHeight.toFixed(0)}px`;
  }

  function tick() {
    if (paused || stopped) return;
    if (charIndex >= LONG_DOC.length) {
      stream.finish();
      const rendered = renderToHtml(stream.getLayout(), { codeThemeCss });
      surface.innerHTML = `<style>${rendered.css}${enhancedCss}</style>${rendered.html}`;
      controlBtn.textContent = "Restart";
      stopped = true;
      updateStats();
      return;
    }

    const end = Math.min(charIndex + CHARS_PER_FRAME, LONG_DOC.length);
    charIndex = end;

    const t0 = performance.now();
    stream.push(LONG_DOC.slice(charIndex - CHARS_PER_FRAME, end));
    lastLayoutMs = performance.now() - t0;

    const rendered = renderToHtml(stream.getLayout(), { codeThemeCss });
    surface.innerHTML = `<style>${rendered.css}${enhancedCss}</style>${rendered.html}`;

    scrollArea.scrollTop = scrollArea.scrollHeight;
    updateStats();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  return root;
};
