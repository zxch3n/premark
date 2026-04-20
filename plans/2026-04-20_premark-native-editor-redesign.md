# Premark Native Editor Redesign Plan

Status: Phase 12 complete; Phase 13 next; OS IME deferred
Owner: Codex / Zixuan
Last Updated: 2026-04-21
Compaction Rule: after memory reload or compaction, reread this whole file before continuing.

## Current Objective

- Start Phase 13 selection and mobile hardening.
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
- Control-adjacent editing should stay source-exact. If the caret is inside a revealed Markdown marker or link suffix, insert/delete/paste/Enter edits that source position only; replacing rendered inline content should leave its surrounding controls intact.
- Enter in the native editor now means one source newline. Browser `insertParagraph` and textarea `insertLineBreak` both normalize to the same source operation because editor layout preserves every `\n`.
- Common Markdown structure editing now has explicit behavior: list/quote continuation, empty-prefix exits, task toggles, code source exactness, heading boundary Backspace, link/image label replacement, and source-exact inline-control deletes.
- Phase 9 benchmarks show the core layout engine is already incremental for local edit, remote edit, and AI append, but editable sidecar rebuild is still full-document and dominates large editor updates. The next architecture step is dirty-block/viewport editable indexing, not more CodeMirror fallback.
- macOS IME automation can be prepared without posting OS events: dry-run now validates helpers/input sources and scenario selection for Pinyin, Japanese, and Korean. Real IME correctness still requires foreground HID.

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
- [x] Prepare selectable Pinyin/Japanese/Korean scenario sets without running HID.
- [x] Add candidate-window screen-capture artifact path for future OS runs.
- [ ] Run real macOS Pinyin tests when the machine is available.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [ ] Review candidate-window anchoring screenshots after an allowed OS run.

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

- [x] Add double-click word selection and triple-click block selection.
- [x] Harden drag selection across blocks and reversed drags.
- [x] Complete line start/end, Option/Alt word movement, Command document movement, and Shift variants in browser stories.
- [x] Define paste/delete/Enter behavior near Markdown controls.
- [x] Add visual crops for Canvas native link/control/emoji editing states.

Acceptance:

- [x] Common desktop editing gestures match expected rendered-surface behavior.
- [x] Control-adjacent editing does not corrupt Markdown source.

## Phase 9: Performance And Incremental Rendering

Goal: validate that the native Premark route can deliver the intended speed advantage.

- [x] Add large-document layout and editable-index benchmarks.
- [x] Add incremental layout benchmark for local edit, remote edit, and AI streaming append.
- [x] Add Canvas tile dirty-region redraw benchmark.
- [x] Stress range rebasing for local selection/caret during remote CRDT patches.
- [x] Measure streaming AI output while user edits another region.

Acceptance:

- [x] Benchmarks report stable numbers in CI or local scripts.
- [x] Incremental edit paths avoid full-document work where the architecture allows it.
- [x] Performance data is good enough to decide whether to keep optimizing this route.

## Phase 10: Incremental Editable Sidecar

Goal: remove the full-document editable-index rebuild found by Phase 9.

- [x] Design dirty-block/viewport editable index ownership and cache invalidation.
- [x] Add an API that can rebuild editable fragments for dirty source/layout blocks while reusing stable fragments outside the dirty range.
- [x] Keep active-marker reveal and composition views correct; rebuild source-mapped or virtual-composition views conservatively until incremental source-map reuse is explicitly designed.
- [x] Add benchmarks proving editable-index work scales with dirty fragments, not whole document size.
- [x] Add regression tests for source offset shifts, blank source lines, code blocks, links, emoji, and hidden/revealed controls across reused fragments.

Design notes:

