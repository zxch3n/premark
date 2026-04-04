# @pretext-md

`@pretext-md` is a headless Markdown layout and rendering pipeline built around `@chenglou/pretext`.

It is designed for cases where you need more than "turn Markdown into HTML":

- deterministic layout without depending on live DOM measurement
- streaming updates for LLM-style token output
- reusable immutable block objects and block-level layout caches
- pure HTML + CSS output, plus a canvas renderer for static images
- browser and Node.js support

## Packages

- `@pretext-md/parser`: Markdown parsing and incremental block updates
- `@pretext-md/layout`: headless layout engine that produces line-level layout IR
- `@pretext-md/highlight`: Prism-based syntax highlighting
- `@pretext-md/html-renderer`: Layout IR to HTML + CSS

The repo also includes:

- `apps/playground`: interactive playground
- `stories`: Storybook coverage for layout/rendering cases
- `examples/markdown`: Markdown fixtures used by tests and render demos
- `scripts/render-markdown.ts`: canvas-based static renderer CLI

## Status

This repository is currently a monorepo and not yet published as npm packages. The source of truth is the workspace in this repository.

The code examples below use package names as the intended public surface. Inside this repo, run `vp run build` first if you want to consume the built workspace packages directly.

## Requirements

- Node.js `>= 22.12.0`
- `vp` from Vite+

Install dependencies:

```bash
vp install
```

## Quick Start

### 1. Create a layout engine

```ts
import { createLayoutEngine } from "@pretext-md/layout";
import { createHighlighter } from "@pretext-md/highlight";

const engine = createLayoutEngine({
  fontTheme: "github",
  highlighter: createHighlighter(),
  theme: "light",
});
```

### 2. Layout Markdown

```ts
const markdown = `# Hello

This is **bold**, _italic_, and \`inline code\`.

\`\`\`ts
console.log("hello");
\`\`\`
`;

const layout = engine.layout(markdown, 720);

console.log(layout.totalHeight);
console.log(layout.blocks.length);
console.log(layout.lines.length);
```

`layout()` returns a `DocumentLayout` with:

- `blocks`: block-level summaries with geometry and metadata
- `lines`: flattened line list for virtual scrolling or custom rendering
- `totalHeight`: final document height
- `containerWidth`: width used for layout
- `version`: monotonically increasing layout version

### 3. Render to HTML + CSS

```ts
import { renderToHtml } from "@pretext-md/html-renderer";

const { html, css } = renderToHtml(layout, {
  codeThemeCss: createHighlighter().getThemeCss("light"),
});
```

The renderer returns a ready-to-embed HTML string and CSS string. The layout is already computed, so no client-side re-measurement is required.

## Streaming Layout

The layout engine can update incrementally while text is still arriving.

```ts
const stream = engine.createStream(720);

stream.push("# Hello");
stream.push("\n\nThis paragraph is still");
const delta = stream.push(" streaming.");

console.log(delta.dirtyFromBlock);
console.log(delta.heightDelta);

const finalDelta = stream.finish();
const finalLayout = stream.getLayout();
```

`LayoutDelta` includes:

- `dirtyFromBlock`
- `previousTotalHeight`
- `totalHeight`
- `heightDelta`
- `appendedLines`
- `modifiedLines`
- `removedLineCount`

## Parser API

The parser package is usable on its own.

```ts
import {
  appendIncrementalParse,
  createIncrementalParseState,
  incrementalParse,
  parseMarkdown,
} from "@pretext-md/parser";

const blocks = parseMarkdown("# Hello\n\nWorld");

let state = createIncrementalParseState("# Hello");
state = appendIncrementalParse(state, "\n\nWorld").state;
state = incrementalParse(state, "# Hello\n\nWorld!").state;
```

The parser uses `@lezer/markdown` internally and reuses immutable block objects outside dirty regions.

## Syntax Highlighting

Highlighting is optional.

```ts
import { createHighlighter } from "@pretext-md/highlight";

const highlighter = createHighlighter();

const html = highlighter.highlight("const x = 1", "typescript");
const tokens = highlighter.tokenize("const x = 1", "typescript");
const themeCss = highlighter.getThemeCss("dark");
```

## Node.js and Canvas

For headless layout in Node.js, install the canvas shim before laying out content:

```ts
import { installNodeCanvas } from "./packages/layout/src/node-canvas.ts";

installNodeCanvas();
```

This project uses `@napi-rs/canvas` in Node.js. Browser environments use `OffscreenCanvas`/canvas directly.

## Static Rendering CLI

The repo ships a canvas-based renderer for turning Markdown files into PNGs.

Render the bundled examples:

```bash
vp run render:examples
```

Render a specific file or directory:

```bash
vp run render:markdown -- README.md --output out/rendered --width 920 --scale 2
```

CLI options:

- `--output`, `-o`: output directory
- `--width`, `-w`: content width in px
- `--scale`, `-s`: image scale
- `--theme`, `-t`: `light` or `dark`

## Supported Markdown

The current repo covers these major constructs:

- headings
- paragraphs
- strong / emphasis / strikethrough
- inline code
- links
- fenced code blocks
- ordered and unordered lists
- nested lists
- blockquotes
- tables
- thematic breaks
- HTML blocks
- images

The examples under [`examples/markdown`](./examples/markdown) are the best concise reference for currently supported combinations.

## Common Commands

- `vp run dev`: start the playground
- `vp run build`: build workspace packages and playground
- `vp check`: format, lint, and type-check
- `vp test`: run tests
- `vp run storybook`: launch Storybook
- `vp run storybook:build`: build Storybook
- `vp run benchmark:incremental`: run incremental parser/layout benchmark
- `vp run render:examples`: render bundled Markdown examples to PNG

## Project Layout

```text
packages/
  parser/         Incremental Markdown parser and block reuse
  layout/         Headless layout engine and streaming delta logic
  highlight/      Prism integration
  html-renderer/  HTML + CSS renderer
apps/
  playground/     Local playground app
examples/
  markdown/       Fixtures for rendering demos
scripts/
  render-markdown.ts
  benchmark-incremental.ts
stories/
  Storybook coverage
```

## Development

Developer workflow is documented in [`dev.md`](./dev.md).
