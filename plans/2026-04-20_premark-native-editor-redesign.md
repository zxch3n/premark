# Premark Native Editor Redesign Plan

Status: Phase 19 mostly complete; DOM/Canvas stories now share the browser input host
Owner: Codex / Zixuan
Last Updated: 2026-04-21
Compaction Rule: after memory reload or compaction, reread this whole file before continuing.

## Current Objective

- Productize the browser input host so DOM, Canvas, Safari, and real OS-input paths share one hidden-textarea/IME/pointer implementation.
- Preserve the Safari/WebKit and real foreground interaction acceptance added in Phase 18.
- Keep the native Premark-rendered editor as the product path; CodeMirror overlay remains removed.
- Record core invariants, architecture decisions, and test-ladder rules in `AGENTS.md` so future agents get the right assumptions before touching editor code.

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
- Word hit-test fallback must be point-aware, not just source-offset/affinity-aware. Caret placement can legitimately resolve to the end of a grapheme, while double-click word selection should still select the grapheme that visually received the hit.
- Phase 9 benchmarks show the core layout engine is already incremental for local edit, remote edit, and AI append, but editable sidecar rebuild is still full-document and dominates large editor updates. The next architecture step is dirty-block/viewport editable indexing, not more CodeMirror fallback.
- macOS IME automation can be prepared without posting OS events: dry-run now validates helpers/input sources and scenario selection for Pinyin, Japanese, and Korean. Real IME correctness still requires foreground HID.
- Viewport editable indexes need layout blocks to carry their source block index. Without that, a viewport built from the middle of a large document can map repeated text to an earlier identical paragraph.
- Render dirty regions should stay in layout coordinates and be clipped by viewport at the edge of Canvas drawing. A dirty offscreen AI append should produce no visible dirty rect.
- Active-control and composition render views can use viewport-bounded full rebuilds as the conservative path; the normal source render path remains the incremental path for offscreen local/remote/AI edits.
- Visual parity needs both screenshots and source-addressed geometry metadata. Screenshots catch paint regressions, while fixture reports classify caret/selection failures without relying on pixel diffs alone.
- Remote patches should be an explicit controller API, not just `applyEdit(recordUndo:false)`. Batch patches are applied from higher source offsets to lower ones so CRDT/remote callers can provide current-document coordinates without earlier changes shifting later ranges.
- Composition under remote patches has three product states: preserved when the replacement text is unchanged, conflict when a remote patch touches the replacement range, and optional cancel-on-conflict for integrations that prefer fail-closed composition.
- Real macOS IME validation has two separate gates: targeted `CGEventPostToPid` can prove browser/input plumbing, but native IME composition requires the browser to be the foreground app and global HID to reach it. On 2026-04-21, targeted Chrome key events passed while foreground checks failed (`System Events` saw Notion; `NSWorkspace` saw `loginwindow`).
- The macOS IME runner now stops before sending global HID if the browser is not foreground, so failed OS focus no longer risks typing probe characters into another app.
- macOS input-source readiness should use `TISCreateInputSourceList(..., includeAllInstalled: true)` plus each source's enabled flag. The enabled-only list can omit selectable input modes such as Japanese Romaji Hiragana and make the runner falsely think a source is unavailable.
- `NSWorkspace = loginwindow` was explained by `CGSessionCopyCurrentDictionary`: the session reports `CGSSessionScreenIsLocked=1`. Phase 17 real HID must not run while locked even if process-targeted key events still work.
- Real macOS IME tests should use the isolated bundled browser by default. Existing Google Chrome windows can receive foreground activation instead of the Playwright-controlled window.
- System Events key codes are the reliable real-IME sender in this environment. Swift `CGEvent` HID can reach Chrome for US key input, but can bypass Text Services composition for Pinyin; targeted `CGEventPostToPid` remains useful only for plumbing checks.
- Korean 2-set exposed two native-input requirements: do not rewrite the hidden textarea value/selection during active native input, and suppress an `insertLineBreak` that immediately follows an Enter-key composition commit.
- Hidden textarea write suppression must be narrow. Real Korean native input needs value/selection preservation while composing Hangul, but normal browser typing and synthetic composition tests still need bridge value resync after each input event.
- Safari/WebKit needs first-class acceptance. Hidden textarea focus, `beforeinput`/`input` ordering, `compositionend` timing, visual viewport, Canvas text measurement, and touch selection are all areas where WebKit can differ from Chromium.
- Safari WebDriver is useful for isolated browser behavior, but it is not the right transport for foreground OS IME key injection because Safari automation sessions are guarded from stray keyboard/mouse input.
- iOS Safari is not a smaller version of desktop Safari for this editor. Soft keyboard focus, visual viewport resize, touch handles, autocorrect, and mobile IME need their own smoke gate.
- The first Playwright WebKit proxy suite passes in Chromium reference, WebKit, and mobile WebKit emulation. It validates the bridge/event trace, rendered DOM editing, Canvas geometry/input, and a mobile hidden-textarea smoke path, but it still is not real Safari or real mobile IME proof.
- Local Safari preflight found `/usr/bin/safaridriver` included with Safari 18.5. This confirms the machine can host a Safari WebDriver runner after enabling remote automation, but does not prove the real foreground Safari IME path.
- Desktop Safari WebDriver runner is implemented, but local execution is currently blocked by Safari Remote Automation being disabled. `safaridriver --enable` asks for a password in this environment, so Zixuan must enable it once.
- Playwright remains a weak oracle for real OS input timing. Real double/triple click, cross-block HID drag, macOS keyboard shortcuts, and system clipboard cut/copy/paste now have a separate foreground `real-interactions` runner for Chrome-based browsers and Safari.
- Regular Safari foreground interaction tests should use Safari AppleScript `do JavaScript` only for state inspection and System Events / Swift HID for input. Safari WebDriver stays separate because automation windows are not a valid proof for foreground OS input.
- Storybook currently owns too much product logic: hidden textarea synchronization, IME preservation, Korean line-break suppression, clipboard handling, keyboard normalization, pointer sessions, and click-count tracking are duplicated between DOM and Canvas stories. This conflicts with the product architecture and should move into a reusable browser input host.
- `renderSnapshot()` currently builds source, active-control, and composition views directly. This is correct enough, but view identity/cache ownership should eventually move into a render view manager so active controls and composition can become incrementally reusable.
- Font readiness cannot remain only a Storybook convention. The editor needs an explicit font/measurement epoch or refresh API before product integration, because caret geometry depends on the font used by `measureText`.

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
- [x] Run real macOS Pinyin tests when the machine is available.
- [x] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [x] Review candidate-window anchoring screenshots after an allowed OS run.