- Layout must expose update metadata alongside `DocumentLayout`: parse mode, dirty normalized block range, suffix y-offset, and source text change. The editor should not infer this by comparing geometry.
- Editable fragments are owned by `(renderViewId, blockId, markerState)`. Hidden, active-marker, and composition render views must not share fragments unless their source map identity is the same.
- Reuse policy is conservative: prefix fragments before the dirty range can be reused as-is; suffix fragments can be reused only after applying source-offset transform and layout y/block/line translation; dirty blocks, active marker blocks, composition blocks, and viewport boundary blocks are rebuilt.
- Source offsets remain authoritative. A reused fragment must transform every `sourceOffsets` entry plus `sourceRange` and `tokenRange`; if a change overlaps a fragment source range, rebuild it.
- Viewport mode is an allowed optimization layer on top of dirty-block reuse, but the first implementation should keep a full logical index and only make fragment construction incremental. Virtualization can follow after equivalence tests pass.
- Cache invalidation keys: markdown version, layout version, font readiness epoch, container width, render view source-map identity, active control ranges, and composition replacement range.

Acceptance:

- [x] 100KB local edit, remote edit, and AI append no longer spend over 1s rebuilding editable index.
- [x] Reused editable fragments keep caret, hit-test, and selection geometry equivalent to a fresh full index.
- [x] Browser Storybook behavior remains unchanged after enabling incremental sidecar updates.

## Phase 11: Editor Core API

Goal: expose a stable product-facing editor API while keeping layout/editable internals replaceable.

- [x] Define a public controller API for markdown, selection, edit, input intent, undo/redo, composition, resize, and subscriptions.
- [x] Expose read-only render snapshots for layout, editable index, active controls, composition view, and viewport metadata.
- [x] Emit document, selection, composition, and viewport events without making browser DOM selection authoritative.
- [x] Migrate Storybook/debug handles to use the public controller API where practical.
- [x] Add API-level tests that do not depend on React, DOM rendering, Canvas, or Browser.

Acceptance:

- [x] A product integration can drive editing through public API only.
- [x] Existing DOM/Canvas stories keep their behavior after API migration.
- [x] `vp check --fix` and `vp test` pass.

## Phase 12: Markdown Editing Behavior

Goal: make common Markdown structures feel correct under source-exact editing.

- [x] Lists: Enter creates next item, empty item exits, Tab/Shift+Tab changes indentation.
- [x] Task lists: checkbox toggles source without breaking selection.
- [x] Blockquotes: Enter continues quote, empty quote exits.
- [x] Fenced code: Enter, Tab, paste, and multi-line selection remain source-exact.
- [x] Links/images/headings: control-marker editing, rendered text replacement, and Backspace rules are covered.
- [x] Delete behavior across block and inline control boundaries is deterministic.

Acceptance:

- [x] Each structure has pure state tests and at least one browser interaction test.
- [x] Active control reveal rules remain correct after behavior additions.

## Phase 13: Selection And Mobile Hardening

Goal: broaden selection correctness before relying on native editing in a product surface.

- [ ] Mouse drag selection covers cross-block, reversed, code/list, and drag-outside-viewport cases.
- [ ] Keyboard selection covers Shift arrows, Option/Alt word, Command document, Home/End, and Page keys.
- [ ] Double/triple click rules cover CJK, emoji, links, and inline code.
- [ ] Touch automation covers viewport/touch events and documents OS selection-handle gaps.
- [ ] Selection screenshots cover DOM and Canvas small crops.

Acceptance:

- [ ] Pure geometry and browser tests cover all listed selection shapes.
- [ ] Mobile automation avoids OS-only interactions unless explicitly allowed.

## Phase 14: Viewport And Incremental Rendering

Goal: make benchmark wins visible in the real editor loop.

- [ ] Add viewport-aware editable indexing with overscan.
- [ ] Connect Canvas dirty tile cache to editor state, not just benchmarks.
- [ ] Rebuild active-marker and composition views locally where safe, with conservative fallback.
- [ ] Add dirty-region debug overlay and large-document Storybook fixtures.
- [ ] Verify AI append and remote patch do not force full editable rebuild when editing elsewhere.

Acceptance:

- [ ] 100KB typing stays on incremental path in tests/benchmarks.
- [ ] AI streaming append plus user editing remains responsive in Storybook.

## Phase 15: Visual Parity Harness

