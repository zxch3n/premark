# Premark Native Editor Redesign Plan

Status: in progress
Owner: Codex / Zixuan
Last Updated: 2026-04-20
Compaction Rule: after memory reload or compaction, reread this whole file before continuing.

## Current Objective

- Execute Phase 7: harden text geometry and renderer invariants.
- Keep the native Premark-rendered editor as the product path; CodeMirror overlay remains removed.
- Do not run macOS HID/IME tests while the machine is actively used unless Zixuan explicitly asks.

## New Learnings

- Per-block or whole-note CodeMirror overlays make selection/editing feel detached from the rendered surface; Premark native editing should own selection, caret, hit-test, input, and rendering.
- Hidden textarea input is only an OS bridge. Browser DOM selection and textarea content are not the source of truth.
- Geometry must be source-addressable: every caret, hit-test, selection rect, composition rect, and renderer paint position maps back to Markdown source offsets.
- Active Markdown control reveal is a rendered view over the same source ranges. Revealed controls need explicit source maps/editable runs, not text search against the original Markdown.
- Inline geometry cannot use proportional character counts. Prefix widths must be measured at grapheme/source boundaries with the fragment font and text inset.
- Newline handling is editor-specific: source mode renders every `\n` as a visual line advance and exposes blank source lines for caret/hit-test.
- Font readiness is part of correctness. Layout and editable caches must be built after target fonts load; tests should compare fragment width against fresh `canvas.measureText`.
- Canvas painting must use the same boundary model as editor geometry. Emoji-like runs cannot be painted as one `fillText` run if the layout/editor uses grapheme boundaries; repeated ZWJ emoji otherwise drift in Canvas while DOM looks correct.
- Most text-geometry bugs should be caught without Browser. Browser tests should prove Storybook wiring, font loading, Canvas paint, and visual baselines.

## Architecture Direction

- One continuous Premark document surface.
- Markdown source and source ranges are authoritative.
- Layout fragments and editable sidecars provide source-to-geometry and geometry-to-source mapping.
- Premark paints caret, selection, composition, and revealed Markdown controls.
- Input normalizes into explicit source operations with local undo/redo.
- Remote edits and AI streaming must share the same source/range model.

## Phase 0: Native Editing Requirements

Goal: define the minimum editor contract before coding input.

- [x] Define document state, source selection model, supported/deferred scopes, browser matrix, IME fallback policy, pitfall matrix, and screenshot policy.

Acceptance:

- [x] A contributor can explain how selection, hit-test, input, composition, and rendering connect.
- [x] No CodeMirror dependency is needed to understand or run the prototype.
- [x] Every known pitfall has automated coverage or a documented automation gap.

## Phase 1: Hit-Test And Source Mapping

Goal: make rendered Premark output addressable enough to edit directly.

- [x] Implement editable layout sidecar, `hitTest`, `sourceOffsetToCaretRect`, source-range helpers, grapheme fixtures, bidi fixture, and coordinate transform tests.

Acceptance:

- [x] Rendered clicks and drags map to continuous source ranges without DOM selection.
- [x] Hidden-marker and active-marker geometry pass pure tests.

## Phase 2: Selection Painting

Goal: paint native selection and caret on the rendered surface.

- [x] Add selection/caret geometry, multi-line and cross-block selection rects, pointer/keyboard selection commands, mobile-mode coverage, and visual baselines.

Acceptance:

- [x] Selection looks continuous across paragraphs, lists, code, wrapped text, and active inline tokens.
- [x] Screenshot crops were generated and reviewed.

## Phase 3: Input Bridge

Goal: receive real OS text input while Premark remains the visible editor.

- [x] Add hidden textarea bridge, normalized input intents, undo/redo, paste/cut, input trace fixtures, focus anchoring, viewport resize, and mobile soft-keyboard-style input coverage.

Acceptance:

- [x] Typing, paste, cut, delete, Enter, undo/redo, and soft-keyboard-style input update source ranges.
- [x] Browser selection is not authoritative.

## Phase 4: IME

Goal: support real composition without hiding behind CodeMirror.

- [x] Track composition start/update/end as source ranges.
- [x] Render composition preedit in Premark.
- [x] Cover synthetic event-order variants and remote edits around composition.
- [x] Create macOS-only runner with strict/skip mode.
- [ ] Run real macOS Pinyin tests when the machine is available.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [ ] Add candidate-window anchoring screenshots if the OS screenshot path can capture them.

Acceptance:

- [x] Composition does not replace/remount the rendered surface.
- [ ] Real macOS Pinyin commit/cancel/replacement/undo/cross-block cases pass.

## Phase 5: Prototype Story

Goal: expose native Premark editing in Storybook.

- [x] Add `Editing/Premark Native Editor` and `Editing/Premark Canvas Native Editor`.
- [x] Support click, drag selection, typing, delete, paste, undo, composition, debug overlays, screenshot mode, and Canvas-native browser acceptance.

Acceptance:

- [x] Stories demonstrate multi-line/cross-block selection and Canvas-native editing without CodeMirror.
- [x] Story screenshots are deterministic enough for Playwright visual comparison.

## Phase 6: Pitfall Automation And Screenshot Audit

Goal: turn known editor pitfalls into automated checks or explicit gaps.

- [x] Maintain `tests/editor/pitfalls/README.md`.
- [x] Cover desktop pointer/input, keyboard selection, clipboard, visual viewport, DOM/Canvas visual baselines, synthetic composition, mobile emulation, screenshot review, and reporting guidance.

Acceptance:

- [x] No non-OS pitfall remains only planned.
- [x] macOS Pinyin/candidate-window remain documented OS automation gaps.

## Phase 7: Text Geometry And Renderer Invariants

