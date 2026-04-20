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
- The hidden textarea bridge should first be a pure model: active same-block selections mirror only the current block source, cross-block selections keep an empty bridge value and route replacement/deletion through the editor source selection.
- Selection painting should be split into a geometry contract and renderer implementation. The geometry contract can be tested deterministically before browser/Canvas screenshots exist.
- Pointer and keyboard selection should also be split: first a pure command layer over source offsets, then browser event wiring and screenshots.
- Input should follow the same split: normalized intents can be fully tested against the source model before wiring real browser `beforeinput` / `input` events.
- Browser `historyUndo` / `historyRedo` should normalize into explicit history intents and share the same local undo manager used by source operations.
- The first Storybook prototype can reuse the HTML renderer for visible Markdown while Premark editor core owns selection, caret, hit-test, hidden textarea sync, and source operations. This is still a DOM debug renderer, not the final Canvas renderer.
- Browser automation must set `NO_PROXY=127.0.0.1,localhost` in this environment; otherwise Playwright's local web-server readiness probe can be routed through the proxy and time out.
- Screenshot review caught a real bug: pointer hit-test could land inside an emoji ZWJ sequence and leave a stale suffix after replacement. Pointer selection now snaps hit-test offsets to grapheme boundaries before updating source selection.
- Synthetic browser composition events are useful as a fast guard for DOM event wiring, but they are not a substitute for real macOS IME automation because they do not exercise OS candidate windows or native event ordering.
- The DOM prototype now renders composition preedit with a lightweight Premark overlay underline. It is acceptable for the debug renderer but still needs real OS IME screenshots before claiming platform parity.
- Hidden textarea anchoring needs browser-level checks because pure geometry tests cannot catch focus loss or wrong absolute positioning after scrolling.
- macOS automation has two separate layers: targeted `CGEventPostToPid` can prove real OS key events reach the browser process and hidden textarea, but it bypasses macOS input-method composition. Real Pinyin/candidate-window coverage must use System Events or HID events with the browser as the foreground app.
- The current Codex host cannot make Chrome the foreground app; the macOS runner records this as a skip artifact by default and can be made strict with `PREMARK_MACOS_IME_STRICT=1`.

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
- [x] Add grapheme fixtures for combining marks, emoji ZWJ sequences, flags, skin tones, and CJK punctuation.
- [ ] Add bidi fixtures for mixed English/Hebrew/Arabic/numbers/Markdown markers, even if first support is limited to documented behavior.
- [ ] Add coordinate transform tests for scroll, zoom, device scale factor, and nested canvas/world transforms.

Acceptance:

- [ ] Clicking rendered text places caret at the expected source offset.
- [ ] Drag selection across blocks produces one continuous source range.
- [ ] Hit-test works without relying on browser DOM selection.
- [ ] Hit-test and caret rect tests pass for hidden-marker and active-marker states.

## Phase 2: Premark Selection Painting

Goal: paint native selection and caret on the rendered surface.

- [x] Add selection range to renderer input.
- [ ] Paint multi-line and cross-block selection rects.
- [ ] Paint caret rect with blink disabled in tests.
- [x] Support collapsed, forward, backward, and multi-block selections.
- [x] Add pure command support for mouse drag selection, drag reversal, keyboard arrows, Shift+arrows, and Shift+Command+arrows.
- [x] Wire mouse and keyboard selection commands to browser events in the prototype.
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