Acceptance:

- [x] Composition does not replace/remount the rendered surface.
- [x] Real macOS Pinyin commit/cancel/replacement/undo/cross-block cases pass.

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

- [x] Mouse drag selection covers cross-block, reversed, code/list, and drag-outside-viewport cases.
- [x] Keyboard selection covers Shift arrows, Option/Alt word, Command document, Home/End, and Page keys.
- [x] Double/triple click rules cover CJK, emoji, links, and inline code.
- [x] Touch automation covers viewport/touch events and documents OS selection-handle gaps.
- [x] Selection screenshots cover DOM and Canvas small crops.

Acceptance:

- [x] Pure geometry and browser tests cover all listed selection shapes.
- [x] Mobile automation avoids OS-only interactions unless explicitly allowed.

## Phase 14: Viewport And Incremental Rendering

Goal: make benchmark wins visible in the real editor loop.

- [x] Add viewport-aware editable indexing with overscan.
- [x] Connect Canvas dirty tile cache to editor state, not just benchmarks.
- [x] Rebuild active-marker and composition views locally where safe, with conservative fallback.
- [x] Add dirty-region debug overlay and large-document Storybook fixtures.
- [x] Verify AI append and remote patch do not force full editable rebuild when editing elsewhere.

Acceptance:

- [x] 100KB typing stays on incremental path in tests/benchmarks.
- [x] AI streaming append plus user editing remains responsive in Storybook.

## Phase 15: Visual Parity Harness