Goal: keep DOM, Canvas, and rendered Markdown behavior aligned by fixture instead of manual guessing.

- [ ] Build a fixture gallery for headings, lists, quotes, code, tables, links, images, emoji, CJK, and bidi.
- [ ] Render each fixture through Premark DOM and Canvas paths with stable small screenshot crops.
- [ ] Diff text/caret/selection geometry and classify expected vs unexpected differences.
- [ ] Keep fixing until no new non-expected mismatch is found in the current fixture matrix.

Acceptance:

- [ ] Fixture screenshots are deterministic and small enough to review.
- [ ] New mismatches identify whether layout, paint, editable sidecar, or input state is responsible.

## Phase 16: Collaboration And AI Streaming

Goal: prove the Premark-native path supports the intended collaboration and AI behavior.

- [ ] Define a remote source patch API suitable for later CRDT integration.
- [ ] Rebase local caret/selection through remote patches deterministically.
- [ ] Define composition behavior when remote patches arrive.
- [ ] Add AI append and same-block modification simulations.
- [ ] Add a Storybook demo where AI streams while the user edits another block.

Acceptance:

- [ ] Remote patches do not interrupt local input.
- [ ] AI append avoids full layout/editable rebuild when possible.
- [ ] Selection rebasing is deterministic under tests.

## Phase 17: Real macOS IME Final Gate

Goal: finish the OS-only validation when the machine is available.

- [ ] Run Pinyin commit/cancel/replacement/cross-block/undo.
- [ ] Review candidate-window anchoring screenshot artifacts.
- [ ] Enable and run Japanese commit/cancel/replacement.
- [ ] Enable and run Korean commit/cancel/replacement.
- [ ] Record OS limitations and reproducible setup steps.

Acceptance:

- [ ] Pinyin scenarios pass on real macOS HID.
- [ ] Japanese/Korean pass the prepared scenario sets.
- [ ] Failure artifacts are sufficient to debug regressions.

## Iteration Log

### 2026-04-20

- Rejected CodeMirror overlay and removed overlay-specific playground modes, stories, tests, scripts, and dependencies.
- Studied MarkText/Muya. It validates a custom rendered Markdown editor, but Premark should keep source/layout authoritative instead of trusting browser-mutated rendered DOM.
- Implemented core native editor: source document state, stable ranges, grapheme helpers, editable layout index, selection geometry, input intents, textarea bridge, undo manager, composition model, clipboard, and Storybook DOM/Canvas prototypes.
- Added broad automated coverage for selection, hit-test, input, composition, mobile emulation, visual viewport, screenshots, active marker reveal, source-preserving newlines, font readiness, and Canvas-native interaction.
- Fixed notable geometry failures: parser block index mismatch, proportional inline x, heading marker reveal drift, active reveal index mismatch in Canvas story, wrapped-line affinity/y boundary, multiline code-block y, source newline gaps, font-load stale widths, internal revealed-control caret placement, editable-run source maps, bare URL visibility, and repeated ZWJ emoji Canvas drift.
- Current verification baseline after emoji Canvas fix: `vp check --fix` passes with two existing warnings, `vp test` passes 166 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests.
- Existing warnings are unrelated: `tools/wiki-canvas/src/cli.ts` unused `ScannedNote`, and `packages/wiki-canvas/src/layout.ts` `new Array<number>(cols).fill(0)`.

### 2026-04-21

