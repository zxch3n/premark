import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import { color, enhancedCss } from "./theme.ts";

export default {
  title: "Showcase/Full Document",
};

const FULL_MD = `# Premark: Headless Markdown Layout Engine

A complete rendering pipeline for Markdown — deterministic layout, streaming updates, and zero-JS HTML output. Built for AI chat interfaces, documentation platforms, and collaborative editors.

## Typography

The engine supports the full range of inline formatting: **bold text**, _italic text_, **_bold italic_**, ~~strikethrough~~, \`inline code\`, and [hyperlinks](https://github.com). These can be freely combined within a paragraph, and the layout engine correctly measures each fragment's width using real font metrics.

中文排版同样得到完整支持。段落可以混合使用中英文内容，包括**加粗**、_斜体_和\`行内代码\`。标点符号禁则也会被正确处理，确保中文标点不会出现在行首。日本語テキストも同様にサポートされています。

### Heading Hierarchy

Headings from H1 through H6 are supported with distinct font sizes and weights. Each heading level has configurable top and bottom margins.

#### Fourth Level

##### Fifth Level — useful for API documentation

###### Sixth Level — rarely used but fully supported

## Code Blocks

### TypeScript

\`\`\`ts
import { createLayoutEngine, type LayoutStream } from "@pretext-md/layout"
import { createHighlighter } from "@pretext-md/highlight"
import { renderToHtml } from "@pretext-md/html-renderer"

interface AppConfig {
  theme: "github" | "modern" | "chinese"
  width: number
  streaming: boolean
}

async function renderDocument(markdown: string, config: AppConfig) {
  const highlighter = createHighlighter()
  const engine = createLayoutEngine({
    fontTheme: config.theme,
    highlighter,
  })

  if (config.streaming) {
    const stream = engine.createStream(config.width)
    const tokens = markdown.split(/(?<=\\s)/)
    for (const token of tokens) {
      const delta = stream.push(token)
      yield { delta, layout: stream.getLayout() }
    }
    stream.finish()
    return stream.getLayout()
  }

  return engine.layout(markdown, config.width)
}
\`\`\`

### Rust

\`\`\`rust
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub metadata: DocumentMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Block {
    Heading { level: u8, content: Vec<Inline> },
    Paragraph { content: Vec<Inline> },
    CodeBlock { lang: String, code: String },
    List { ordered: bool, items: Vec<ListItem> },
    Table { headers: Vec<Cell>, rows: Vec<Vec<Cell>> },
    BlockQuote { blocks: Vec<Block> },
    ThematicBreak,
}

impl Document {
    pub fn word_count(&self) -> usize {
        self.blocks.iter().map(|b| b.word_count()).sum()
    }

    pub fn to_plain_text(&self) -> String {
        self.blocks
            .iter()
            .map(|b| b.to_plain_text())
            .collect::<Vec<_>>()
            .join("\\n\\n")
    }
}
\`\`\`

### Python

\`\`\`python
from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional

class Theme(Enum):
    GITHUB = auto()
    MODERN = auto()
    CHINESE = auto()

@dataclass(frozen=True)
class LayoutConfig:
    width: int = 680
    theme: Theme = Theme.GITHUB
    font_size: float = 16.0
    line_height: float = 1.5
    code_font_size: float = 13.6

    def with_width(self, width: int) -> "LayoutConfig":
        return LayoutConfig(
            width=width,
            theme=self.theme,
            font_size=self.font_size,
            line_height=self.line_height,
            code_font_size=self.code_font_size,
        )
\`\`\`

## Lists

### Unordered

- **Parser** — Incremental Markdown parser with block-level diffing
  - Reuses stable prefix blocks on append
  - Supports all CommonMark block types
  - Lazy code block detection
- **Layout** — Headless measurement engine
  - Sub-pixel accurate font metrics via Pretext
  - Block-level caching with content hashing
  - Streaming delta computation
    - Tracks appended, modified, and removed lines
    - O(1) amortized per token
- **Renderer** — Zero-JS HTML output
  - Absolute positioning for pixel-perfect layout
  - Dark and light code themes
  - Scoped CSS with \`.pmd-\` prefix

### Ordered

1. Initialize the layout engine with a font theme
2. Create a streaming session or perform one-shot layout
3. Push tokens through the stream to get \`LayoutDelta\` objects
4. Render the final layout to HTML + CSS
5. The output contains no JavaScript — pure static markup
   1. Block elements use absolute positioning
   2. Text fragments use precise x/y coordinates
   3. Code blocks use Prism-tokenized HTML

## Tables

| Package | Size | Purpose | Status |
| :--- | :---: | :--- | :---: |
| \`@pretext-md/parser\` | ~8KB | Incremental Markdown parsing | Stable |
| \`@pretext-md/layout\` | ~15KB | Headless layout engine | Stable |
| \`@pretext-md/highlight\` | ~4KB | Prism syntax highlighting | Stable |
| \`@pretext-md/html-renderer\` | ~6KB | HTML + CSS generation | Stable |

| Metric | Streaming | One-shot | Notes |
| :--- | ---: | ---: | :--- |
| Parse (1KB) | 0.2ms | 0.8ms | Append fast path |
| Layout (1KB) | 0.5ms | 1.2ms | Dirty region only |
| Render (1KB) | 0.3ms | 0.3ms | Same for both |
| Total (1KB) | 1.0ms | 2.3ms | 2.3x faster streaming |

## Blockquotes

> The layout engine is the heart of Premark. It takes parsed Markdown blocks and produces a complete \`DocumentLayout\` — an array of positioned lines and blocks with exact pixel coordinates.

> **Nested quotes are fully supported:**
>
> > Each level increases the indent and adds a visual border. The text wrapping algorithm accounts for the reduced available width at each nesting level.
> >
> > > Three levels deep. The available width shrinks with each level, and the layout engine adjusts line breaks accordingly. Long text still wraps correctly even at this depth.

## Thematic Breaks

Content above the break.

---

Content below the break. The thematic break renders as a subtle horizontal line with configurable height and spacing.

---

## Conclusion

This showcase demonstrates every block type and inline format that Premark supports. The entire document is rendered through the headless layout engine — every line break, every block position, every fragment offset is computed without touching the DOM.

The output is pure HTML + CSS with **zero runtime JavaScript**. What you see is a static snapshot of the layout computation, rendered with absolute positioning for pixel-perfect accuracy.`;

