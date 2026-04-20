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
- macOS automation has three separate layers: targeted `CGEventPostToPid` can prove real OS key events reach the browser process and hidden textarea, but it bypasses macOS input-method composition; browser foregrounding is required for real IME; global HID/System Events key routing must reach the focused hidden textarea before Pinyin can be trusted.
- The current Codex host can foreground Chrome, but global HID key events route to `body` instead of the focused hidden textarea. The macOS runner records this as a skip artifact by default and can be made strict with `PREMARK_MACOS_IME_STRICT=1`.
- Screenshot mode exposed a real source-map bug: layout `blockIndex` is the normalized layout-block index, not the parser source-block index. Editable source mapping now scans rendered fragments in source order and then resolves the containing parser block span.
- Mobile selection behavior is now split into two claims: Playwright mobile emulation covers Premark touch pointer selection, soft-keyboard-style `input` events, visual viewport shrink, and overlay geometry; OS long-press handles, magnifier behavior, native selection affordances, and real soft-keyboard candidate bars remain a documented real-device gap.
- Active inline marker reveal is now modeled as an explicit rendered view over the same source ranges. Normal hidden-marker layout still maps raw marker offsets to visible token edges; active-marker layout reveals strong/code/link source text and keeps caret/hit-test addressable in original Markdown offsets.
- macOS HID/IME tests must not be run while Zixuan is actively using the machine because they foreground Chrome and post global key events. Until a dedicated automation machine or trusted device-level path is available, keep those checks manual/paused unless Zixuan explicitly asks to run them.
- Inline caret placement cannot use proportional character counts. `EditableLayoutIndex` must measure prefix widths with the fragment font, and inline code needs its visual pill padding excluded from the editable text span.
- Precise inline positioning now has a concrete acceptance shape: caret rects, hit-test offsets, and selection rects must all come from the same measured prefix-boundary table, while browser tests independently recompute a variable-width click point with Canvas `measureText` so proportional-width regressions cannot pass by round-tripping through the same bug.
- The first `Editing/Premark Canvas Native Editor` story is a real Canvas rendering surface with a hidden textarea input bridge and DOM-only debug panels. It validates the native editing route separately from the earlier DOM debug renderer.
- Markdown control reveal must be default editing behavior, not a special screenshot mode. Collapsed carets reveal the controls whose source range affects the caret; non-collapsed selections hide any control whose complete source range is already contained by the selection.
- Block-level control reveal needs block-specific rendering tricks: headings keep heading style by keeping the real heading marker and inserting an escaped visible copy, while fenced code blocks are wrapped in a longer outer fence so the original fences and code text render as code content.
- Reveal layouts must carry explicit source maps. Any transform that inserts escaped visible controls or invisible parser separators cannot be mapped back to source by searching rendered text in the original Markdown.
- Selection and pointer geometry must be parameterized by the current rendered view's `EditableLayoutIndex`. A story can render an active-marker/reveal layout while the editor state still owns the hidden-marker base index; mixing those indices collapses hidden control offsets such as heading `#` and `# ` onto the same x coordinate.
- Most caret x/y bugs should be caught without Browser. `measureText` plus Premark layout line y/height is enough for source-offset caret x, hit-test x, selection rect x, wrapped-line y, blank-line gaps, and multiline code-block y. Browser tests should mostly prove Storybook/Canvas wiring and visual baselines.
- Caret positions need affinity at source offsets shared by two visual fragments. `before` maps to the previous visual line end, while `after` maps to the next visual line start. Collapsed selection geometry currently prefers `before` so a logical line-end caret does not unexpectedly paint as the next visual line start.
- Native editor layout must be source-preserving for newline characters. Standard Markdown preview may collapse softbreaks, but the editable surface must render every source `\n` as a visual line advance and must expose blank source lines as caret-addressable geometry.
- Font loading is part of geometry correctness. Layout and editable-fragment prefix-width caches must not be created before the Storybook Google Fonts stylesheet has registered its `@font-face` rules and the relevant FontFaceSet entries have loaded; otherwise Canvas can measure with fallback fonts and later paint with real fonts.
- `document.fonts.status` is too broad for caret acceptance because unrelated fallback glyphs can continue loading after the target Latin fragment is ready. The reliable test is target-fragment `document.fonts.check(fragment.font, fragment.text)` plus a strict delta between layout fragment width and a fresh `canvas.measureText` width.
- Revealed Markdown controls need per-character source boundaries, not only token-level ranges. Escaped visible controls such as `\]\(https://example\.com\)` can otherwise collapse adjacent source offsets, especially when the rendered fragment spans both a revealed control suffix and following normal text.

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
- [x] Define supported initial editing scope: paragraph, heading, list item, blockquote, code block.
- [x] Define unsupported/deferred scopes: table cell rich editing, image resize, HTML block editing.
- [x] Define browser matrix: Chromium first, macOS IME required before claiming success.
- [x] Define manual fallback policy if real OS IME exposes a browser bug.
- [x] Create a pitfall-to-test matrix for IME, hidden textarea, selection, mobile, clipboard, Unicode, bidi, accessibility, visual stability, and remote edits.
- [x] Define screenshot artifact policy: crop size limits, deterministic fonts/theme, animation disabled, artifact folder, and review checklist.

