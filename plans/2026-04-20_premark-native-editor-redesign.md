# Premark Native Editor Redesign Plan

Status: Phase 25 completed; active table and image ranges render as editable source text
Owner: Codex / Zixuan
Last Updated: 2026-04-26
Compaction Rule: after memory reload or compaction, reread this whole file before continuing.

## Current Objective

- Keep source-mode editing on source whitespace semantics: every source space/newline that is editable must be measurable, paintable, hit-testable, and selectable.
- Keep source-mode parsing on editor semantics: line-leading spaces are editable text, and 4-space indentation does not implicitly create a code block.
- Keep active table editing source-exact: when the caret/selection touches a table block, only that table block renders as plain Markdown source text.
- Keep active image editing source-exact: when the caret/selection touches an image source line, only that image line/block renders as plain Markdown source text.
- Keep direct source offsets flowing from parser to layout to editable geometry for normal source-mode rendering.
- Keep active-control and composition preview layout isolated from the main document layout engine, because preview layout must not mutate incremental state for the source document.
- Keep DOM and Canvas Storybook examples as thin wrappers over reusable editor host APIs.
- Keep the native Premark-rendered editor as the product path; CodeMirror overlay remains removed.

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
- DOM selection/caret/composition overlay rendering, hidden textarea positioning, and stable rendered-tree mounting are editor renderer host behavior, not Storybook behavior.
- Canvas viewport/wheel handling, DPR setup, dirty clipping, dirty overlay debug paint, Canvas bridge positioning, and source-to-point test helpers belong in a Canvas editor host with customization hooks.
- Storybook browser gates must alias workspace package names to `src` entries; otherwise production Storybook builds can resolve stale local `dist` files and miss current source exports.
- Interactive Canvas editor rendering should repaint the full visible viewport every frame. Dirty rect metadata is still useful for layout benchmarks and debug reporting, but using it as a Canvas clip in the editor host is too fragile because caret, selection, composition, scroll, and overlay state can change outside the source dirty rect.
- `drawTile` must not expose `clipRect` for interactive editor rendering. Partial Canvas clears/clips create stale-pixel classes of bugs and make it too easy for a future host to re-enable partial repaint by accident.
- Plain Enter must not depend only on browser `beforeinput` delivery. The shared browser input host handles non-composing Enter at `keydown`, applies one source newline immediately, suppresses any following line-break input event, and leaves active IME composition Enter on the composition path.
- Editing semantics intentionally diverge from CommonMark loose-list grouping: an explicit blank source line between adjacent list items splits them into separate list blocks, so pressing Enter twice in the middle of a list creates two rendered lists with a caret-addressable blank line between them.
- Empty lines need explicit zero-width editable fragments whenever the rendered layout has no text glyph at the source caret offset. This includes true blank source lines and empty list-item content after the Markdown prefix; incremental editable rebuilds must regenerate these virtual fragments instead of reusing stale ones.
- Source-newline rendering must be checked at multiple layers. `a\n\nb\n\n\n\nc` is not fully covered by caret tests alone: layout block y, HTML block top styles, DOM rendered positions, and Canvas geometry all need to preserve the same `2` then `4` line-advance gaps.
- Vertical keyboard movement must use the existing editable visual-line order, not a guessed y position from the current line height. Target-line x should clamp to the nearest editable offset, so short lines and blank lines still receive the caret when they are the previous/next visual line.
- Blank source-line geometry must be layout-owned. `DocumentLayout.sourceLines` is the authority for source line offsets, y, height, and rendered/source-only classification; editable layout fills missing caret fragments from that table instead of guessing from neighboring fragments.
- Incremental layout reuse must rewrite reused suffix normalized blocks to their new `sourceBlockIndex`. Source-mode gap calculation reads `blockSpans[block.sourceBlockIndex]`; stale suffix indexes can make a correct source newline count render with extra or missing visual blank lines.
- Visual-line x geometry is now Canvas-owned after pretext chooses the line split. Pretext remains the wrapping/y authority, but layout rewrites text fragment x/width with Canvas `measureText`, editable geometry uses unscaled Canvas grapheme boundaries, and Canvas paint places boundary-sensitive chunks from the same table.
- Active-control tests must not compare hidden-marker geometry against revealed-marker geometry as if they were the same view. A caret at a link/code boundary can intentionally reveal `[` or backtick marker width; hidden-view fragment adjacency and active-view marker width need separate assertions.
- Active-control source-line geometry must map revealed-view line offsets back to original Markdown offsets before creating virtual blank-line fragments. Otherwise a heading reveal can shift following blank-line offsets and make the next selection appear to be inside the wrong block/control state.
- Active-control viewport builds need both cursors: original source cursor and revealed view cursor. Starting revealed text search at `0` is wrong for repeated text in a scrolled viewport; the first visible layout source line must seed the revealed cursor.
- Active-control generated wrapper lines, such as the outer fence used to reveal code-block controls, are not original source lines. Non-empty revealed source lines with no `sourceMap` coverage must not create source-only editable fragments.
- Source-mode layout cannot inherit Markdown/HTML collapsible whitespace rules. Spaces must be preserved in layout fragments, editable boundary tables, and Canvas paint calls, or caret/hit-test geometry will diverge from what the user sees.
- Source-mode parser policy cannot inherit all CommonMark block rules. In the editor path, line-leading spaces must stay in paragraph source spans, and indented code must be disabled so typing four spaces at line start does not change the block type; fenced code remains the explicit code syntax.
- Parser inline source ranges used by layout should be block-relative. Incremental parser reuse can keep block objects while their absolute source offsets shift; adding the block source base in layout avoids stale inline offsets.
- Source-mode prepared rich-text blocks carry absolute source offsets after preparation, so they cannot use the shared prepared-block memo. Normal hidden/source rendering may still reuse translated suffix lines if their fragment source offsets are transformed through the text change.
- Active-control and composition preview layouts must use an isolated one-shot layout engine. Reusing the main layout engine for preview text mutates its incremental cache and can corrupt the next source edit's suffix offsets.
- Shared fragment boundaries need right-side hit-test bias plus a small subpixel tolerance. Browser event coordinates can land just left of a glyph boundary after rounding; clicking rendered link text must not place the caret before the hidden `[` marker.
- Active table editing is not a global parser mode. The active render view must materialize only the touched table block as source text, so a second table elsewhere in the same document can remain rendered as a table.
- Image editing should use the same active source-text materialization path as tables. Standalone images normally render as opaque image blocks, but the active image source line must become editable raw Markdown while unrelated images keep normal image rendering.

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

