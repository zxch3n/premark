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
- External research confirms the main risk areas: IME event order differs across specs/browsers, composition can abort if DOM/selection around it is changed, soft keyboards may not produce reliable keydown events, Selection API focus behavior varies, and mobile visual viewports change under OS keyboards.
- Screenshot testing must be part of acceptance, not just a debugging aid. Screenshots should be small deterministic crops, stored as artifacts/baselines, and reviewed by Codex before claiming a phase is visually correct.

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

- [x] Define `EditorDocumentState`: markdown, layout, block records, selection, composing range, pending operations.
- [x] Define source-position model for caret, anchor, head, and composition.
- [ ] Define supported initial editing scope: paragraph, heading, list item, blockquote, code block.
- [ ] Define unsupported/deferred scopes: table cell rich editing, image resize, HTML block editing.
- [ ] Define browser matrix: Chromium first, macOS IME required before claiming success.
- [ ] Define manual fallback policy if real OS IME exposes a browser bug.
- [x] Create a pitfall-to-test matrix for IME, hidden textarea, selection, mobile, clipboard, Unicode, bidi, accessibility, visual stability, and remote edits.
- [ ] Define screenshot artifact policy: crop size limits, deterministic fonts/theme, animation disabled, artifact folder, and review checklist.

Acceptance:

- [ ] A new contributor can explain how selection, hit-test, input, composition, and rendering connect.
- [ ] No CodeMirror dependency is needed to understand or run the native editor prototype.
- [ ] Every known pitfall has an automated test plan or an explicit documented automation gap.

## Phase 1: Hit-Test And Source Mapping

Goal: make rendered Premark output addressable enough to edit directly.

- [x] Add fragment rect/source-range data to layout output or a sidecar index.
- [x] Implement `hitTest(x, y) -> sourceOffset`.
- [x] Implement `sourceOffsetToCaretRect(offset, affinity)`.
- [ ] Implement line/word/block granularity hit-test helpers.
- [ ] Add tests for Latin, CJK, emoji, inline code, links, list markers, blockquotes, and code blocks.
- [ ] Add grapheme fixtures for combining marks, emoji ZWJ sequences, flags, skin tones, and CJK punctuation.
- [ ] Add bidi fixtures for mixed English/Hebrew/Arabic/numbers/Markdown markers, even if first support is limited to documented behavior.
- [ ] Add coordinate transform tests for scroll, zoom, device scale factor, and nested canvas/world transforms.

Acceptance:

- [ ] Clicking rendered text places caret at the expected source offset.
- [ ] Drag selection across blocks produces one continuous source range.
- [ ] Hit-test works without relying on browser DOM selection.
- [ ] Hit-test and caret rect tests pass for hidden-marker and active-marker states.

## Phase 2: Premark Selection Painting

Goal: paint native selection and caret on the rendered surface.

- [ ] Add selection range to renderer input.
- [ ] Paint multi-line and cross-block selection rects.
- [ ] Paint caret rect with blink disabled in tests.
- [ ] Support collapsed, forward, backward, and multi-block selections.
- [ ] Support mouse drag selection, drag reversal, keyboard arrows, Shift+arrows, and Shift+Command+arrows.
- [ ] Define mobile selection behavior for touch long press, drag handles, soft keyboard focus, scroll, and zoom.
- [ ] Add tests for select-all, Home/End, PageUp/PageDown, line boundary, word boundary, document boundary, and direction-preserving selection extension.
- [ ] Add screenshot tests for forward selection, backward selection, wrapped-line selection, cross-block selection, active inline marker selection, and high-DPI canvas selection.
- [ ] Add visual tests for selection overlays independent of CodeMirror.

Acceptance:

- [ ] Selection over rendered Markdown looks continuous across paragraphs/lists/code.
- [ ] Selection geometry matches source range mapping within strict pixel thresholds.
- [ ] Desktop and mobile-specific selection behaviors have automated coverage or an explicit documented automation gap.
- [ ] Codex has reviewed the saved selection screenshots and recorded whether they match expected geometry and styling.

## Phase 3: Input Bridge

Goal: receive real OS text input while keeping Premark as the visible editor.

- [ ] Add hidden textarea/input bridge anchored near caret.
- [ ] Keep platform focus in the bridge while visible caret/selection are Premark-rendered.
- [ ] Convert `beforeinput` / `input` / keyboard commands into source operations.
- [ ] Handle delete/backspace, Enter, paste, undo/redo.
- [ ] Keep bridge content minimal to avoid DOM editor behavior becoming the product.
- [ ] Add an input event trace recorder for `keydown`, `beforeinput`, `input`, `keyup`, `selectionchange`, `composition*`, `paste`, `copy`, and `cut`.
- [ ] Add tests proving text insertion does not rely on keydown, so mobile autocorrect/autosuggest/swipe-like input can be modeled as input operations.
- [ ] Add clipboard tests for Markdown, plain text, HTML, cross-block cut, cross-block paste, and paste while a selection is active.
- [ ] Add focus/textarea-anchoring tests for scroll, zoom, visual viewport resize, and editor blur/refocus.

Acceptance:

- [ ] Typing updates Premark-rendered text without remounting the visible document.
- [ ] Paste and undo/redo operate on source ranges.
- [ ] Browser selection is not the source of truth.
- [ ] Event trace fixtures are saved for critical input cases and compared against expected normalized editor operations.

## Phase 4: IME

Goal: support real composition without hiding behind CodeMirror.

- [ ] Track `compositionstart/update/end` as a composing source range.
- [ ] Render preedit text in Premark with underline/style matching platform expectation as closely as practical.
- [ ] Commit and cancel composition without losing source selection.
- [ ] Run macOS Pinyin real IME tests.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [ ] Test browser/spec event-order variants: `beforeinput`/`compositionupdate`/`input`/`compositionend` can arrive in different orders and must normalize to the same editor operation.
- [ ] Assert composition update never commits real source, never enters undo, and never requires changing browser DOM selection near the composition range.
- [ ] Add screenshots for composition preedit text, replacement of selected text, composition near strong/code/link markers, and candidate-window anchoring when the OS screenshot path can capture it.
- [ ] Add remote/AI patch tests during composition: before range, after range, inside selected replacement range, and overlapping composition range.

Acceptance:

- [ ] macOS Pinyin commit, cancel, selected replacement, undo/redo, and cross-block selection pass.
- [ ] Composition does not replace or remount the rendered surface.
- [ ] Codex has reviewed saved IME screenshots or documented why a specific OS-level candidate window cannot be captured automatically.

## Phase 5: Prototype Story

Goal: replace the removed CodeMirror Storybook examples with a native Premark editing prototype.

- [ ] Add Storybook `Editing/Premark Native Editor`.
- [ ] Click rendered text to place caret.
- [ ] Drag across blocks to select.
- [ ] Type, delete, paste, and undo in supported blocks.
- [ ] Show debug overlay for source offsets, hit-test rects, and selection ranges.
- [ ] Add a screenshot mode that renders small fixed-size crops for key states: idle, caret, selected range, active marker, composition, paste preview, and remote edit.
- [ ] Add a screenshot review log template beside the generated artifacts.

Acceptance:

- [ ] The story demonstrates multi-line and cross-block selection.
- [ ] The story has no CodeMirror dependency.
- [ ] Story screenshots are deterministic enough for Playwright visual comparison and small enough for manual Codex review.

## Phase 6: Pitfall Automation And Screenshot Audit

Goal: convert the research checklist into automated coverage and visual review gates.

- [ ] Create `tests/editor/pitfalls/README.md` with every known pitfall, source, automation status, and owner.
- [ ] Create Playwright suites for desktop pointer selection, desktop keyboard selection, input bridge, clipboard, visual viewport, DOM debug renderer, Canvas renderer, and screenshot crops.
- [ ] Create macOS-only IME suite using real OS input where possible and clear skips where CI cannot provide the OS permission or input source.
- [ ] Create mobile-emulation suite for touch, visual viewport, soft keyboard modeling, and selection geometry; record gaps requiring real-device validation.
- [ ] Create screenshot review artifacts with one small crop per scenario and a Codex-reviewed `review.md` that records pass/fail and visual notes.
- [ ] Add CI/reporting guidance so screenshot failures include the actual/expected/diff images and event traces.

Acceptance:

- [ ] No phase can be marked complete without either passing automated pitfall tests or documenting a specific automation gap.
- [ ] Screenshot crops have been reviewed by Codex, not only generated by CI.
- [ ] Visual diffs are stable on the chosen baseline OS/browser/font configuration.

## Iteration Log

### 2026-04-20

- Created this plan after rejecting the CodeMirror overlay route.
- Removed CodeMirror overlay-specific playground modes, tests, Storybook examples, scripts, and dependencies from the new branch.
- Current hypothesis: Premark-native editing is harder up front, but it avoids the product mismatch caused by making an external text editor the real editing surface.
- Known risk: native input/IME is the hardest part and must be validated with real OS automation early, not deferred.
- Cloned MarkText and studied Muya. It confirms that a non-CodeMirror WYSIWYG Markdown editor is practical, but the first prototype should isolate browser-native editing behavior behind a small bridge and keep Premark's model/layout authoritative.
- Accepted design direction: hidden textarea bridge near caret, Premark-rendered caret/selection/composition, inline marker reveal for strong/code/link, UTF-16 offsets with grapheme sidecar, CRDT-agnostic stable ranges, local undo, and strict logic/browser/visual/IME/mobile testing.
- Researched browser/editor pitfalls from W3C/MDN/Chrome/CodeMirror/ProseMirror/Slate/Draft/Playwright/Unicode sources and added a dedicated automation plus screenshot audit phase.
- Began implementation with `@pretext-md/editor`: in-memory CRDT-agnostic document adapter, stable ranges, source edit operations, virtual composition session, local undo manager, editable layout sidecar index, pitfall matrix tracker, and deterministic core tests.
- Verified initial implementation with `vp check --fix`, `vp test`, and `vp run build`. Existing unrelated warnings remain in `packages/wiki-canvas/src/layout.ts` and `tools/wiki-canvas/src/cli.ts`.