Acceptance:

- [x] A new contributor can explain how selection, hit-test, input, composition, and rendering connect.
- [x] No CodeMirror dependency is needed to understand or run the native editor prototype.
- [x] Every known pitfall has an automated test plan or an explicit documented automation gap.

## Phase 1: Hit-Test And Source Mapping

Goal: make rendered Premark output addressable enough to edit directly.

- [x] Add fragment rect/source-range data to layout output or a sidecar index.
- [x] Implement `hitTest(x, y) -> sourceOffset`.
- [x] Implement `sourceOffsetToCaretRect(offset, affinity)`.
- [x] Implement line/word/block granularity hit-test helpers.
- [x] Add tests for Latin, CJK, emoji, inline code, links, list markers, blockquotes, and code blocks.
- [x] Add grapheme fixtures for combining marks, emoji ZWJ sequences, flags, skin tones, and CJK punctuation.
- [x] Add bidi fixtures for mixed English/Hebrew/Arabic/numbers/Markdown markers, even if first support is limited to documented behavior.
- [x] Add coordinate transform tests for scroll, zoom, device scale factor, and nested canvas/world transforms.

Acceptance:

- [x] Clicking rendered text places caret at the expected source offset.
- [x] Drag selection across blocks produces one continuous source range.
- [x] Hit-test works without relying on browser DOM selection.
- [x] Hit-test and caret rect tests pass for hidden-marker and active-marker states.

## Phase 2: Premark Selection Painting

Goal: paint native selection and caret on the rendered surface.

- [x] Add selection range to renderer input.
- [x] Paint multi-line and cross-block selection rects.
- [x] Paint caret rect with blink disabled in tests.
- [x] Support collapsed, forward, backward, and multi-block selections.
- [x] Add pure command support for mouse drag selection, drag reversal, keyboard arrows, Shift+arrows, and Shift+Command+arrows.
- [x] Wire mouse and keyboard selection commands to browser events in the prototype.
- [x] Define mobile selection behavior for touch long press, drag handles, soft keyboard focus, scroll, and zoom.
- [x] Add tests for select-all, Home/End, PageUp/PageDown, line boundary, word boundary, document boundary, and direction-preserving selection extension.
- [x] Add screenshot tests for forward selection, backward selection, wrapped-line selection, cross-block selection, active inline-token selection, and code-block selection in the DOM debug renderer.
- [x] Add active-marker reveal screenshots.
- [x] Add high-DPI Canvas selection screenshots.
- [x] Add visual tests for selection overlays independent of CodeMirror.

Acceptance:

- [x] Selection over rendered Markdown looks continuous across paragraphs/lists/code.
- [x] Selection geometry matches source range mapping within strict pixel thresholds.
- [x] Desktop and mobile-specific selection behaviors have automated coverage or an explicit documented automation gap.
- [x] Codex has reviewed the saved selection screenshots and recorded whether they match expected geometry and styling.

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
- [x] Add focus/textarea-anchoring tests for zoom and mobile visual viewport resize.

Acceptance:

- [x] Typing updates Premark-rendered text without remounting the visible document.
- [x] Paste and undo/redo operate on source ranges.
- [x] Browser selection is not the source of truth.
- [x] Event trace fixtures are saved for critical input cases and compared against expected normalized editor operations.

## Phase 4: IME

Goal: support real composition without hiding behind CodeMirror.

