# Lezer Incremental Rendering Plan

Status: completed
Owner: Codex
Last Updated: 2026-04-03

## Goal

Replace the current "reparse and relayout the whole document on every update" path with a mixed
incremental pipeline:

- small edits: `O(n)` simple text diff + near-`O(delta)` parse/block/layout updates
- large edits: fast fallback to full parse
- unchanged blocks keep object identity
- layout updates are driven by a dirty block range instead of a full-document pass

## Acceptance Criteria

- [x] `incrementalParse(oldState, newText)` produces blocks deeply equal to `parseMarkdown(newText)`
- [x] unchanged prefix blocks preserve object identity
- [x] unchanged suffix blocks preserve object identity
- [x] large edit fallback returns the same result as full parse
- [x] `LayoutStream` updates only the dirty block window for small edits
- [x] incremental layout output is deeply equal to full layout output
- [x] all parser/layout/html-renderer tests pass
- [x] benchmark suite records incremental vs full-parse timings

## Implementation Phases

### Phase 1: Parser Incremental Core

- [x] add `@lezer/markdown`
- [x] add a Lezer-backed parser adapter that maps syntax trees into project AST nodes
- [x] add `simpleDiff(oldText, newText)` using longest common prefix/suffix
- [x] add full-parse fallback thresholds:
  - [x] changed chars
  - [x] changed ratio
  - [x] changed lines
- [x] add `IncrementalParseState`
- [x] add `incrementalParse(oldState, newText)`
- [x] add block span extraction for dirty window detection
- [x] preserve object identity for unchanged prefix/suffix blocks

### Phase 2: Layout Incremental Updates

- [x] add a layout update path that accepts:
  - [x] previous normalized blocks
  - [x] next normalized blocks
  - [x] dirty block range
- [x] reuse cached prepared blocks outside the dirty window
- [x] reuse unchanged block lines without re-prepare
- [x] update `LayoutStream` to consume parser incremental state instead of full block arrays
- [x] keep `LayoutDelta` behavior correct for append/modify/remove cases

### Phase 3: Validation

- [x] parser correctness tests
- [x] incremental vs full parse equivalence tests
- [x] layout incremental vs full layout equivalence tests
- [x] fallback threshold tests
- [x] random edit fuzz tests
- [x] benchmark scripts

## Required Markdown Fixtures

### Block Coverage

- [x] headings
- [x] paragraphs
- [x] thematic breaks
- [x] fenced code blocks
- [x] indented code blocks
- [x] blockquotes
- [x] ordered lists
- [x] unordered lists
- [x] nested lists
- [x] task lists
- [x] tables
- [x] html blocks
- [x] image-only paragraphs

### Inline Coverage

- [x] plain text
- [x] strong
- [x] emphasis
- [x] strong+emphasis
- [x] strikethrough
- [x] inline code
- [x] links
- [x] autolinks
- [x] images
- [x] soft breaks
- [x] hard breaks
- [x] inline html
- [x] Chinese text
- [x] emoji

### Incremental Edit Coverage

- [x] append text to paragraph tail
- [x] insert text in paragraph middle
- [x] delete text in paragraph middle
- [x] add/remove blank line between paragraphs
- [x] open and close fenced code block
- [x] turn paragraph into table by inserting delimiter line
- [x] turn table back into paragraph by deleting delimiter line
- [x] increase list indentation
- [x] decrease list indentation
- [x] add/remove blockquote marker
- [x] toggle task list checkbox
- [x] change code fence info string
- [x] large replace triggers full parse fallback

## Performance Validation

### Metrics

- [x] simple diff time
- [x] incremental parse time
- [x] full parse time
- [x] incremental layout time
- [x] full layout time
- [x] reused block count
- [x] dirty block count
- [x] fallback hit rate

### Fixtures

- [x] 10KB markdown
- [x] 50KB markdown
- [x] 100KB markdown

### Scenarios

- [x] append 20 chars at end
- [x] append one paragraph
- [x] replace 30 chars in middle paragraph
- [x] modify list nesting
- [x] open/close code fence
- [x] large replace over threshold

### Expected Outcome

- [x] incremental path is measurably faster than full parse for small edits
- [x] block reuse stays high for append-heavy edits
- [x] fallback avoids pathological slowdowns on large edits

## Progress Log

- [x] initial implementation plan written to repo
- [x] parser incremental core implemented
- [x] layout incremental updates implemented
- [x] tests and benchmarks implemented

## Validation Summary

- `vp check --fix` passed
- `vp test` passed (`4` files, `20` tests)
- `vp run build` passed
- `vp run benchmark:incremental` passed

## Benchmark Snapshot

- `10KB`: append tail `parser 32.92ms -> 5.46ms`, replace middle `24.77ms -> 3.24ms`, fallback hit rate `1/6`
- `50KB`: append tail `49.62ms -> 4.61ms`, replace middle `40.07ms -> 4.66ms`, fallback hit rate `1/6`
- `100KB`: append tail `74.20ms -> 9.80ms`, replace middle `82.50ms -> 11.77ms`, fallback hit rate `1/6`
- small edits keep `dirty blocks=1`
- append-heavy edits keep reuse at `541/541`, `2701/2701`, `5401/5401`
