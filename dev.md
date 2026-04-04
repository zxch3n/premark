# Development Guide

This document describes how to work on `@pretext-md` locally, how the repository is structured, and how to validate changes before pushing them.

## Prerequisites

- Node.js `>= 22.12.0`
- `vp` available on your machine

Install dependencies:

```bash
vp install
```

## Repository Structure

```text
packages/
  parser/
    src/
      incremental-parser.ts
      lezer-adapter.ts
      stream-parser.ts
      types.ts
  layout/
    src/
      engine.ts
      stream.ts
      normalize.ts
      measure/
  highlight/
    src/
      prism-engine.ts
  html-renderer/
    src/
      renderer.ts
apps/
  playground/
examples/
  markdown/
  rendered/
scripts/
  benchmark-incremental.ts
  render-markdown.ts
stories/
optimize.md
plans/
```

## Core Architecture

The main pipeline is:

1. `@pretext-md/parser`
   Converts Markdown to immutable block objects.
   Supports full parse, append-only incremental parse, and generic incremental replace.
2. `@pretext-md/layout`
   Normalizes blocks, prepares text/code/table measurements, and produces `DocumentLayout`.
3. `@pretext-md/highlight`
   Adds Prism HTML/tokens for fenced code blocks.
4. `@pretext-md/html-renderer`
   Converts layout IR to HTML + CSS.
5. `scripts/render-markdown.ts`
   Uses `@napi-rs/canvas` to render Markdown fixtures or files into PNG.

Key implementation files:

- [`packages/parser/src/incremental-parser.ts`](./packages/parser/src/incremental-parser.ts)
- [`packages/parser/src/lezer-adapter.ts`](./packages/parser/src/lezer-adapter.ts)
- [`packages/layout/src/engine.ts`](./packages/layout/src/engine.ts)
- [`packages/layout/src/normalize.ts`](./packages/layout/src/normalize.ts)
- [`packages/layout/src/measure/rich-text.ts`](./packages/layout/src/measure/rich-text.ts)
- [`packages/html-renderer/src/renderer.ts`](./packages/html-renderer/src/renderer.ts)

## Daily Workflow

### Start the playground

```bash
vp run dev
```

### Run checks

```bash
vp check
vp test
```

### Build everything

```bash
vp run build
```

### Storybook

```bash
vp run storybook
vp run storybook:build
```

### Render example images

```bash
vp run render:examples
```

### Run benchmarks

```bash
vp run benchmark:incremental
```

## Git Hooks

The repo uses Vite+ hooks configured through `vp config`.

Current hooks:

- `pre-commit`: runs `vp staged`
- `pre-push`: runs `vp check` and `vp test`

That means a push should fail locally if linting, formatting, type checks, or tests are broken.

## Validation Checklist

For normal code changes:

1. `vp check`
2. `vp test`
3. `vp run build`

For rendering or layout changes, also run:

1. `vp run render:examples`
2. inspect generated PNGs under `examples/rendered`
3. if the change is performance-sensitive, run `vp run benchmark:incremental`

If the change touches parser/layout internals, compare incremental and full paths:

- full layout output should remain consistent
- incremental updates should match full rerender results
- block reuse outside dirty ranges should still hold

## Fonts and Canvas Notes

### Browser

- Layout depends on real font metrics.
- Wait for fonts to load before creating the engine if custom fonts are used.
- Browser layout uses canvas/`OffscreenCanvas` APIs.

### Node.js

- Call `installNodeCanvas()` before running layout in Node.js.
- Static rendering uses `@napi-rs/canvas`.
- Font registration matters for CJK and emoji output; see [`scripts/render-markdown.ts`](./scripts/render-markdown.ts) for the current fallback font setup.

## Working on the Parser

Parser behavior lives in `packages/parser`.

Useful entry points:

- `parseMarkdown(markdown)`
- `createIncrementalParseState(markdown?)`
- `appendIncrementalParse(state, chunk)`
- `incrementalParse(state, newText)`
- `StreamParser`

Guidelines:

- keep block objects immutable-by-contract
- preserve object reuse outside dirty ranges
- prefer append fast paths for streaming cases
- fall back to full reparse when a change window becomes too large

When changing parser behavior, update tests under [`packages/parser/tests`](./packages/parser/tests).

## Working on Layout

Layout behavior lives in `packages/layout`.

Key concepts:

- `normalizeDocument()` expands parser blocks into layout-ready normalized blocks
- `prepare*()` functions precompute measurement state
- `layout*()` functions convert prepared state into `LayoutLine[]`
- `LayoutEngineImpl` coordinates caching, incremental updates, and final document assembly

When touching layout code:

- verify both full layout and streaming layout
- inspect `LayoutDelta` correctness
- render example images to catch visual regressions
- benchmark before and after if the hot path changes

## Working on Rendering

There are two renderers in the repo:

- HTML renderer in `packages/html-renderer`
- canvas renderer CLI in `scripts/render-markdown.ts`

If a change affects visual output:

1. rebuild or rerun examples
2. inspect tables, blockquotes, code blocks, images, and mixed inline formatting
3. compare light/dark themes if code rendering changed

## Performance Workflow

Use [`optimize.md`](./optimize.md) as the optimization log.

Recommended loop:

1. establish a baseline with `vp run benchmark:incremental`
2. capture a profile if the hotspot is unclear
3. make one focused change
4. rerun `vp check`, `vp test`, and the benchmark
5. rerender fixtures if rendering paths changed
6. record outcome in `optimize.md`
7. keep the change only if it helps and does not regress correctness

## Release and Integration Notes

This repo is still a workspace-first project. Until packages are published, examples and internal imports are the most accurate usage references.

When updating public APIs:

- keep root `README.md` current
- update this file if the workflow changes
- verify exports in the package `src/index.ts` files
