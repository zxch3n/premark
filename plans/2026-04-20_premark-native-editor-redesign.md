# Premark Native Editor Redesign Plan

Status: in progress
Owner: Codex / Zixuan
Last Updated: 2026-04-20

## Current Objective

- Remove the CodeMirror overlay editing design from the active branch.
- Redesign editing around Premark's own rendered document model.
- Keep rendered Markdown as the primary surface; do not open a detached source editor and do not mount per-block CodeMirror editors.
- Preserve the useful Premark work already done: parser source maps, block identity, workspace search, snippets, tiles, streaming, and document operations.

## New Learnings

- A per-block overlay editor has a hard product flaw: cross-block and multi-line selection are broken by construction.
- A whole-note CodeMirror overlay improves selection but still makes CodeMirror the real editor and Premark the inactive skin. That does not match the desired direction.
- Obsidian Live Preview is closer to "one continuous editor with rendered decorations" than "many block overlays"; MarkText/Muya is closer to a custom rendered editing surface.
- The new route should make Premark's rendered tree the editable surface and build selection/input/hit-test/IME around it.
- MarkText/Muya uses CodeMirror only for source-code mode. Its realtime preview editor is a separate contenteditable rendered DOM editor.
- Muya keeps its own block tree, maps DOM selection to block-local offsets, lets browser input mutate editable DOM, then reconciles changed DOM text back into the block tree and re-renders affected blocks.
- Muya validates the route, but it also shows the main risk: relying on browser-edited rendered DOM creates many browser-specific edge cases around cursor restoration, IME, inline syntax hiding, images, tables, and block transforms.
- Premark should reuse the continuous rendered-surface idea, but prefer source ranges, layout fragments, and explicit operations as the source of truth instead of treating post-input DOM text as the primary model.
- The first native editor design chooses hidden textarea input plus Premark-painted selection/caret/composition, with shared DOM-debug and Canvas renderers over one layout/source-map core.
- Selection testing must be much broader than basic drag selection: mouse drag/reversal, Arrow navigation, Shift+Arrow, Shift+Command+Arrow, cross-block ranges, and mobile touch selection all need coverage.

## Removed From This Branch

- [x] Playground `?mode=visual-parity` CodeMirror overlay harness.
- [x] Playground `?mode=canvas-editor` CodeMirror overlay demo.
- [x] Browser/macOS IME tests that specifically targeted CodeMirror overlay.
- [x] Storybook CodeMirror overlay and pure CodeMirror examples.
- [x] Root and playground CodeMirror dependencies.
- [x] Package scripts for visual/browser/IME/cross-browser overlay tests.

## Architecture Direction

Premark native editing should have one continuous document surface:

- Rendered blocks and inline fragments come from Premark layout.
- Selection is represented as source ranges and painted by Premark.
- Caret is represented as a source position and painted by Premark.
- Hit-test maps viewport coordinates to `docId + sourceOffset`.
- Input is captured through a hidden platform text input only as an OS bridge, not as the visible editor.
- Composition text is mirrored into Premark's editing model and rendered in place.
- Undo/redo is an operation log over Markdown source changes.
- Remote edits and AI streaming apply to the same document model without replacing the active surface.

## Phase 0: Native Editing Requirements

Goal: define the minimum editor contract before coding input.

- [ ] Define `EditorDocumentState`: markdown, layout, block records, selection, composing range, pending operations.
- [ ] Define source-position model for caret, anchor, head, and composition.
- [ ] Define supported initial editing scope: paragraph, heading, list item, blockquote, code block.
- [ ] Define unsupported/deferred scopes: table cell rich editing, image resize, HTML block editing.
- [ ] Define browser matrix: Chromium first, macOS IME required before claiming success.
- [ ] Define manual fallback policy if real OS IME exposes a browser bug.

Acceptance:

- [ ] A new contributor can explain how selection, hit-test, input, composition, and rendering connect.
- [ ] No CodeMirror dependency is needed to understand or run the native editor prototype.

## Phase 1: Hit-Test And Source Mapping

Goal: make rendered Premark output addressable enough to edit directly.

