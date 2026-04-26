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
- `@pretext-md/editor`: native rendered Markdown editor core
- `@pretext-md/wiki-canvas`: canvas editor host and large-canvas Markdown viewer
- `@pretext-md/workspace`: tiled workspace/search engine for large Markdown sets

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

## Native Rendered Markdown Editor

The editor path is built around rendered Markdown, not a CodeMirror overlay. Markdown source offsets are the source of truth, and the rendered view is a projection over that source. This lets DOM, Canvas, selection geometry, IME composition, and remote edits share the same document model.

### Core controller

```ts
import {
  createInMemoryEditorDocumentState,
  createPremarkEditorController,
  LocalUndoManager,
} from "@pretext-md/editor";

const editor = createInMemoryEditorDocumentState(markdown, 720, {
  fontTheme: "modern",
  highlighter,
});
const undoManager = new LocalUndoManager();
const controller = createPremarkEditorController({ state: editor, undoManager });

controller.setCaret(0);
controller.replaceSelection("Hello ");

const snapshot = controller.renderSnapshot();
console.log(snapshot.layout.totalHeight);
console.log(snapshot.selection);
```

Important controller methods:

- `markdown()`: read the current Markdown source
- `setMarkdown(markdown, options)`: replace the document
- `setCaret(offset)` / `setSelection(anchor, head)`: move the source selection
- `replaceSelection(text)` / `applyEdit(operation, options)`: apply local edits
- `applyRemotePatch({ origin, actorId, changes })`: apply remote or AI patches without adding them to local undo history
- `undo()` / `redo()`: run local undo history
- `resize(width)` / `setViewport(options)`: rebuild layout geometry for a new width or viewport
- `renderSnapshot()`: produce the current layout, editable source map, selection rects input, active Markdown controls, composition view, and dirty rect metadata

### DOM editor host

Use the DOM host when you want normal HTML rendering with native browser input routed through a hidden textarea.

```ts
import { createPremarkDomEditorHost, renderToHtml } from "@pretext-md/html-renderer";

const host = createPremarkDomEditorHost({
  editor,
  controller,
  undoManager,
  surface: document.querySelector("[data-editor-surface]")!,
  overlay: document.querySelector("[data-editor-overlay]")!,
  inputBridge: document.querySelector("[data-input-bridge]")!,
  contentInset: { x: 28, y: 28 },
  renderMarkdown(snapshot) {
    return renderToHtml(snapshot.layout, {
      codeThemeCss: highlighter.getThemeCss("dark"),
    });
  },
});

host.render();
```

The DOM host owns pointer selection, keyboard input, clipboard, IME composition, hidden textarea positioning, caret overlay, selection overlay, and composition overlay. The app supplies the actual elements and can customize overlay class names or overlay renderers.

### Canvas editor host

Use the Canvas host when the rendered Markdown is painted into a canvas surface, for example inside a huge workspace or tile view.

```ts
import { createPremarkCanvasEditorHost, darkTilePalette } from "@pretext-md/wiki-canvas";

const host = createPremarkCanvasEditorHost({
  editor,
  controller,
  undoManager,
  canvas: document.querySelector("canvas")!,
  inputBridge: document.querySelector("[data-input-bridge]")!,
  width: 780,
  height: 480,
  contentPadding: 28,
  paint: {
    palette: darkTilePalette,
    selectionColor: "rgba(52, 139, 99, 0.34)",
    caretColor: "#7dd3ae",
    compositionColor: "#7dd3ae",
  },
});

host.render();
```

The Canvas host handles device-pixel-ratio scaling, hit testing, wheel scrolling, textarea positioning, selection/caret painting, composition painting, and image repaint callbacks. It also exposes `resize()`, `scrollTo()`, `pointForSourceRange()`, and `fragmentForText()` for host integration and tests.

### Remote and AI edits

Remote collaborators and AI streaming should use explicit source patches:

```ts
controller.applyRemotePatch({
  origin: "ai",
  actorId: "assistant",
  changes: [{ from: offset, to: offset, insert: " streamed text" }],
});

host.render({ syncBridgeValue: false });
```

Remote patches transform the local selection and composition state through source offsets. They do not enter the local undo stack.

### Editing invariants

- Source offsets are authoritative for caret, selection, hit testing, and rendering.
- Grapheme clusters are the smallest editable text boundary.
- Source-mode editing preserves every `\n` as a visual line advance.
- Leading and repeated spaces remain editable source text.
- Markdown control characters become visible when the caret is inside or adjacent to the range they affect.
- Tables and images render as plain Markdown source while the caret is inside their source lines; otherwise they render normally.

Interactive examples are available in Storybook:

- `Editing/Premark Native Editor`
- `Editing/Premark Canvas Native Editor`

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
- `vp run benchmark:native-editor`: run native editor layout/editing benchmark
- `vp run render:examples`: render bundled Markdown examples to PNG

## Project Layout

```text
packages/
  parser/         Incremental Markdown parser and block reuse
  layout/         Headless layout engine and streaming delta logic
  highlight/      Prism integration
  html-renderer/  HTML + CSS renderer
  editor/         Native rendered Markdown editor core
  wiki-canvas/    Canvas editor host and large-canvas viewer
  workspace/      Tiled workspace/search engine
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