- [x] Track `compositionstart/update/end` as a composing source range.
- [x] Render preedit text in Premark with underline/style matching platform expectation as closely as practical for the DOM debug prototype.
- [x] Commit and cancel composition without losing source selection.
- [x] Create macOS-only runner with input-source selection, real OS key-event focus probe, screenshot artifacts, and strict/skip behavior.
- [ ] Run macOS Pinyin real IME tests.
- [ ] Add Japanese and Korean scenarios after Pinyin stabilizes.
- [x] Test browser/spec event-order variants: `beforeinput`/`compositionupdate`/`input`/`compositionend` can arrive in different orders and must normalize to the same editor operation.
- [x] Assert composition update never commits real source, never enters undo, and never requires changing browser DOM selection near the composition range.
- [x] Add first screenshot for composition preedit text in the DOM prototype.
- [x] Add browser screenshots for replacement of selected text and composition near strong/code/link markers.
- [ ] Add candidate-window anchoring screenshots when the OS screenshot path can capture it.
- [x] Add remote/AI patch tests during composition: before range, after range, inside selected replacement range, and overlapping composition range.

Acceptance:

- [ ] macOS Pinyin commit, cancel, selected replacement, undo/redo, and cross-block selection pass.
- [x] Composition does not replace or remount the rendered surface.
- [x] Codex has reviewed saved IME screenshots or documented why a specific OS-level candidate window cannot be captured automatically.

## Phase 5: Prototype Story

Goal: replace the removed CodeMirror Storybook examples with a native Premark editing prototype.

- [x] Add Storybook `Editing/Premark Native Editor`.
- [x] Add Storybook `Editing/Premark Canvas Native Editor`.
- [x] Click rendered text to place caret.
- [x] Drag across blocks to select.
- [x] Type, delete, paste, and undo in supported blocks.
- [x] Show debug overlay for source offsets, hit-test rects, and selection ranges.
- [x] Add a screenshot mode that renders small fixed-size crops for key states: idle, caret, selected range, inline token, composition, paste preview, and remote edit.
- [x] Add first Playwright screenshot artifacts for idle, typing, selection, and replacement states.
- [x] Add first Playwright screenshot artifact for composition preedit.
- [x] Add Playwright coverage for Canvas-native hit-test, typing, drag replacement, and synthetic composition.
- [x] Add measured inline-position browser acceptance for Canvas-native variable-width text.
- [x] Add a screenshot review log template beside the generated artifacts.

Acceptance:

- [x] The story demonstrates multi-line and cross-block selection.
- [x] The story has no CodeMirror dependency.
- [x] Story screenshots are deterministic enough for Playwright visual comparison and small enough for manual Codex review.

## Phase 6: Pitfall Automation And Screenshot Audit

Goal: convert the research checklist into automated coverage and visual review gates.

- [x] Create `tests/editor/pitfalls/README.md` with every known pitfall, source, automation status, and owner.
- [x] Create first Playwright suite for the native editor Storybook desktop pointer/input flow and screenshot crops.
- [x] Add Playwright coverage for desktop keyboard selection and browser clipboard paste/cut in the native editor story.
- [x] Expand Playwright suites for visual viewport, DOM debug renderer, and screenshot-mode crops.
- [x] Add Canvas renderer screenshot suite.
- [x] Add Canvas-native editor visual baseline and Codex-reviewed screenshot entry.
- [x] Add first browser composition suite using synthetic `composition*` events against the Storybook hidden textarea.
- [x] Create macOS-only IME suite using real OS input where possible and clear skips where CI cannot provide the OS permission, foreground app, or input source.
- [x] Create mobile-emulation suite for touch, visual viewport, soft keyboard modeling, and selection geometry; record gaps requiring real-device validation.
- [x] Create DOM screenshot review artifacts with one small crop per scenario and a Codex-reviewed `review.md` that records pass/fail and visual notes.
- [x] Create mobile screenshot review artifacts with Codex-reviewed visual notes.
- [x] Create Canvas screenshot review artifacts with Codex-reviewed visual notes.
- [x] Add CI/reporting guidance so screenshot failures include the actual/expected/diff images and event traces.

Acceptance:

- [x] No phase can be marked complete without either passing automated pitfall tests or documenting a specific automation gap.
- [x] Screenshot crops have been reviewed by Codex, not only generated by CI.
- [x] Visual diffs are stable on the chosen baseline OS/browser/font configuration.

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
- Added source granularity helpers on `EditableLayoutIndex`: coordinate hit-test can now return character, word, line, or block source ranges. Keyboard selection intents now cover word movement, line boundaries, and page movement in addition to character, visual line, and document-boundary movement. Browser coverage includes Alt+ArrowRight and Shift+End through the Storybook hidden textarea path.
- Expanded hit-test fixtures across Latin, CJK, emoji ZWJ, inline code, links, list items, blockquotes, and fenced code blocks. This exposed that code blocks were opaque layout lines with no editable fragments; added an initial code-block fragment so code content can be addressed by source range.
- Added editor coordinate transform helpers for client, surface, device-pixel, and nested world coordinates. Tests cover scroll offsets, CSS scale, device scale factor, and world offset/scale round trips before Canvas integration starts.
- Updated the accepted design doc with the current supported/deferred editing scope, Chromium/macOS/mobile matrix, IME fallback policy, and screenshot artifact policy. Phase 0 requirements are now closed against that doc and the pitfall matrix.
- Expanded Playwright focus/anchoring coverage to include CSS zoom and a mobile context with touch input plus visual viewport shrink modeling. This does not claim full native mobile handle support, but it closes the hidden-textarea anchoring case under mobile-style viewport changes.
- Added a bidi fixture for mixed English, Hebrew, Arabic, numbers, strong markers, and link markers. Current support is explicitly limited to logical UTF-16 source-offset hit-test behavior; precise visual-order bidi caret movement remains a later task.
- Reconciled plan state with the implemented DOM prototype: Premark paints caret/selection overlays without CodeMirror, browser tests cover rendered click, cross-block drag, typing, paste/cut, and deterministic screenshot crops.
- Added composition cancel coverage: virtual preedit updates leave source and undo history unchanged, cancel clears the composition view, and the original selected source range is preserved.
- Added select-all as an explicit normalized input intent and expanded keyboard selection coverage for Home/End, PageUp/PageDown, word, line boundary, document boundary, and anchor-preserving extension. Browser coverage now includes Control+A through the Storybook input bridge.
- Added a browser mutation-injection test for the DOM debug renderer. If rendered Markdown DOM is changed externally, the next Premark input render restores the surface from editor source and the injected text never enters Markdown.
- Added Storybook screenshot mode for deterministic small crops covering idle, caret, forward/backward selection, wrapped selection, cross-block selection, inline-token selection, composition preedit, paste preview, remote edit, and high-DPI DOM selection.
- Screenshot review found and fixed a source mapping bug caused by treating normalized layout `blockIndex` as parser source block index. `EditableLayoutIndex` now maps visible fragments by source-order scanning and resolves each fragment back to the containing parser block span; a regression test covers list items followed by inline-token paragraphs.
- Reviewed the screenshot-mode artifacts after the fix. DOM debug renderer screenshots are accepted for this phase; active-marker reveal styling, Canvas screenshots, and real mobile selection-handle screenshots remain pending.
- Verification for the screenshot/source-map iteration: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 111 tests, `vp run build` passes, and `vp run test:browser` passes 9 Playwright tests.
- Added reusable input trace fixtures for Chromium/WebKit composition order, Firefox composition input-after-end, composition cancel, soft-keyboard text insertion without keydown, beforeinput edit commands, selection plus clipboard, and keyboard selection granularity. The fixtures compare raw trace events to expected normalized editor intents.
- Added a mobile-emulated Playwright test for tap focus, soft-keyboard-style input without keydown, synthetic touch pointer drag selection, and selection overlay geometry. Codex reviewed the mobile screenshot artifact and recorded the real-device gap for OS long-press handles, magnifier behavior, native selection affordances, and real soft-keyboard candidate bars.
- Verification for the input/mobile iteration: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 113 tests, and `vp run test:browser` passes 10 Playwright tests.
- Expanded composition automation: event-order trace fixtures now close the browser/spec variant item, core tests cover remote edits before, after, inside, and overlapping a composition range, and a browser test verifies composition rerenders keep DOM selection out of the rendered surface while the hidden textarea remains focused.
- Verification for the composition automation iteration: targeted composition/core tests pass and `vp run test:browser` passes 11 Playwright tests.
- Added Playwright browser reporting guidance. Browser test artifacts now write to ignored `artifacts/playwright-browser`, the HTML report writes to `artifacts/playwright-browser-html`, and `tests/browser/ci-reporting.md` documents uploading failure screenshots, trace zips, future actual/expected/diff images, and event trace fixtures.
- Verification for browser reporting: `vp check --fix` passes with existing warnings, `vp run test:browser` passes 11 Playwright tests, generated screenshot crops are present under `artifacts/playwright-browser`, and the HTML report exists under `artifacts/playwright-browser-html`.
- Added strict selection geometry threshold tests that compare selection rect edges to source caret positions for inline text, wrapped text, and code blocks. Added and reviewed a code-block selection screenshot crop, closing the DOM debug renderer selection acceptance items while Canvas screenshots remain separate.
- Verification for the selection geometry iteration: `vp check --fix` passes with existing warnings, `vp test` passes 118 tests, and `vp run test:browser` passes 11 Playwright tests.
- Re-ran macOS IME automation. Chrome foregrounding now works and targeted process key events can pass the US focus probe, but global HID key events target `body` instead of the focused hidden textarea. The runner now performs a required global HID US probe before real Pinyin, records `hid-probe-failed.png/json` plus `pinyin-skip.txt`, and exits successfully unless strict mode is enabled.
- Added first Canvas selection screenshot coverage. `drawTile` now accepts Premark selection and caret overlay geometry, Storybook has a high-DPI `Editing/Premark Canvas Selection` crop, and Playwright checks the Canvas backing store plus nonblank pixel content before saving `native-editor-canvas-selection-hidpi.png`.
- Codex reviewed the Canvas selection crop and recorded the visual notes in `tests/browser/screenshot-review.md`. This closes Canvas selection screenshot coverage only; active-marker reveal styling and final Canvas visual parity remain open.
- Verification for the Canvas screenshot iteration: `vp check --fix` passes with existing warnings, `vp test` passes 118 tests, `vp run build` passes, and `vp run test:browser` passes 12 Playwright tests.
- Added active inline marker reveal coverage. The editor package can derive an active-marker Markdown view for strong/code/link tokens, hidden-marker caret rects now have explicit tests, and active-marker hit-test maps visible marker glyphs back to original source offsets.
- Added `native-editor-shot-active-marker.png` to the deterministic Storybook screenshot matrix. Codex reviewed the crop: the raw `**` markers are visible, the caret remains inside the active strong token, and the line reflows without overlap.
- Verification for the active-marker iteration: `vp check --fix` passes with existing warnings, targeted `vp test packages/editor/tests/editable-layout.test.ts` passes, full `vp test` passes 120 tests, `vp run build` passes, and `vp run test:browser` passes 12 Playwright tests.
- Added browser composition screenshot coverage for selected replacement and preedit near strong/code/link rendered tokens. The Storybook fixture now includes a rendered link so the link-label composition path has a deterministic crop.
- Codex reviewed `native-editor-shot-composition-replace.png`, `native-editor-shot-composition-strong.png`, `native-editor-shot-composition-code.png`, and `native-editor-shot-composition-link.png`. All four crops show visible preedit underline and caret placement without unexpected line shifts; OS candidate-window anchoring remains blocked by the macOS HID routing gap.
- Verification for the composition screenshot iteration: `vp run test:browser` passes 12 Playwright tests.
- Re-ran macOS IME automation once before pausing HID work. It still skipped real Pinyin because global HID key events did not reach the focused hidden textarea. Per Zixuan's instruction, do not run macOS HID/IME tests again while the machine is in active use.
- Added committed Playwright visual baselines for idle, cross-block selection, active marker reveal, composition near link text, and high-DPI Canvas selection. Codex reviewed the five baseline images before marking the visual-diff gate closed.
- Verification for visual baselines: `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost vp exec playwright test tests/browser/native-editor-visual.spec.ts --update-snapshots` generated the initial baselines, and `vp run test:browser` passes 14 Playwright tests in normal comparison mode.
- Changed the Storybook DOM debug renderer to keep the rendered `.pmd-doc` and `.pmd-surface` nodes stable across render updates, including composition updates. The renderer now detects external DOM mutation that detaches those cached nodes and rebuilds the rendered tree before applying the next source-authoritative render.
- Strengthened the browser composition test to assert the editor surface, rendered document node, and rendered surface node remain stable during composition while browser DOM selection stays out of the surface. `vp run test:browser` passes 14 Playwright tests after this change.
- Closed remaining non-OS pitfall matrix gaps. Added a deterministic cross-block composition replacement test through normalized composition intents, and added browser coverage that the hidden textarea bridge is discoverable as a focused labelled multiline textbox while staying visible enough for platform input.
- Updated `tests/editor/pitfalls/README.md` so no pitfall remains `planned`: macOS Pinyin and candidate-window work stay blocked by the documented HID/capture gap, while accessibility, screenshot stability, active marker reflow, and cross-block synthetic composition now have concrete automated coverage.
- Verification for pitfall closure: targeted `vp test packages/editor/tests/input-commands.test.ts` passes 15 tests, full `vp test` passes 121 tests, `vp check --fix` passes with existing warnings, and `vp run test:browser` passes 15 Playwright tests.
- Fixed inaccurate inline caret and hit-test placement. Editable fragments now carry font and text inset data; caret x, hit-test offsets, and selection rects use measured prefix widths instead of `fragment.width * offset / text.length`. Inline code maps text positions inside the 6px pill padding on each side.
- Added regression coverage for variable-width inline text, inline-code caret padding, and measured selection rects. Verification: `vp check --fix` passes with existing warnings, `vp test` passes 123 tests, `vp run build` passes, and `vp run test:browser` passes 15 Playwright tests without refreshing visual baselines.
- Added `Editing/Premark Canvas Native Editor`. The story renders Markdown into Canvas through `drawTile`, keeps a hidden textarea only as the OS input bridge, exposes DOM debug panels for tests, and supports Canvas click, drag selection, typing, and synthetic composition.
- Added Canvas-native browser acceptance for precise inline positioning. The test recomputes the `WWWW` click coordinate with a fresh Canvas `measureText` context, asserts the proportional estimate differs by more than 8px, verifies hit-test maps to the `WWWW` source offset, and checks the painted caret x against the measured coordinate.
- Added a Canvas-native visual baseline and screenshot review entry. The first reviewed crop shows the Canvas surface renders heading/list/variable-width text/inline code/link/CJK/emoji without relying on a DOM rendered text surface.
- Verification for the Canvas-native editor iteration: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 123 tests, `vp run build` passes, and `vp run test:browser` passes 17 Playwright tests. macOS HID/IME tests were intentionally not run because they foreground Chrome and post global key events.
- Fixed Markdown control reveal behavior. `createActiveMarkerRevealMarkdown` now supports heading, fenced code block, strong, emphasis, strikethrough, code span, and link controls; both DOM and Canvas native stories run reveal by default instead of only in `?marker=active`.
- Added `packages/editor/tests/marker-reveal.test.ts` for show/hide boundaries: heading caret, heading plus inline style, full-heading selection hide, fenced-code caret and inner selection, full-code selection hide, inline style caret/source-boundary reveal, full-token selection hide, inner styled selection reveal, and caret just outside hide.
- Added browser coverage proving the normal Storybook editor reveals `#`, `**bold text**`, and full link Markdown at active carets, while a selection containing those full source ranges hides the controls again.
- Refined inline control reveal to preserve rendered semantics: visible marker glyphs are rendered as plain escaped text, while the original Markdown token remains in the reveal markdown so bold stays bold, links stay links, and inline code stays inline code. Code-span reveal uses an invisible separator around escaped backticks to avoid changing Markdown parsing, and editable source mapping ignores that separator.
- Verification for Markdown control reveal: `vp check --fix` passes with the two existing wiki-canvas warnings, targeted marker/editable-layout tests pass 22 tests, `vp test` passes 133 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
- Fixed heading caret drift after block control reveal. Root cause: the reveal renderer inserted a visible escaped `#` copy, but `EditableLayoutIndex` still inferred source ranges by searching rendered fragments in the original Markdown. That worked accidentally for some inline text but was unsound for block controls because one rendered line can contain both inserted control glyphs and original text.
- The fix is to make reveal output include an explicit revealed-markdown-to-source map, pass it into `createEditableLayoutIndex`, and map layout fragments through the revealed document instead of guessing against the original source. Added a pure regression for heading caret positions and a browser regression that compares Premark's caret x to a real DOM `Range` measurement at the heading text start.
- Tightened the heading fix after Zixuan noticed the `# ` control width was still not modeled explicitly enough. Editable fragments now carry per-visible-character source offsets, so caret, hit-test, and selection do not derive x from `sourceRange.from + characterCount`. The heading regression now asserts the `Native` caret x equals the measured width of visible `# ` before the title text.
- Verification for heading caret source-map fix: `vp check --fix` passes with the two existing wiki-canvas warnings, targeted marker/editable-layout tests pass 23 tests, `vp test` passes 134 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests.
- Fixed the Canvas native story offset `0` / offset `1` regression. Root cause: Canvas rendered the active reveal layout but called `createSelectionGeometry(editor)` without the active reveal index, so heading control source offsets were resolved against the hidden base layout. `createSelectionGeometry`, `beginPointerSelection`, and `updatePointerSelection` now accept an explicit `EditableLayoutIndex`; DOM and Canvas stories pass their current render-view index through the geometry and pointer paths.
- Added regression coverage that active reveal geometry places heading offset `1` to the right of offset `0`, and the Canvas browser test now asserts the same behavior before continuing with measured variable-width hit-test, typing, drag replacement, and composition.
- Verification for the Canvas heading geometry fix: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 135 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
- Expanded pure geometry tests to cover y-axis line boundaries. Wrapped visual-line boundaries now respect `before`/`after` affinity, and `hitTest` treats line bottoms as half-open so the exact y at the next line top selects the lower line, not the previous line.
- Added explicit affinity behavior for source offsets shared by wrapped visual lines, and changed collapsed `SelectionGeometry` to use the previous visual line at a boundary. This catches the class of bugs where a caret at the end of a line is painted at the next line start.
- Fixed multiline fenced code-block geometry. Code blocks are now split into one editable fragment per source line; caret x is measured against that line's monospace text and caret y comes from `line.y + padding.top + lineIndex * lineHeight`. The new pure test catches the previous bug where `const y` on the second code line was painted on the first line with an x derived from the whole code block width.
- Verification for the pure geometry expansion: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 142 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
- Added source-preserving newline layout mode. `StyleConfig.lineBreakMode` defaults to standard Markdown behavior, while the native editor stories and `EditorDocumentState` use `lineBreakMode: "source"`. In source mode, paragraph softbreaks become real visual lines, block gaps use the source newline count, and the editable index creates virtual empty fragments for blank source lines so caret/hit-test can land on them.
- Added tests for `abc\ndef`, `abc\n\ndef`, `abc\n\n\ndef`, trailing blank lines, styled softbreaks inside strong/link tokens, real next-block starts, and multiline code blocks. This keeps parser semantics intact while making the editing surface source-accurate.
- Refreshed reviewed Playwright visual baselines after the source-preserving newline change. The DOM and Canvas editor crops now show explicit source line advances rather than Markdown-preview spacing.
- Verification for source-preserving newline layout: `vp check --fix` passes with the two existing wiki-canvas warnings, `vp test` passes 147 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
- Added shared `preloadLayoutFonts` in the layout package and reused it from wiki-canvas and native editor stories. Storybook preview now exposes a font stylesheet readiness promise so stories do not call FontFaceSet before Google Fonts has registered Inter/JetBrains Mono.
- Changed DOM and Canvas native editor stories to wait for story fonts before constructing layout engines and `EditorDocumentState`, avoiding stale fallback-font widths in layout, hit-test, caret, and selection caches.
- Tightened Canvas-native browser acceptance: the story marks `data-fonts-ready="1"` only after preload, and the test now asserts target fragments are font-ready and that layout fragment width matches a fresh browser `canvas.measureText` width within 1px.
- Refreshed and reviewed the Canvas-native visual baseline. The old baseline used fallback/serif-like metrics; the new baseline intentionally shows Inter/JetBrains Mono metrics and validates the font-ready path.
- Verification for font-ready Canvas/native geometry: `vp check --fix` passes with the two existing wiki-canvas warnings, targeted layout/editable tests pass 22 tests, full `vp test` passes 149 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
- Fixed caret placement inside revealed inline controls. Escaped marker/source-map segments are now emitted per visible source character, and editable layout normalizes mapped source boundaries when an escaped control suffix is merged into a larger rendered text fragment. Regression tests cover `**abc**` marker interiors, standalone link suffixes, and Canvas-style inline content before `[docs](https://example.com)`.
- Added Canvas-native browser coverage that places the caret inside `**` and around the `//` in a revealed link suffix before continuing with typing, drag replacement, and composition.
- Verification for inline-control internal caret placement: `vp check --fix` passes with the two existing wiki-canvas warnings, full `vp test` passes 152 tests, `vp run build` passes, and `vp run test:browser` passes 18 Playwright tests. macOS HID/IME tests were not run.