- [x] Add hidden textarea/input bridge anchored near caret.
- [x] Keep platform focus in the bridge while visible caret/selection are Premark-rendered.
- [x] Convert normalized `beforeinput` / `input` / keyboard commands into source operations.
- [x] Wire real browser `beforeinput` / `input` / keyboard events to normalized source operations in the Storybook prototype.
- [x] Handle core insert text, delete/backspace, Enter, selectionchange, and composition intents.
- [x] Handle undo/redo through normalized history intents and `LocalUndoManager`.
- [x] Handle paste and clipboard transforms in the core intent path.
- [x] Keep bridge content minimal to avoid DOM editor behavior becoming the product.
- [x] Add an input event trace recorder for `keydown`, `beforeinput`, `input`, `keyup`, `selectionchange`, `composition*`, `paste`, `copy`, and `cut`.
- [x] Add tests proving text insertion does not rely on keydown, so mobile autocorrect/autosuggest/swipe-like input can be modeled as input operations.
- [x] Add clipboard tests for Markdown, plain text, HTML, cross-block cut, cross-block paste, and paste while a selection is active.
- [x] Add focus/textarea-anchoring tests for scroll, viewport resize, and editor blur/refocus.
- [ ] Add focus/textarea-anchoring tests for zoom and mobile visual viewport resize.

Acceptance:

- [ ] Typing updates Premark-rendered text without remounting the visible document.
- [ ] Paste and undo/redo operate on source ranges.
- [ ] Browser selection is not the source of truth.
- [ ] Event trace fixtures are saved for critical input cases and compared against expected normalized editor operations.

## Phase 4: IME

Goal: support real composition without hiding behind CodeMirror.

- [x] Track `compositionstart/update/end` as a composing source range.
- [x] Render preedit text in Premark with underline/style matching platform expectation as closely as practical for the DOM debug prototype.
- [ ] Commit and cancel composition without losing source selection.
- [x] Create macOS-only runner with input-source selection, real OS key-event focus probe, screenshot artifacts, and strict/skip behavior.
- [ ] Run macOS Pinyin real IME tests.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [ ] Test browser/spec event-order variants: `beforeinput`/`compositionupdate`/`input`/`compositionend` can arrive in different orders and must normalize to the same editor operation.
- [ ] Assert composition update never commits real source, never enters undo, and never requires changing browser DOM selection near the composition range.
- [x] Add first screenshot for composition preedit text in the DOM prototype.
- [ ] Add screenshots for replacement of selected text, composition near strong/code/link markers, and candidate-window anchoring when the OS screenshot path can capture it.
- [ ] Add remote/AI patch tests during composition: before range, after range, inside selected replacement range, and overlapping composition range.

Acceptance:

- [ ] macOS Pinyin commit, cancel, selected replacement, undo/redo, and cross-block selection pass.
- [ ] Composition does not replace or remount the rendered surface.
- [ ] Codex has reviewed saved IME screenshots or documented why a specific OS-level candidate window cannot be captured automatically.

## Phase 5: Prototype Story

Goal: replace the removed CodeMirror Storybook examples with a native Premark editing prototype.

- [x] Add Storybook `Editing/Premark Native Editor`.
- [x] Click rendered text to place caret.
- [x] Drag across blocks to select.
- [x] Type, delete, paste, and undo in supported blocks.
- [x] Show debug overlay for source offsets, hit-test rects, and selection ranges.
- [ ] Add a screenshot mode that renders small fixed-size crops for key states: idle, caret, selected range, active marker, composition, paste preview, and remote edit.
- [x] Add first Playwright screenshot artifacts for idle, typing, selection, and replacement states.
- [x] Add first Playwright screenshot artifact for composition preedit.
- [x] Add a screenshot review log template beside the generated artifacts.

Acceptance:

- [ ] The story demonstrates multi-line and cross-block selection.
- [ ] The story has no CodeMirror dependency.
- [ ] Story screenshots are deterministic enough for Playwright visual comparison and small enough for manual Codex review.

## Phase 6: Pitfall Automation And Screenshot Audit

Goal: convert the research checklist into automated coverage and visual review gates.