Goal: make text geometry and renderer paint share one boundary contract.

- [x] Fix Canvas emoji drift by drawing emoji-like runs per grapheme at layout boundaries.
- [x] Add a reusable fixture matrix: Latin, variable-width, CJK, repeated emoji ZWJ, flags, skin tones, combining marks, VS16, ZWSP, inline code, link suffix, revealed controls, heading markers, code blocks, source newlines.
- [x] For every fixture, assert caret x/y, hit-test, and selection rects use the same boundary table.
- [x] Assert hit-test never returns offsets inside a grapheme cluster or hidden non-addressable span.
- [x] Assert Canvas text paint positions for source-addressable glyph clusters match editable geometry for emoji-like and control-reveal runs.
- [x] Add Canvas-native browser acceptance for repeated emoji, revealed controls, and link suffix positions.
- [x] Review cache invalidation for font load, layout rebuild, active marker reveal switch, and fragment boundary cache.

Acceptance:

- [x] `👨‍👩‍👧‍👦`.repeat(7) and similar cluster-heavy fixtures do not drift in DOM or Canvas.
- [x] Any fixture source boundary can be represented by caret, hit-test, and selection geometry.
- [x] Canvas paint does not use a different text advance as the authority for editable text.
- [x] `vp test`, `vp run build`, and `vp run test:browser` pass.

## Phase 8: Editing Behavior Polish

Goal: improve editing feel after geometry is stable.

- [ ] Add double-click word selection and triple-click block selection.
- [ ] Harden drag selection across blocks and reversed drags.
- [ ] Complete line start/end, Option/Alt word movement, Command document movement, and Shift variants in browser stories.
- [ ] Define paste/delete/Enter behavior near Markdown controls.
- [ ] Add visual crops for Canvas native link/control/emoji editing states.

Acceptance:

- [ ] Common desktop editing gestures match expected rendered-surface behavior.
- [ ] Control-adjacent editing does not corrupt Markdown source.

## Phase 9: Performance And Incremental Rendering

Goal: validate that the native Premark route can deliver the intended speed advantage.

- [ ] Add large-document layout and editable-index benchmarks.
- [ ] Add incremental layout benchmark for local edit, remote edit, and AI streaming append.
- [ ] Add Canvas tile dirty-region redraw benchmark.
- [ ] Stress range rebasing for local selection/caret during remote CRDT patches.
- [ ] Measure streaming AI output while user edits another region.

Acceptance:

- [ ] Benchmarks report stable numbers in CI or local scripts.
- [ ] Incremental edit paths avoid full-document work where the architecture allows it.
- [ ] Performance data is good enough to decide whether to keep optimizing this route.

## Iteration Log

### 2026-04-20

- Rejected CodeMirror overlay and removed overlay-specific playground modes, stories, tests, scripts, and dependencies.
- Studied MarkText/Muya. It validates a custom rendered Markdown editor, but Premark should keep source/layout authoritative instead of trusting browser-mutated rendered DOM.
- Implemented core native editor: source document state, stable ranges, grapheme helpers, editable layout index, selection geometry, input intents, textarea bridge, undo manager, composition model, clipboard, and Storybook DOM/Canvas prototypes.
- Added broad automated coverage for selection, hit-test, input, composition, mobile emulation, visual viewport, screenshots, active marker reveal, source-preserving newlines, font readiness, and Canvas-native interaction.
- Fixed notable geometry failures: parser block index mismatch, proportional inline x, heading marker reveal drift, active reveal index mismatch in Canvas story, wrapped-line affinity/y boundary, multiline code-block y, source newline gaps, font-load stale widths, internal revealed-control caret placement, editable-run source maps, bare URL visibility, and repeated ZWJ emoji Canvas drift.
- Current verification baseline after emoji Canvas fix: `vp check --fix` passes with two existing warnings, `vp test` passes 166 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests.
- Existing warnings are unrelated: `tools/wiki-canvas/src/cli.ts` unused `ScannedNote`, and `packages/wiki-canvas/src/layout.ts` `new Array<number>(cols).fill(0)`.
- Assumption: Phase 7 should be completed before adding new editing behavior because geometry/renderer mismatch can invalidate higher-level behavior tests.
- Possible plan change: if Phase 7 exposes renderer limits in Canvas text shaping, introduce a shared text-run paint abstraction rather than patching `drawTile` locally.
- Prepared experiments: compare editable boundary tables, fresh Canvas measurements, and recorded Canvas `fillText` positions across the fixture matrix.
- Phase 7 started. Added a pure text-geometry invariant matrix and a Canvas-native repeated emoji browser fixture. The matrix immediately found a real active-marker source-map bug: exact revealed boundaries shared by adjacent runs were always mapped to the smaller source offset, so `before` caret positions at the end of visible controls could jump backward. Boundary mapping is now side-aware: the first boundary maps as `start`, later boundaries map as `end`.
- Verification after the first Phase 7 batch: `vp check --fix` passes with the two existing warnings, targeted geometry/reveal tests pass 40 tests, full `vp test` passes 168 tests, `vp run build` passes, and `vp run test:browser` passes 19 Playwright tests.
- Completed Phase 7. Canvas drawing now treats emoji and Markdown/link control punctuation as boundary-sensitive: normal text still draws in chunks, while boundary-sensitive graphemes are placed at `measureGraphemeBoundaryXs` positions. Added draw tests for repeated emoji, revealed `**` controls, and link suffix controls. Cache review result: font loading is gated before Storybook layout construction, editable boundary caches are WeakMap-keyed by fragment objects, active reveal creates new editable indexes, and resize/refresh rebuild layout plus editable index. Added a regression that switches hidden/revealed indexes and resizes a document after measuring.