## Phase 21: DOM And Canvas Editor Hosts

Goal: make the interactive DOM and Canvas examples thin wrappers over reusable host APIs.

- [x] Add `createPremarkDomEditorHost` as the DOM editor entry. It should own HTML render mounting, selection/caret/composition overlay DOM, hidden textarea positioning, point transforms, input host wiring, and source-to-point helpers.
- [x] Add DOM customization hooks for overlay classes/renderers, content inset, render callback, and renderMarkdown override while keeping source geometry non-overridable.
- [x] Add `createPremarkCanvasEditorHost` as the Canvas editor entry. It should own DPR setup, Canvas painting, selection/caret/composition paint options, viewport/wheel handling, dirty clip calculation, optional dirty overlay, hidden textarea positioning, and source-to-point helpers.
- [x] Add Canvas customization hooks for palette, paint callbacks, overlay colors, wheel policy, DPR policy, dirty overlay, and drawDocument override while keeping source geometry non-overridable.
- [x] Migrate `Editing/Premark Native Editor` to the DOM host.
- [x] Migrate `Editing/Premark Canvas Native Editor` to the Canvas host.
- [x] Keep test-only fixture helpers in Storybook only when they are clearly adapters over host/controller APIs, not product logic.

Acceptance:

- [x] DOM story does not implement selection/caret/composition overlay HTML or stable render-tree mounting itself.
- [x] Canvas story does not implement wheel/viewport, dirty clip, dirty overlay, DPR setup, or bridge positioning itself.
- [x] `vp check --fix`, `vp test`, `vp run test:browser`, and `vp run test:browser:webkit` pass.

## Phase 22: Source-Mode Whitespace And Geometry

Goal: make source-mode editing use source text semantics end to end, not Markdown reading whitespace semantics.