- [ ] Create `tests/editor/pitfalls/README.md` with every known pitfall, source, automation status, and owner.
- [x] Create first Playwright suite for the native editor Storybook desktop pointer/input flow and screenshot crops.
- [x] Add Playwright coverage for desktop keyboard selection and browser clipboard paste/cut in the native editor story.
- [ ] Expand Playwright suites for visual viewport, DOM debug renderer, Canvas renderer, and more screenshot crops.
- [x] Add first browser composition suite using synthetic `composition*` events against the Storybook hidden textarea.
- [x] Create macOS-only IME suite using real OS input where possible and clear skips where CI cannot provide the OS permission, foreground app, or input source.
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
- Added input event trace normalization for composition event-order variants, soft-keyboard-style input without keydown, clipboard events, selectionchange events, and Shift/Command arrow keyboard selection intents.
- Added `EditorDocumentState` to tie the in-memory adapter, parser state, inline source map, layout, editable index, selection, and composition session into one reusable core object for later DOM/Canvas editor views.
- Added grapheme sidecar helpers for segmentation, caret snapping, and delete backward/forward ranges over combining marks, emoji ZWJ sequences, flags, skin tones, and CJK text.
- Added a pure textarea bridge snapshot/diff model. Active-block input maps textarea offsets back to source ranges, cross-block replacement/deletion routes through the editor selection, and tests cover collapsed caret at a next-block boundary so it is not misclassified as cross-block.
- Added `SelectionGeometry` as the renderer-facing selection/caret contract. Tests cover collapsed caret, forward selection, backward selection, and cross-block multi-rect geometry. This completes the core geometry layer only; DOM/Canvas painting and screenshots are still open.
- Added pure selection commands for pointer drag/reversal and keyboard movement. Tests cover grapheme-safe ArrowLeft/ArrowRight, Shift+Arrow extension, Shift+Command-style document boundary extension, and wrapped-line ArrowDown movement.
- Added `applyInputIntent` to apply normalized input intents to `EditorDocumentState`. Tests cover text replacement, cross-block deletion, grapheme-safe delete backward/forward, Enter paragraph insertion, selectionchange, and virtual-to-committed composition.
- Connected normalized `historyUndo` / `historyRedo` intents to `LocalUndoManager`. Text edits and composition commits can now record undo entries through `applyInputIntent`; tests cover undo/redo round trips.
- Added core clipboard intent handling. Paste chooses Markdown before plain text before a simple HTML-to-text fallback; cut uses the same source edit path. Tests cover selection paste, HTML fallback, cross-block paste, and cross-block cut.
- Added Storybook `Editing/Premark Native Editor`. It renders Markdown through Premark HTML layout, paints Premark selection/caret overlays, anchors a hidden textarea near the caret, wires pointer drag and keyboard/input/beforeinput events into editor core, and records textarea edits in `LocalUndoManager`. `vp run storybook:build` passes; screenshot tests are still open.
- Added Playwright browser coverage for the native editor Storybook. The test builds Storybook, serves the static output, clicks the rendered surface, types through the hidden textarea, drags a rendered selection, replaces the selected range, and saves small screenshots for manual review. Codex reviewed the generated screenshots on 2026-04-20 and accepted idle, typing, selection, and replacement crops after fixing grapheme snapping.
- Wired Storybook hidden textarea `compositionstart/update/end` events into `applyInputIntent` and added a Playwright synthetic composition test. Real macOS IME testing remains open.
- Added `tests/browser/screenshot-review.md` with the first Codex visual review entry and pending screenshot categories.
- Added Storybook paste/cut event wiring and Playwright coverage for Shift+Arrow, Shift+Command+Arrow, paste, and cut. Added a DOM debug composition underline overlay and reviewed the generated composition preedit screenshot.
- Added Playwright focus/textarea anchoring coverage for scroll, blur/refocus, and viewport resize. Zoom and mobile visual viewport remain open.
- Added `vp run test:macos-ime`: it builds Storybook, selects macOS input sources through Carbon, verifies real OS key events can reach the hidden textarea through `CGEventPostToPid`, and attempts real Pinyin only when Chrome can be made foreground. In the current Codex host Chrome cannot become foreground, so the runner records `pinyin-skip.txt` and `pinyin-skipped-no-foreground.png`; `PREMARK_MACOS_IME_STRICT=1` turns that documented gap into a hard failure.