Goal: keep DOM, Canvas, and rendered Markdown behavior aligned by fixture instead of manual guessing.

- [x] Build a fixture gallery for headings, lists, quotes, code, tables, links, images, emoji, CJK, and bidi.
- [x] Render each fixture through Premark DOM and Canvas paths with stable small screenshot crops.
- [x] Diff text/caret/selection geometry and classify expected vs unexpected differences.
- [x] Keep fixing until no new non-expected mismatch is found in the current fixture matrix.

Acceptance:

- [x] Fixture screenshots are deterministic and small enough to review.
- [x] New mismatches identify whether layout, paint, editable sidecar, or input state is responsible.

## Phase 16: Collaboration And AI Streaming

Goal: prove the Premark-native path supports the intended collaboration and AI behavior.

- [x] Define a remote source patch API suitable for later CRDT integration.
- [x] Rebase local caret/selection through remote patches deterministically.
- [x] Define composition behavior when remote patches arrive.
- [x] Add AI append and same-block modification simulations.
- [x] Add a Storybook demo where AI streams while the user edits another block.

Acceptance:

- [x] Remote patches do not interrupt local input.
- [x] AI append avoids full layout/editable rebuild when possible.
- [x] Selection rebasing is deterministic under tests.

## Phase 17: Real macOS IME Final Gate

Goal: finish the OS-only validation when the machine is available.

- [x] Run Pinyin commit/cancel/replacement/cross-block/undo.
- [x] Review candidate-window anchoring screenshot artifacts.
- [x] Run Japanese commit/cancel/replacement after foreground HID is available.
- [x] Run Korean commit/cancel/replacement after foreground HID is available.
- [x] Record OS limitations and reproducible setup steps.

Acceptance:

- [x] Pinyin scenarios pass on real macOS global key input.
- [x] Japanese/Korean pass the prepared scenario sets.
- [x] Failure artifacts are sufficient to debug regressions.

## Phase 18: Safari And WebKit Acceptance

Goal: prove the native Premark editor works on Safari/WebKit surfaces before relying on it as a product path.

- [x] Add a Playwright WebKit core suite or project for the existing browser editor tests.
- [x] Classify every Playwright WebKit failure as implementation bug, WebKit event-order difference, unsupported synthetic limitation, or expected visual difference.
- [x] Add an event trace fixture that compares Chromium and WebKit for `keydown`, `beforeinput`, `input`, `compositionstart/update/end`, `isComposing`, selection, and textarea value/selection.
- [x] Add a Safari WebDriver preflight/runbook for `safaridriver --enable`, Safari Technology Preview when available, one-session-only constraints, and artifact output.
- [x] Add a desktop Safari behavior runner that opens the Storybook editor and validates focus bridge, typing, delete/Enter, keyboard selection, pointer selection, paste/cut, visual crops, and Canvas geometry.
- [x] Add a foreground real-interaction runner for Chrome-based browsers covering real text input, shortcut selection, system clipboard cut/copy/paste, Return, double/triple click, cross-block drag, and Canvas click/drag.
- [x] Add the same foreground real-interaction scenario set for regular Safari, using Apple Events only for state inspection.
- [ ] Add a real foreground Safari IME runner separate from WebDriver automation windows, with the same session/foreground/input-source gates as the Chrome for Testing macOS IME runner.
- [ ] Run real Safari Pinyin commit/cancel/replacement, then Japanese/Korean if the foreground runner is stable.
- [ ] Add an iOS/iPadOS Safari runbook and smoke gate for connected-device WebDriver Remote Automation.
- [ ] Cover iOS soft keyboard focus, visualViewport resize/scroll, touch selection start/end/drag, autocorrect/predictive text smoke, and at least one mobile IME path.
- [ ] Add small Safari/WebKit screenshot artifacts and a review checklist for visual differences.

Acceptance:

- [x] Playwright WebKit passes the core native editor suite or has documented expected differences with owners.
- [ ] Chrome-based real-interaction runner validates OS keyboard, clipboard, pointer, and Canvas interaction scenarios in foreground mode.
- [ ] Regular Safari real-interaction runner validates OS keyboard, clipboard, pointer, and Canvas interaction scenarios in foreground mode, or records exact setup gaps.
- [ ] Desktop Safari or Safari Technology Preview validates hidden textarea focus, source updates, selection, clipboard, event traces, and Canvas caret/paint geometry.
- [ ] Real Safari macOS IME passes Pinyin at minimum, and Japanese/Korean either pass or have precise environment/product gaps recorded.
- [ ] iOS/iPadOS Safari smoke validates soft keyboard anchoring, visual viewport behavior, touch selection, and mobile IME/autocorrect behavior.
- [ ] Safari failures are classified by root cause; no issue is left as a generic "Safari bug".

## Phase 19: Productize Browser Input Host

Goal: remove duplicated browser input behavior from DOM and Canvas stories and make it reusable for product integrations.

- [x] Record Premark editor invariants, architecture decisions, and testing ladder in `AGENTS.md`.
- [x] Add a reusable browser input host in `packages/editor/src` for hidden textarea sync, keyboard normalization, beforeinput/input, composition, paste/cut, IME preservation, and pointer selection.
- [x] Migrate `Editing/Premark Native Editor` to the shared input host without changing behavior.
- [x] Migrate `Editing/Premark Canvas Native Editor` to the shared input host without changing behavior.
- [x] Add focused tests for the host's IME-preserve and Enter-after-composition suppression rules where practical.
- [x] Verify existing DOM/Canvas browser tests still cover typing, paste/cut, selection, composition, active controls, Canvas geometry, and WebKit proxy behavior.

Acceptance:

- [x] DOM and Canvas stories no longer duplicate hidden textarea / IME / pointer event logic.
- [ ] Korean native-input preservation and Enter suppression remain covered by macOS IME and browser regressions.
- [x] `vp check --fix`, `vp test`, `vp run test:browser`, and `vp run test:browser:webkit` pass or have exact environment skips recorded.

## Phase 20: Render View And Font Epoch Hardening

Goal: make render view identity and font-dependent measurement invalidation explicit before product integration.

- [ ] Design a render view manager for source, active-control, and composition views with explicit cache keys.
- [ ] Add a font/measurement epoch API to invalidate layout and editable geometry after web fonts become ready or font configuration changes.
- [ ] Add pure tests that simulate measurement epoch changes and assert caret/hit-test geometry rebuilds.
- [ ] Keep active-control and composition view reuse conservative until source-map-aware incremental reuse is proven.

Acceptance:

- [ ] Product code can trigger a measurement refresh without recreating the editor.
- [ ] Render snapshot cache identity is explicit and inspectable.
- [ ] No active-control/composition performance optimization can reuse geometry across incompatible source-map identities.

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
- Completed Phase 13 selection hardening. Added pure and browser coverage for Shift+Arrow left/right/up/down, Shift+Alt word movement, Shift+Meta document movement, PageUp/PageDown, code/list drags, drag outside the rendered surface, and double-click selection for CJK, emoji, links, and inline code.
- Fixed a real double-click bug near emoji punctuation: word granularity now uses the hit point for non-word grapheme fallback, so clicking the right half of `👨‍👩‍👧‍👦` selects that grapheme instead of the following `.` while normal caret placement can still land after the emoji.
- Storybook now exposes a read-only `pointForSourceRange` test helper for stable rendered-surface interaction tests without making DOM selection authoritative.
- Current verification for Phase 13 completion: `vp check --fix` passes, `vp test` passes 200 tests, `vp run build` passes, and `vp run test:browser` passes 28 Playwright tests.
- Next planned experiments: Phase 14 viewport-aware editable indexing, Canvas dirty tile integration in the live editor loop, large-document Storybook fixtures, and AI append plus user editing without full editable rebuilds.
- Completed Phase 14 viewport and incremental rendering. Layout blocks now expose `sourceBlockIndex`, editable indexes accept viewport+overscan, controller snapshots expose viewport/update/dirty rect metadata, Canvas drawing supports scroll and dirty clipping, and the Canvas native Storybook has a 110KB large-document fixture with render-update debug output.
- Added regression coverage for viewport source mapping with repeated text, large-controller viewport snapshots, offscreen AI append, and Storybook large-document scrolling/dirty paths. Active marker and composition views use viewport-bounded full rebuilds as the conservative fallback while normal source snapshots stay incremental.
- 100KB benchmark on 2026-04-21 with `--chars 100000 --docs 20 --iterations 1 --json`: viewport local edit, remote patch, and offscreen AI append all reported `editableIndexMode: incremental`, about 56-57 viewport fragments vs 7196 full-document fragments, and `viewportFragmentRatio: 0.01`; offscreen AI append produced `dirtyRectCount: 0`.
- Current verification for Phase 14 completion: `vp check --fix` passes, `vp test` passes 203 tests, `vp run build` passes, `vp run test:browser` passes 29 Playwright tests, and `vp run benchmark:native-editor -- --chars 100000 --docs 20 --iterations 1 --json` passes.
- Next planned experiments: Phase 15 visual parity harness. Start with a compact fixture gallery, then add deterministic DOM/Canvas screenshot crops and classify mismatches by layout, paint, editable sidecar, or input state.
- Completed Phase 15 visual parity harness. Added `Editing/Premark Visual Parity` with shared fixtures for headings/inline styles, lists/quotes, code/table, links/images, emoji/CJK, and bidi. Each fixture renders DOM and Canvas side by side and exposes caret/selection geometry plus issue classification through a Storybook debug API.
- Added six small visual parity screenshot baselines and browser assertions that expected text appears in the DOM renderer, caret/selection geometry is non-empty, and no current fixture reports unexpected geometry issues. Reviewed all six screenshots manually; current differences are visible style/paint differences, not layout-addressing failures.
- Current verification for Phase 15 completion: `vp check --fix` passes, `vp test` passes 203 tests, `vp run build` passes, `vp run test:browser` passes 30 Playwright tests, and targeted visual parity screenshot update plus non-update runs pass.
- Next planned experiments: Phase 16 remote patch API, local selection rebasing through remote edits, composition behavior under remote patches, AI append simulations, and a Storybook demo where AI streams while the user edits another block.
- Completed Phase 16 collaboration and AI streaming. Added `PremarkEditorController.applyRemotePatch` with `remote`/`ai` origins, actor metadata, multi-change patches, deterministic selection rebasing, local-undo isolation, composition preserved/conflict/canceled status, and render snapshot output.
- Added controller tests for remote selection rebasing, composition preservation and conflict, offscreen AI append on the viewport incremental path, and AI same-block modification while local selection stays elsewhere.
- Added a Canvas native streaming fixture. `fixture=streaming` demonstrates AI chunks appending through the remote patch API while the user edits a different block; `autostream=1` runs a short automatic stream for manual Storybook inspection. Browser coverage types locally, streams two AI chunks, and verifies local selection plus incremental rendering stay stable.
- Current verification for Phase 16 completion: `vp check --fix` passes, `vp test` passes 207 tests, `vp run build` passes, and `vp run test:browser` passes 31 Playwright tests.
- Remaining plan work is Phase 17 only. It is an OS-level macOS HID/IME validation gate and remains deferred by instruction while the machine is actively used.
- Zixuan allowed exclusive tests. Real Pinyin was attempted twice in strict mode and once in non-strict mode. Targeted Chrome key events passed, proving browser/input-bridge plumbing, but global IME/HID validation could not start because macOS would not make Chrome foreground. Direct AppleScript activation, System Events `frontmost`, `open -a`, AXRaise, Cmd-Tab via HID, Finder activation, iTerm activation, and `NSRunningApplication.activate` all failed to produce a valid Chrome foreground state.
- Current OS diagnostics: `System Events` reports Notion as frontmost, while `NSWorkspace` reports `loginwindow` as frontmost. The runner now treats this as a no-foreground OS gate failure and stops before posting global HID. Artifacts: `test-results/macos-ime/hid-probe-no-foreground.png`, `test-results/macos-ime/hid-probe-no-foreground.json`, and `test-results/macos-ime/ime-skip.txt`.
- Japanese and Korean dry-runs were rechecked. Both scenario sets are prepared, but current enabled input sources have no Japanese/Korean candidates, so real Japanese/Korean IME scenarios cannot run until those input sources are enabled.
- Phase 17 status: OS limitations and reproducible failure conditions are recorded; Pinyin/Japanese/Korean pass criteria remain open because the GUI foreground/input-source prerequisites are not satisfied in the current session.
- Added `vp run test:macos-ime:preflight`, which records input-source readiness from both enabled and all-installed TIS lists plus `System Events`/`NSWorkspace` foreground diagnostics without building Storybook, launching a browser, or sending HID. Reports are written both as shared files and scenario-specific files such as `preflight-pinyin.json`.
- Corrected an input-source false negative: Japanese Romaji Hiragana appears as enabled in the all-installed TIS list but not in the enabled-only list. The runner now uses all-installed plus enabled flags and selects sources from all-installed. Korean parent and 2-Set Korean were enabled through the helper; Pinyin, Japanese, and Korean preflights now all report their target source as enabled/installed.
- Verified `vp run test:macos-ime:dry-run` for Pinyin, Japanese, and Korean after the source-readiness fix. All three dry-runs now report `targetFound=true` and `targetInstalled=true`.
- Added `CGSessionCopyCurrentDictionary` to foreground diagnostics. It reports `CGSSessionScreenIsLocked=1`, which explains `NSWorkspace = loginwindow`; real Pinyin/Japanese/Korean HID scenarios must wait until the screen is unlocked and Chrome can become foreground. The real runner now checks this before launching a browser/server and writes `ime-skipped-locked-session.json` instead of attempting targeted or global key probes.
- After unlocking the session, Pinyin passed with `PREMARK_MACOS_IME_BROWSER_CHANNEL=bundled` and `PREMARK_MACOS_IME_GLOBAL_KEY_METHOD=system-events`. The default real-run path was changed to those values because installed Chrome can fight for foreground and Swift HID can bypass Pinyin composition.
- Pinyin key sequence was corrected: Space commits `你好`; the previous trailing Return inserted an unwanted source newline during replacement.
- Japanese required enabling the `Kotoeri.RomajiTyping` parent source before `Kotoeri.RomajiTyping.Japanese` could be selected. After that, Japanese commit/cancel/replacement passed through real System Events key input.
- Korean exposed real editor bugs. The hidden textarea bridge now avoids rewriting textarea value/selection during active input/composition, preserving Korean syllable composition such as `안녕`. It also suppresses the line break that Chrome emits immediately after Enter commits a Korean composition. Korean commit/cancel/replacement now pass.
- Candidate-window screen artifact was reviewed. The scenario itself passes and writes `pinyin-candidate-anchor-screen.png`, but current full-screen capture only shows wallpaper/menu bar, not browser/candidate-window contents. This is recorded as a Screen Recording/window-capture limitation rather than an editor failure.
- Final regression after tightening the IME bridge: suppress textarea value writes only for `InputEvent.isComposing` or Korean jamo/syllable `insertText`; normal input now resyncs the bridge. This fixed a Canvas browser regression where cross-block replacement followed by multi-character typing collapsed the markdown before synthetic composition.
- Final verification on 2026-04-21: `vp check --fix`, `vp test` (207 tests), `vp run build`, and `vp run test:browser` (31 Playwright tests) pass. Strict real macOS IME runs also pass for default Pinyin, `PREMARK_MACOS_IME_SCENARIO_SET=japanese`, and `PREMARK_MACOS_IME_SCENARIO_SET=korean` using bundled Chrome for Testing plus System Events.
- Phase 18 planned after Safari/WebKit research. Playwright WebKit should be the fast signal, Safari WebDriver should cover isolated desktop Safari behavior, real Safari foreground automation should cover OS IME, and iOS/iPadOS Safari needs a separate soft-keyboard/touch/viewport gate. Assumption: Safari support is product-critical for this editor architecture, not a nice-to-have compatibility pass.
- Phase 18 started. Added `playwright.webkit.config.ts`, `vp run test:browser:webkit`, `tests/browser/native-editor-webkit.spec.ts`, and Safari preflight/runbook files under `tests/safari`. First run passed: `vp run test:safari:preflight` found Safari 18.5 `safaridriver`; `vp run test:browser:webkit` passed 7 tests with 5 expected project skips across Chromium reference, WebKit, and mobile WebKit proxy. No WebKit mismatch was found in the initial proxy matrix.
- Added `vp run test:safari` as a no-dependency Safari WebDriver runner that talks directly to `safaridriver`. Local run reached session creation and skipped with a precise artifact because Safari Remote Automation is disabled. Attempting `safaridriver --enable` requested a password and failed non-interactively, so desktop Safari behavior acceptance remains blocked on one-time local setup rather than editor code.
- Corrected the browser-test ownership boundary: `playwright.config.ts` now ignores the WebKit acceptance spec so `vp run test:browser` remains the existing Chromium gate. Verification after the correction: `vp check --fix` passes with no warnings and `vp run test:browser` is back to 31 passing tests.
- Added `tests/real-interactions/run-real-interactions.mjs` and `tests/real-interactions/README.md`. The runner uses real foreground System Events / Swift HID input for Chrome-based browsers and regular Safari, while using Playwright or Safari Apple Events only to inspect editor state. The scenario set now covers real text input, Shift+Option word selection, Shift+Command document selection, Command+C/X/V with the system clipboard, Return, double/triple click, cross-block drag, and Canvas click/drag editing.
- Extended the Swift OS input helper with HID mouse click and drag commands so pointer gestures no longer depend on Playwright pointer synthesis. Planned experiment: run `vp run test:real-interactions:chrome` first because it has Playwright state inspection, then run `vp run test:real-interactions:safari` after confirming Safari allows JavaScript from Apple Events.
- Verification after adding real-interaction runners: `node --check tests/real-interactions/run-real-interactions.mjs`, `swift tests/macos-ime/os-input.swift check`, `vp check --fix`, `vp test` (207 tests), `vp run test:safari:preflight`, and `vp run test:browser:webkit` (7 passed, 5 skipped) all pass. `PREMARK_REAL_INTERACTIONS_TARGET=all node tests/real-interactions/run-real-interactions.mjs` safely skipped both Chrome and Safari because `CGSessionCopyCurrentDictionary` reports the macOS screen is locked, so no HID events were posted.
- Phase 19 started. Added the native-editor invariant and testing ladder guidance to `AGENTS.md`, keeping detailed execution state in this plan file for progressive context loading.
- Added `PremarkBrowserInputHost` in `packages/editor/src/browser-input-host.ts` and exported it through the editor package. It now owns hidden textarea bridge sync, keydown normalization, beforeinput/input application, paste/cut, composition start/update/end, Korean native-input preservation, Enter-after-composition suppression, click counting, word/block pointer selection, and drag selection.
- Migrated both DOM and Canvas native Storybook editors to the shared browser input host. This removed duplicated hidden textarea / IME / pointer event logic from the stories while leaving renderer-specific geometry and bridge positioning in each story.
- Added `packages/editor/tests/browser-input-host.test.ts` for the host's native-input preservation rules. Verification after the migration: `vp check --fix`, `vp test` (21 files, 210 tests), `vp run test:browser` (31 tests), and `vp run test:browser:webkit` (7 passed, 5 skipped) all pass.
- Deep demo-thinness review found one more product fix still living in Storybook: DOM rendered-tree synchronization preserved `.pmd-doc/.pmd-surface` identities during composition. Moved it into `packages/html-renderer/src/dom-render-host.ts` and changed the DOM story to use that host plus `createSelectionGeometry` from the editor package. Verification after the move: `vp check --fix`, `vp test`, `vp run test:browser`, and `vp run test:browser:webkit` pass.
- Remaining demo-thinness candidates: Canvas viewport/wheel/dirty-overlay render binding, test-only source-to-point helpers exposed on `window.__premark*`, and AI streaming fixture helpers. These are less urgent than input/DOM tree stability because they are either renderer binding or test fixture adapters, but product integration should eventually get reusable DOM/Canvas editor host packages.