- [x] Add parser inline source ranges for text, html/entity, escape, code span, link label, bare URL, and other plaintext-visible inline nodes.
- [x] Store inline source ranges as block-relative ranges and add block source bases during layout, so incremental parser block reuse cannot leave stale absolute offsets.
- [x] Preserve whitespace in source-mode rich-text preparation and measure grapheme boundaries with Canvas `measureText` semantics.
- [x] Carry direct `sourceOffsets` and `sourceRange` on layout fragments in source mode, and let editable geometry consume those direct offsets before falling back to source-map text search.
- [x] Keep active-control/source-map views on explicit source maps, not direct layout offsets, because revealed controls can contain generated or non-contiguous source text.
- [x] Disable prepared-block memo reuse in source mode where prepared blocks contain absolute source offsets; transform reusable suffix line fragment offsets through source changes.
- [x] Isolate active-control and composition preview layout from the main source document layout engine.
- [x] Prefer the following fragment at shared x boundaries, with subpixel tolerance for browser coordinate rounding.
- [x] Add pure and browser regressions for repeated spaces, Canvas text paint, link-boundary hit-test, preview-layout cache pollution, and Enter caret placement.

Acceptance:

- [x] Multiple source spaces remain visible, editable, measured, and passed to Canvas paint without collapsing.
- [x] Link label clicks at the rendered glyph boundary insert into the label, not before hidden Markdown control characters.
- [x] Active-control previews cannot corrupt the next source edit's incremental layout offsets.
- [x] `vp check`, `vp test`, `vp run build`, and full Playwright Chromium browser tests pass.

## Phase 23: Source-Mode Block Whitespace Parse Policy

Goal: make source-mode parsing preserve line-leading spaces as editable text instead of applying reader-only CommonMark indentation semantics.

- [x] Add parser parse modes so normal Markdown parsing keeps CommonMark behavior while source-mode parsing can use editor behavior.
- [x] Disable `IndentedCode` only in source-mode parsing; fenced code remains the explicit code-block syntax.
- [x] Expand source-mode paragraph block spans to the physical line start so leading spaces enter inline text conversion with exact source offsets.
- [x] Thread source parse mode through layout engine, editor document state, composition preview parsing, and incremental parser reuse.
- [x] Keep markdown parse mode as the default for existing parser and reader APIs.
- [x] Add parser, layout, editable geometry, Canvas paint, and Canvas Storybook input regressions for line-leading spaces and 4-space input.

Acceptance:

- [x] In source mode, `"    abc"` lays out as one paragraph fragment with text `"    abc"` and source offsets `0..7`.
- [x] Typing four spaces at the start of a Canvas native editor line keeps the source as `"    abc"` and does not create an indented code block.
- [x] In markdown parse mode, `"    abc"` still parses as a CommonMark indented code block.
- [x] `vp check`, `vp test`, `vp run build`, and full browser gates pass after the parser policy split.

## Phase 24: Active Table Source View

Goal: make table editing source-exact without turning unrelated tables into source text.

- [x] Add parser support for materializing selected source block ranges as plain source-text paragraphs while keeping original block spans.
- [x] Thread active source-text block ranges through layout and editor render snapshots.
- [x] Make active table detection range-specific: caret/selection touching a table activates only that table block.
- [x] Suppress inline control reveal inside active tables because the raw table source already exposes Markdown markers.
- [x] Keep composition preview compatible with active table source ranges.
- [x] Add parser, layout, marker-reveal, controller, and Canvas Storybook browser regressions.

Acceptance:

- [x] Caret inside `| A | B |\n| - | - |\n| **x** | y |` renders the row text, including `|`, `-`, and `**`, as editable source text.
- [x] A second table outside the active source range still renders as a normal table.
- [x] Moving the caret outside the table restores normal table rendering.
- [x] `vp check --fix`, `vp test`, and `vp run test:browser` pass.

## Phase 25: Active Image Source View

Goal: make image editing source-exact through the same active source-text view as tables.

- [x] Detect active image source ranges from parser inline source records and their owning block spans.
- [x] Materialize only the active image source line/block as plain Markdown source text.
- [x] Suppress inline/block control reveal inside active image source ranges because the raw source already exposes Markdown markers.
- [x] Keep composition preview compatible with active image source ranges.
- [x] Add parser, layout, marker-reveal, controller, and Canvas Storybook browser regressions.

Acceptance:

- [x] Caret inside `![alt](./asset.png)` renders the image Markdown as editable source text, not as an opaque image block.
- [x] A second image outside the active source range still renders as a normal image.
- [x] Moving the caret outside the image restores normal image rendering.
- [x] `vp check`, `vp test`, `vp run build`, `vp run test:browser`, and `vp run test:browser:webkit` pass.

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
- Phase 21 completed. Added `createPremarkDomEditorHost` and `createPremarkCanvasEditorHost`, then migrated both interactive native editor stories so they only provide fixture content, debug panels, and small test adapters over host/controller APIs.
- The DOM host now owns stable HTML render mounting, overlay DOM, hidden textarea positioning, point transforms, and source-to-point helpers. The Canvas host now owns DPR setup, Canvas painting, selection/caret/composition paint, viewport/wheel handling, dirty clip calculation, optional dirty overlay, hidden textarea positioning, and source-to-point helpers.
- Added customization hooks while keeping source geometry non-overridable: DOM supports overlay class names/renderers, content inset, render callbacks, and `renderMarkdown`; Canvas supports palette, paint callbacks, overlay colors, wheel policy, DPR policy, dirty overlay settings, and `drawDocument`.
- New issue found and fixed: Storybook production builds resolved workspace package names to stale local `dist` files, which hid the new editor exports. `.storybook/main.ts` now aliases workspace package names to `src` entries so browser gates test current source.
- No rollback occurred. `vp install` was needed after adding workspace dependencies; the first install hit one npm registry `ECONNRESET` retry but completed successfully. A root build run exposed one existing unused-parameter failure in `packages/editor/src/editable-layout.ts`; the parameter was removed without changing behavior.
- Verification for Phase 21: `vp check --fix` passes with no warnings, `vp test` passes 210 tests, `vp run build` passes, `vp run test:browser` passes 31 tests, and `vp run test:browser:webkit` passes 7 tests with 5 expected skips.
- Follow-up correction: removed dirty-rect-based clip rendering from `createPremarkCanvasEditorHost`. Canvas native editing now always asks `drawTile` to repaint the visible viewport; `renderUpdate.dirtyRects` remains observable for debug/tests but no longer controls Canvas clipping. This avoids stale pixels from caret/selection/composition/scroll state while preserving the faster viewport-bounded layout/editable index path.
- Follow-up correction: removed `clipRect` from the Canvas renderer API itself. `drawTile` now always clears and repaints the full target canvas, so interactive editor hosts and future callers cannot accidentally re-enable dirty-rect partial repaint.
- Removed the visible dirty-rect debug overlay from `Editing/Premark Canvas Native Editor`; dirty metadata stays in the debug panel, but the canvas no longer shows dashed debug boxes during normal editing.
- Fixed a real editing-path weakness: normal Enter is now handled directly in `PremarkBrowserInputHost` at keydown when not composing, then any trailing line-break input is suppressed to avoid double insertion. Added Canvas browser regression coverage that clicks a rendered text line, presses Enter, and asserts markdown, selection offset, and caret y/x all move as one coherent update. Verification after the fix: `vp check --fix`, `vp test` (210 tests), `vp run test:browser` (32 tests), and `vp run test:browser:webkit` (7 passed, 5 skipped) pass.
- Fixed list splitting after Enter twice in the middle of a list. The parser now segments list blocks at blank source-line separators between sibling list items, including ordered-list start values for the second segment; incremental parsing counts those split segments as logical blocks. Added parser, input-command, and browser rendered-surface coverage for `- a\n\n- b`. Verification after the fix: `vp check --fix`, targeted parser/input tests, `vp test` (212 tests), `vp run test:browser` (33 tests), and `vp run test:browser:webkit` (7 passed, 5 skipped) pass. One concurrent `vp test` run timed out a large viewport test while Storybook/WebKit was building; a standalone rerun passed.
- Fixed caret visibility/position on empty list items and blank lines. Empty list item content now gets a zero-width editable fragment at the inferred rendered content start, and the incremental editable path regenerates virtual empty fragments after each source edit. Browser coverage now asserts both the first Enter empty list item caret and the second Enter blank-line caret have visible DOM caret boxes. Verification after the fix: `vp check --fix`, targeted editable/input tests, `vp test` (213 tests), `vp run build`, `vp run test:browser` (33 tests), and `vp run test:browser:webkit` (7 passed, 5 skipped) pass.
- Hardened the source-newline invariant for `a\n\nb\n\n\n\nc`. Added layout/editable checks for every blank-line caret, an HTML renderer test that asserts rendered block top gaps, a DOM Storybook test that inspects actual `.pmd-block` top positions, and a Canvas Storybook geometry test for the same `2` then `4` line-advance gap.
- Browser verification exposed a flaky visual parity screenshot timeout under parallel load, not a pixel mismatch. Increased that fixture screenshot timeout to 15s so the visual gate remains useful when Storybook/Canvas rows are still stabilizing.
- Final verification after the source-newline regression batch: `vp check --fix`, `vp test` (216 tests), `vp run build`, and `vp run test:browser` (35 Playwright tests) pass.
- Fixed vertical keyboard movement over short/blank adjacent lines. `ArrowUp`/`ArrowDown` now selects the previous/next editable visual line from sorted editable fragments, then hit-tests inside that line with x clamping. This avoids the old failure where a guessed y landed in a gap and the nearest-fragment fallback could stay on the original long line. Added pure selection coverage and a Storybook keyboard regression. Verification after this fix: `vp check --fix`, `vp test` (217 tests), and `vp run test:browser` (36 Playwright tests) pass.
- Fixed caret visibility for leading and trailing blank source lines. Source-mode layout now includes leading/trailing newline height in block y/totalHeight, and editable layout creates zero-width virtual caret fragments before the first rendered block and after trailing newlines. Added layout/editable tests for `\n\na\n\n` and a Storybook regression for visible DOM carets on leading/trailing blank lines. The large viewport controller tests now have explicit 20s timeouts because they intentionally build 110KB full and viewport indexes. Verification after this fix: `vp check --fix`, targeted layout/editable/browser tests, `vp test` (219 tests), `vp run build`, and `vp run test:browser` (37 Playwright tests) pass.
- Follow-up correction: empty source-line editable fragments must use the source/body line height from layout, not the previous rendered fragment height. Heading/list/code lines can be taller than normal body text; using their height can skip the virtual blank line or place its hit band in the wrong part of the visual gap. `DocumentLayout` now exposes `sourceLineHeight`, virtual newline fragments use it for leading/inter-block/trailing blank lines, and hit-test prefers a nearby virtual newline when clicking inter-block whitespace. Added pure hit-test coverage and a Canvas browser pixel regression that clicks heading-to-paragraph whitespace and verifies the caret is visibly painted on the blank source line.
- Fundamental blank-line correction: blank-only source documents (`""`, `"\n"`, `"\n\n"`) previously had zero layout height and no editable fragments because the system depended on at least one parsed Markdown block. Source mode now gives blank-only documents real visual height, exposes source font/line height in layout, and builds source-only editable line fragments so DOM/Canvas caret and hit-test work without any Markdown block. Also fixed whitespace boundary measurement: source-mode `white-space: pre` needs spaces to advance, so `measureGraphemeBoundaryXs` now uses Canvas `measureText` when text contains whitespace instead of relying on pretext's collapsible-space behavior.
- Architecture correction: source-mode blank lines are now represented by `DocumentLayout.sourceLines`, a layout-owned source-line table with source offsets, y, height, and rendered/source-only classification. `EditableLayoutIndex` now fills missing blank/whitespace caret geometry from this table instead of independently inferring blank rows from neighboring fragments. This directly covers long blank runs between headings, paragraphs, and split lists, including the manual Canvas fixture with many blank lines before `asdfsd`, `## adddfasdfdsf`, and the second list segment.
- Verification after the source-line architecture correction: `git diff --check`, `vp check --fix`, targeted layout/editable tests (53 tests), `vp test` (227 tests), `vp run build`, `vp run test:browser` (41 Playwright tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) all pass. A one-off local screenshot helper was attempted for manual Canvas review, but direct `require("playwright")` is unavailable because Playwright is exposed through the CLI wrapper rather than as a require-able dependency; existing browser tests remain the authoritative visual/geometry gate.
- Fixed another source-gap regression class: incremental suffix reuse now updates `sourceBlockIndex`, and incremental deletion to blank-only documents now preserves `DocumentLayout.sourceLines` plus source height. Added exact `a\n\n\nb` tests for layout, DOM, Canvas, and Canvas Enter input so 3 newline characters produce exactly a 3-line visual advance rather than an over-rendered gap.
- Corrected inline x geometry after the remaining Canvas emoji drift. `measureGraphemeBoundaryXs` now uses Canvas prefix `measureText` at grapheme boundaries for all text. Text and rich-text layout keep pretext for line split decisions, then use Canvas-measured fragment widths for the visual line's x/width. Editable geometry no longer scales measured boundary tables to fragment width, so mismatched layout widths are exposed instead of hidden.
- Added regression coverage for Canvas-measured visual widths, rich inline fragment adjacency after emoji, editor caret placement across emoji/link/code fragments, Canvas draw calls after emoji, and browser hidden-vs-revealed control geometry. The browser test intentionally checks hidden-view fragment adjacency separately from active reveal marker width.
- Verification after the line-level Canvas measurement correction: `git diff --check`, `vp check --fix`, targeted layout/editor/canvas tests (67 tests), `vp test` (235 tests), `vp run build`, `vp run test:browser` (45 Playwright tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) pass. One browser run failed because the new test compared hidden link geometry to active reveal geometry; the implementation was correct, and the test was revised to assert those two states separately.
- Fixed intermittent heading-marker reveal while the caret was visually on the blank line after a heading. Root cause: active heading reveal changes `viewMarkdown` length, and `DocumentLayout.sourceLines` is produced in that revealed coordinate space. Editable layout was using those revealed source-line offsets directly for blank-line fragments while the controller selection remains in original Markdown offsets. Now virtual source-line fragments map through `sourceMap` first, and block-control reveal uses its own collapsed-range predicate instead of sharing inline boundary behavior. Added marker, editable-layout, and controller regressions. Verification on 2026-04-26: `vp run build`, `vp check`, `vp test` (238 tests), and `vp run test:browser` (45 Playwright tests) pass.
- Follow-up sourceMap audit found and fixed two more similar bugs. First, active-control viewport builds over repeated text could map visible fragments to earlier identical source because the revealed search cursor started at `0`; editable layout now seeds both source and revealed cursors from the first visible layout source line, with a source-to-revealed fallback. Second, active code-block reveal could turn generated outer fence lines into fake source-only blank fragments; editable layout now skips non-empty revealed lines that have no sourceMap coverage. Added controller/editable regressions for repeated viewport text and generated code-block fences. Verification on 2026-04-26: `vp check --fix`, `vp test` (240 tests), `vp run build`, ad-hoc dist repro script, and `vp run test:browser` (45 Playwright tests) pass.
- Completed Phase 22 source-mode whitespace and geometry hardening. Root decision: source editing cannot share Markdown reading whitespace semantics. Parser inline nodes now expose block-relative source ranges, source-mode layout preserves spaces and carries direct source boundary offsets, editable geometry consumes those offsets, and Canvas paint receives the same repeated-space text that geometry measured. Active-control and composition preview layouts now use isolated one-shot layout engines so preview rendering cannot mutate the main incremental layout cache. Boundary hit-test now prefers the following fragment within a small subpixel tolerance, fixing link-label clicks that landed before hidden control characters. No rollback occurred. Verification on 2026-04-26: `vp check`, `vp test` (245 tests), `vp run build`, full Chromium Playwright browser tests (45 tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) pass.
- Completed Phase 23 after a manual report that line-leading spaces were not rendered and four spaces at line start became an indented code block. Root cause: Phase 22 fixed inline whitespace after parsing, but the CommonMark block parser had already consumed line-leading indentation or turned it into `CodeBlock`. The architecture now has a source parse mode that removes `IndentedCode`, keeps paragraph spans starting at the physical line start, and flows that mode through layout/editor/composition incremental parsing. Added parser/layout/editable/Canvas/browser regressions. No rollback occurred. Verification on 2026-04-26: `vp check --fix`, targeted parser/layout/editor/canvas tests (102 tests), `vp check`, `vp test` (250 tests), `vp run build`, `vp run test:browser` (46 tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) pass.
- Completed Phase 24 after deciding table editing should switch the active table to raw source text instead of trying to edit rendered table cells. Important architecture decision: this is a range-specific source-block materialization view, not a global "disable table syntax" parser mode. Parser block spans remain authoritative, layout can receive source-text block ranges for one-shot render views, and controller active-control snapshots pass only the touched table range. Inline control reveal is filtered out inside active tables because the raw source already shows those markers. Added parser, layout, marker-reveal, controller, composition, and Canvas browser coverage for active-table-only raw rendering. No rollback occurred. Verification on 2026-04-26: `vp check --fix`, targeted parser/layout/editor tests (88 tests), `vp test` (255 tests), `vp run build`, `vp run test:browser` (47 tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) pass.
- Completed Phase 25 after extending the table raw-source path to images. Active source-text controls are now table/image generic: tables come from block spans, images come from inline source records plus their owning block span. This keeps the source-text materialization in parser/layout and prevents Canvas-only branches. Inline and block marker reveal are suppressed inside active image source ranges, so raw Markdown is the only editable view for that line. Composition preview uses the same active source-text helper and transforms the range into virtual composition coordinates. No rollback occurred. Verification on 2026-04-26: `vp check --fix`, targeted parser/layout/editor tests (94 tests), `vp test` (261 tests), `vp run build`, `vp run test:browser` (48 tests), and `vp run test:browser:webkit` (7 passed, 5 expected skips) pass.