// ── Dark theme ────────────────────────────────────────────

export const DarkTheme = () => {
  const highlighter = createHighlighter();
  const engine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });

  const width = Math.min(740, window.innerWidth - 80);
  const layout = engine.layout(FULL_MD, width);
  const rendered = renderToHtml(layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });

  const root = document.createElement("div");
  root.style.cssText = `
    min-height: 100vh;
    background: ${color.bg};
    color: ${color.text};
    padding: 64px 32px 96px;
    font-family: "Inter", -apple-system, sans-serif;
  `;

  const container = document.createElement("div");
  container.style.cssText = `max-width:${width}px;margin:0 auto`;
  container.innerHTML = `<style>${rendered.css}${enhancedCss}</style>${rendered.html}`;
  root.append(container);
  return root;
};

// ── Light theme ───────────────────────────────────────────

const lightEnhancedCss = `
  .pmd-fragment--link {
    color: #2563eb !important;
    text-decoration-color: rgba(37,99,235,.25) !important;
  }
  .pmd-fragment--inline_code {
    background: rgba(99,102,241,.08) !important;
    color: #4f46e5 !important;
  }
  .pmd-block--blockquote::before {
    background: rgba(99,102,241,.25) !important;
  }
  .pmd-table th,
  .pmd-table td {
    border-color: rgba(0,0,0,.08) !important;
  }
  .pmd-table th {
    background: rgba(99,102,241,.04);
  }
  .pmd-rule {
    border-top: 1px solid transparent !important;
    background: linear-gradient(90deg, transparent, rgba(99,102,241,.2), transparent) !important;
    height: 1px !important;
    top: 50% !important;
  }
  .pmd-fragment--strikethrough {
    color: #9ca3af !important;
  }
  .pmd-code {
    background:
      linear-gradient(180deg, #fafbfc, #f3f4f6),
      linear-gradient(135deg, rgba(99,102,241,.04), transparent 50%) !important;
    border: 1px solid rgba(0,0,0,.06);
    color: #1f2937 !important;
    box-shadow: 0 1px 4px rgba(0,0,0,.04);
  }
`;

export const LightTheme = () => {
  const highlighter = createHighlighter();
  const engine = createLayoutEngine({
    fontTheme: "modern",
    highlighter,
  });

  const width = Math.min(740, window.innerWidth - 80);
  const layout = engine.layout(FULL_MD, width);
  const rendered = renderToHtml(layout, {
    codeThemeCss: highlighter.getThemeCss("light"),
  });

  const root = document.createElement("div");
  root.style.cssText = `
    min-height: 100vh;
    background: #ffffff;
    color: #1f2328;
    padding: 64px 32px 96px;
    font-family: "Inter", -apple-system, sans-serif;
  `;

  const container = document.createElement("div");
  container.style.cssText = `max-width:${width}px;margin:0 auto`;
  container.innerHTML = `<style>${rendered.css}${lightEnhancedCss}</style>${rendered.html}`;
  root.append(container);
  return root;
};