- Assumption: Phase 7 should be completed before adding new editing behavior because geometry/renderer mismatch can invalidate higher-level behavior tests.
- Possible plan change: if Phase 7 exposes renderer limits in Canvas text shaping, introduce a shared text-run paint abstraction rather than patching `drawTile` locally.
- Prepared experiments: compare editable boundary tables, fresh Canvas measurements, and recorded Canvas `fillText` positions across the fixture matrix.
- Phase 7 started. Added a pure text-geometry invariant matrix and a Canvas-native repeated emoji browser fixture. The matrix immediately found a real active-marker source-map bug: exact revealed boundaries shared by adjacent runs were always mapped to the smaller source offset, so `before` caret positions at the end of visible controls could jump backward. Boundary mapping is now side-aware: the first boundary maps as `start`, later boundaries map as `end`.
- Verification after the first Phase 7 batch: `vp check --fix` passes with the two existing warnings, targeted geometry/reveal tests pass 40 tests, full `vp test` passes 168 tests, `vp run build` passes, and `vp run test:browser` passes 19 Playwright tests.
- Completed Phase 7. Canvas drawing now treats emoji and Markdown/link control punctuation as boundary-sensitive: normal text still draws in chunks, while boundary-sensitive graphemes are placed at `measureGraphemeBoundaryXs` positions. Added draw tests for repeated emoji, revealed `**` controls, and link suffix controls. Cache review result: font loading is gated before Storybook layout construction, editable boundary caches are WeakMap-keyed by fragment objects, active reveal creates new editable indexes, and resize/refresh rebuild layout plus editable index. Added a regression that switches hidden/revealed indexes and resizes a document after measuring.
- Phase 8 started. Added pointer word/block selection command support, DOM and Canvas story wiring for double-click word selection and triple-click paragraph selection, and browser coverage for both renderers. Hidden textarea bridges now use `pointer-events: none` so the OS input bridge cannot intercept repeated surface clicks. Added browser coverage for reversed cross-block drag selection and expanded keyboard coverage for Home/End, Shift+Home, Alt+ArrowLeft, and Meta+ArrowUp/Down.
- Completed Phase 8. Enter now inserts one source newline, and `insertParagraph` plus textarea `insertLineBreak` normalize to the same intent. Added pure and browser coverage for source-exact insert/delete/paste/Enter inside strong markers, heading markers, link suffix controls, and rendered-inline-content replacement that preserves surrounding controls. Canvas native story now supports paste/cut through the same hidden textarea bridge. Added committed Canvas-native visual baselines for control, link, and emoji editing states; reviewed all three crops manually.
- Phase 9 benchmark script added as `vp run benchmark:native-editor`. It reports large-document layout plus editable index, local/remote/AI incremental layout, Canvas dirty tile command counts, stable range rebasing, and concurrent workspace edit+AI streaming. On 2026-04-20 with `--chars 100000 --docs 120 --iterations 3`, layout stayed roughly tens of milliseconds and local/remote/AI parse mode stayed incremental with one dirty block, but editable index rebuild was about 1.4-1.5s before sidecar optimization attempts and remained over 1s after a reverted local optimization attempt. Assumption conflict: core Premark layout is fast enough to keep pursuing, but the current editable sidecar is not yet incremental. Plan changed by adding Phase 10.
- Phase 10 started. Design decision: do not guess dirty ranges from geometry; have layout expose update metadata, then let editor rebuild dirty/active/composition blocks and transform reusable suffix fragments. A local optimization that only precomputed some source-map scans was tried and reverted because benchmark results were not stable and did not address the real full-index architecture problem.
- Phase 10 API work started. `DocumentLayout` now carries optional update metadata for full vs incremental layout, dirty normalized block range, suffix block mapping/y offset, and parser source change. This is the input the editor sidecar needs before it can safely reuse editable fragments. Targeted layout/editor tests and `vp run build` pass.
- Editor refresh now computes one incremental parse result and passes it into layout via `applyParseResult`, so editor state, layout update metadata, and future sidecar reuse can share the same source change instead of parsing twice. Targeted editor/input/layout tests pass.
- Incremental editable sidecar API added. `createIncrementalEditableLayoutIndex` rebuilds dirty layout blocks, reuses stable prefix fragments as-is, transforms stable suffix fragments through source-change and layout suffix metadata, then regenerates virtual source-newline fragments. Source-mapped active marker views still rebuild conservatively. Editor state now uses this path for normal hidden-marker editing. Benchmark result on 2026-04-21 with `--chars 100000 --docs 120 --iterations 3`: full editable index was about `1.67-1.73s`; incremental editable index was about `37-55ms` for local edit, remote edit, and AI append. `vp check --fix`, `vp test`, `vp run build`, and `vp run test:browser` pass; browser coverage stayed at 25 passing tests.
- Phase 10 completed with a conservative boundary: hidden-marker editor state uses incremental editable fragments; active-marker/source-mapped and virtual composition render views rebuild full indexes for now because their rendered markdown/source-map identity differs from the hidden view. This keeps correctness while leaving source-map-aware sidecar reuse as a future optimization, not a blocker for the current native editor route.
- Non-OS phases are complete. Remaining unchecked items are real macOS IME/candidate-window validation and Japanese/Korean OS scenarios, intentionally deferred until Zixuan allows OS-level input automation again. Cleaned the two unrelated persistent check warnings in wiki-canvas files so routine validation should be warning-free.
- Added a non-interactive macOS IME dry-run path. `vp run test:macos-ime:dry-run` checks Swift helpers and input-source availability, records likely Pinyin/Japanese/Korean candidates, and writes `test-results/macos-ime/dry-run.*` without launching a browser or posting keyboard/HID events. Local dry run on 2026-04-21 found Pinyin and US sources available, current input source was WeType Pinyin, and no Japanese/Korean source candidates were enabled.
- Expanded the real macOS Pinyin runner into explicit scenarios for commit, cancel, rendered-text replacement, cross-block replacement, and undo. These scenarios remain gated behind the existing foreground/HID checks and were not run because they would post global HID events.
- Generalized the macOS IME runner into `pinyin`, `japanese`, and `korean` scenario sets, added a Pinyin candidate-window screen artifact path, and documented `PREMARK_MACOS_IME_SCENARIO_SET`. Dry-run verification passed for all three sets without launching a browser or posting HID; current system still has no Japanese/Korean input-source candidates enabled.
- Added Phases 11-17 to keep the plan moving from prototype toward product integration, Markdown behavior, viewport performance, visual parity, collaboration/AI, and final OS IME gates.
- Completed Phase 11. Added `PremarkEditorController` as the product-facing API for markdown, selection, edits, input intents, undo/redo, composition, resize, subscriptions, and render snapshots. Render snapshots now own active Markdown control reveal and virtual composition render views, so DOM and Canvas stories no longer rebuild those views locally. Verification on 2026-04-21: `vp check --fix`, `vp test` passed 186 tests, `vp run test:browser` passed 25 Playwright tests, and `vp run build` passed.
- Phase 12 started. Added Markdown-aware Enter for unordered, ordered, task-list, and blockquote lines; empty list/quote lines exit their structure. Added Tab/Shift+Tab line indent/outdent intent from keydown, source-exact Tab/Enter/paste behavior inside fenced code, and task checkbox toggles through both helper and controller APIs while preserving selection. Browser coverage now exercises list continuation, list indent/outdent, and blockquote continuation/exit through the real hidden textarea path. Verification on 2026-04-21: `vp check --fix`, `vp test` passed 194 tests, `vp run test:browser` passed 26 Playwright tests, and `vp run build` passed.
- Completed Phase 12 Markdown editing behavior: list/blockquote continuation and exit, task checkbox toggles, fenced-code source exact edits, heading boundary Backspace, link/image rendered-label replacement, and deterministic source-exact deletes near inline controls.
- Added browser coverage through the native Storybook editor for heading marker deletion, list indentation/continuation, quote continuation/exit, link label replacement, and image alt replacement.
- Current verification for Phase 12 completion: `vp test packages/editor/tests/input-commands.test.ts` passes 30 tests, `vp check --fix` passes, `vp test` passes 198 tests, `vp run test:browser` passes 26 Playwright tests, and `vp run build` passes.
- Assumption remains unchanged: real macOS HID/IME validation is deferred until the machine is free and Zixuan explicitly allows OS-level input.
- Next planned experiments: Phase 13 selection hardening, especially cross-block/reversed drag, keyboard Shift variants, Page/Home/End behavior, CJK/emoji/link double-click boundaries, touch-event automation, and small DOM/Canvas screenshot crops.