- [ ] Add fragment rect/source-range data to layout output or a sidecar index.
- [ ] Implement `hitTest(x, y) -> sourceOffset`.
- [ ] Implement `sourceOffsetToCaretRect(offset, affinity)`.
- [ ] Implement line/word/block granularity hit-test helpers.
- [ ] Add tests for Latin, CJK, emoji, inline code, links, list markers, blockquotes, and code blocks.

Acceptance:

- [ ] Clicking rendered text places caret at the expected source offset.
- [ ] Drag selection across blocks produces one continuous source range.
- [ ] Hit-test works without relying on browser DOM selection.

## Phase 2: Premark Selection Painting

Goal: paint native selection and caret on the rendered surface.

- [ ] Add selection range to renderer input.
- [ ] Paint multi-line and cross-block selection rects.
- [ ] Paint caret rect with blink disabled in tests.
- [ ] Support collapsed, forward, backward, and multi-block selections.
- [ ] Support mouse drag selection, drag reversal, keyboard arrows, Shift+arrows, and Shift+Command+arrows.
- [ ] Define mobile selection behavior for touch long press, drag handles, soft keyboard focus, scroll, and zoom.
- [ ] Add visual tests for selection overlays independent of CodeMirror.

Acceptance:

- [ ] Selection over rendered Markdown looks continuous across paragraphs/lists/code.
- [ ] Selection geometry matches source range mapping within strict pixel thresholds.
- [ ] Desktop and mobile-specific selection behaviors have automated coverage or an explicit documented automation gap.

## Phase 3: Input Bridge

Goal: receive real OS text input while keeping Premark as the visible editor.

- [ ] Add hidden textarea/input bridge anchored near caret.
- [ ] Keep platform focus in the bridge while visible caret/selection are Premark-rendered.
- [ ] Convert `beforeinput` / `input` / keyboard commands into source operations.
- [ ] Handle delete/backspace, Enter, paste, undo/redo.
- [ ] Keep bridge content minimal to avoid DOM editor behavior becoming the product.

Acceptance:

- [ ] Typing updates Premark-rendered text without remounting the visible document.
- [ ] Paste and undo/redo operate on source ranges.
- [ ] Browser selection is not the source of truth.

## Phase 4: IME

Goal: support real composition without hiding behind CodeMirror.

- [ ] Track `compositionstart/update/end` as a composing source range.
- [ ] Render preedit text in Premark with underline/style matching platform expectation as closely as practical.
- [ ] Commit and cancel composition without losing source selection.
- [ ] Run macOS Pinyin real IME tests.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.

Acceptance:

- [ ] macOS Pinyin commit, cancel, selected replacement, undo/redo, and cross-block selection pass.
- [ ] Composition does not replace or remount the rendered surface.

## Phase 5: Prototype Story

Goal: replace the removed CodeMirror Storybook examples with a native Premark editing prototype.

- [ ] Add Storybook `Editing/Premark Native Editor`.
- [ ] Click rendered text to place caret.
- [ ] Drag across blocks to select.
- [ ] Type, delete, paste, and undo in supported blocks.
- [ ] Show debug overlay for source offsets, hit-test rects, and selection ranges.

Acceptance:

- [ ] The story demonstrates multi-line and cross-block selection.
- [ ] The story has no CodeMirror dependency.

## Iteration Log

### 2026-04-20

- Created this plan after rejecting the CodeMirror overlay route.
- Removed CodeMirror overlay-specific playground modes, tests, Storybook examples, scripts, and dependencies from the new branch.
- Current hypothesis: Premark-native editing is harder up front, but it avoids the product mismatch caused by making an external text editor the real editing surface.
- Known risk: native input/IME is the hardest part and must be validated with real OS automation early, not deferred.
- Cloned MarkText and studied Muya. It confirms that a non-CodeMirror WYSIWYG Markdown editor is practical, but the first prototype should isolate browser-native editing behavior behind a small bridge and keep Premark's model/layout authoritative.
- Accepted design direction: hidden textarea bridge near caret, Premark-rendered caret/selection/composition, inline marker reveal for strong/code/link, UTF-16 offsets with grapheme sidecar, CRDT-agnostic stable ranges, local undo, and strict logic/browser/visual/IME/mobile testing.
