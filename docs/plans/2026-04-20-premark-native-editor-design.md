# Premark Native Editor Design

Date: 2026-04-20
Status: accepted design draft
Branch: `codex/premark-native-editor-redesign`

## Goal

Premark native editor should let users edit rendered Markdown directly on the Premark surface. The visible editor must not be CodeMirror, a source editor, or a browser DOM selection wrapper. Premark owns selection, caret, composition, hit-test, source mapping, and rendering. The platform text control is only an input bridge.

The first prototype should prove the hardest loop:

- rendered surface editing without CodeMirror
- hidden textarea input bridge near the Premark caret
- macOS Pinyin IME composition
- source offsets for raw Markdown syntax and rendered text
- shared layout/source-map core for DOM debug rendering and Canvas rendering
- very broad automated tests for desktop and mobile selection behavior

## Scope

The first supported block types are paragraph and heading. The first supported inline syntax cases are:

- `**strong**`
- `` `inline code` ``
- `[link](url)`

Inline markers follow a MarkText/Obsidian-style rule. Markers are hidden normally. When the caret or selection enters a token, the relevant markers become visible or gray. The first prototype may reflow the active block when markers become visible. A later experiment can replace this with no-reflow marker overlays.

Offsets use UTF-16 code unit indexes. This matches JavaScript strings, textarea selection, Lezer ranges, and existing parser/layout APIs. Grapheme data is a sidecar for caret movement, delete behavior, and hit-test snapping so emoji and composed characters are not split.

## Non-Goals

The first prototype does not need full table editing, image resize, HTML block editing, source-mode parity, mobile production polish, or collaborative undo. It must still model these future needs through the core interfaces, especially stable ranges and source operations.

## Architecture

The editor has three layers:

- `TextDocumentAdapter`: document text, transactions, stable ranges, and change events.
- `EditorState`: materialized Markdown, parse state, layout, selection, composition, active token, input bridge state, and local undo stack.
- `EditorView`: DOM debug renderer and Canvas renderer using the same layout, hit-test, and rect computation.

The core data flow is:

```txt
mouse / keyboard / IME / paste
-> InputBridge event
-> resolve StableRange to UTF-16 source offsets
-> EditOp or CompositionPatch
-> adapter transaction or ephemeral view
-> incremental parse/layout
-> caret, selection, composition rects
-> DOM debug renderer + Canvas renderer
```

The DOM debug renderer must not become the editor model. It exists to make geometry and visual parity easier to inspect. The Canvas renderer uses the same source map, hit-test, and selection rect logic.

## Document Adapter

The editor core is CRDT-agnostic. The first adapter is an in-memory implementation. The interface is designed so a later Loro adapter can provide stable ranges without changing editor semantics.

```ts
interface TextDocumentAdapter {
  getText(): string;
  transact(fn: (tx: TextTransaction) => void): void;
  createRange(anchor: number, head: number, options?: RangeOptions): StableRange;
  resolveRange(range: StableRange): ResolvedRange;
  disposeRange(range: StableRange): void;
  subscribe(listener: DocumentChangeListener): Unsubscribe;
}
```

Stable ranges are used for selection, composition replacement ranges, undo targets, search matches, and AI insertion cursors. Normal selection ranges should preserve the selected logical content through remote or AI edits. They should not collapse just because another actor edits inside the range.

Composition ranges use stricter behavior. Composition update is an ephemeral local overlay. Composition commit is a real transaction. If a remote/AI edit overlaps the active composition replacement range in a way the adapter cannot safely transform, the first prototype should fail closed by canceling or ending composition rather than corrupting input.

## Selection Model

Premark selection is the only real selection. Browser selection and textarea selection are not authoritative.

```ts
type EditorSelection = {
  anchor: StableRangeEndpoint;
  head: StableRangeEndpoint;
  range: StableRange;
  direction: "forward" | "backward" | "collapsed";
  granularity?: "char" | "word" | "line" | "block";
};
```

Collapsed selection, same-block selection, and cross-block selection all use the same model. Cross-block selection is rendered by resolving the source range, finding affected blocks and lines, slicing rendered fragments, and painting selection rects. It is not represented by textarea selection.

When selection is non-collapsed, typing, paste, Backspace, and Delete operate on the whole source range. For cross-block selection, input becomes:

```ts
replaceRange(selection.range, inputMarkdownOrText);
```

The caret moves to the end of inserted content after commit.

## Hit-Test And Source Mapping

Layout output must be editable, not just drawable. Each text fragment needs:

- rendered text
- source range
- rendered text range
- token ancestry
- x/y/width/height
- font metrics
- marker visibility state

Core APIs:

```ts
hitTest(point): SourcePosition
sourceOffsetToCaretRect(offset, affinity): Rect
sourceRangeToSelectionRects(range): Rect[]
findInlineTokenAtOffset(offset): InlineTokenRef | null
```

For hidden markers, source offsets still exist even when no glyph is visible. Hit-test must snap sensibly at token boundaries. When the active inline token exposes markers, those marker fragments participate in the active block layout, so marker source positions become visible and directly editable.

## Input Bridge

The hidden textarea is positioned near the visible Premark caret, with roughly 1px size or very low opacity. Its job is to receive platform input and anchor macOS IME candidate windows. Premark paints the visible caret, selection, and composition text.

Textarea synchronization rules:

- Collapsed selection: textarea may contain active block raw text.
- Same-block selection: textarea may contain active block raw text and mirror selection.
- Cross-block selection: textarea remains focused but selection is collapsed or minimal; Premark selection remains authoritative.

Input events become editor operations:

- `insertText` -> `replaceRange`
- `deleteContentBackward` / `deleteContentForward` -> `deleteRange` or grapheme-aware delete
- Enter -> split paragraph/heading, heading creates a following paragraph
- Paste -> normalize clipboard content to Markdown, then replace current selection
- Cut -> serialize current selection, then delete current selection

## IME

IME composition uses virtual patches.

- `compositionstart`: create a composition stable range at the current selection.
- `compositionupdate`: create an ephemeral document view with the preedit text inserted at the composition range.
- layout/render: reparse and relayout the affected local range using the ephemeral view.
- `compositionend`: commit one real `replaceRange` transaction.
- cancel: discard the virtual patch and restore the pre-composition selection.

Composition updates do not enter undo history and do not mutate document source. Composition commit enters local undo history as one operation.

macOS Pinyin is required before the first prototype can be considered successful. Japanese and Korean IME scenarios should be added after Pinyin stabilizes.

## Undo And Clipboard

The first prototype implements local operation undo/redo. Local typing, delete, paste, Enter, Backspace, and IME commit enter the undo stack. Remote and AI edits do not enter the local stack. Undo targets are tracked by stable ranges so local undo can still find the intended current location after unrelated remote changes.

If a local undo target has been heavily changed by another actor, the first prototype should fail closed instead of making a risky inverse edit.

Clipboard behavior does not rely on textarea defaults:

- Markdown copy uses the source slice, normalized at block boundaries when needed.
- Plain text copy uses rendered text.
- HTML copy uses rendered fragments.
- Paste prefers Markdown, then HTML-to-Markdown, then plain text.

## Renderers

The DOM debug renderer and Canvas renderer consume the same layout and editor overlay data:

- block layout
- line layout
- inline fragments
- visible marker fragments
- selection rects
- caret rect
- composition rects
- debug source offset overlay

The DOM renderer may expose extra debug labels and source ranges. It must not use browser DOM selection as truth. The Canvas renderer should prove that the editor can work on a large Premark surface without depending on editable DOM.

## Test Strategy

Testing must be broad enough to justify a self-built editor. The prototype is not accepted if only happy-path typing works.

## Research Pitfall Checklist

The following checklist comes from browser specs, editor project docs/issues, and platform automation docs. Each item must map to automated tests or an explicit automation gap.

| Pitfall                                                            | Why It Matters                                                                                                            | Automated Coverage                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| IME event order varies                                             | Specs and implementations do not always agree on `beforeinput`, `input`, `compositionupdate`, and `compositionend` order. | Event trace fixtures normalize all composition sequences into the same editor op.                                                              |
| Composition updates may be non-cancelable                          | `insertCompositionText` updates cannot be treated like normal cancelable `beforeinput`.                                   | Composition tests assert update is virtual and source remains unchanged until commit.                                                          |
| DOM/selection mutation can abort composition                       | ProseMirror reports IME aborts when DOM or DOM selection changes around active composition.                               | Tests assert Premark does not touch browser DOM selection near composition and only updates its own overlay.                                   |
| Hidden textarea can drift from visible editor                      | CodeMirror used textarea polling because IME updates were historically not consistently observable.                       | Input bridge tests compare textarea value/selection, editor selection, source, and event trace after every input.                              |
| Candidate window needs real bounds                                 | EditContext requires selection and character bounds so OS input services can place IME UI correctly.                      | Caret/textarea anchoring tests under scroll, zoom, high-DPI, and canvas world transforms; macOS screenshots when candidate UI can be captured. |
| Cross-block composition replacement                                | Replacing a multi-block selection with IME text can corrupt state if bridge selection is trusted.                         | Cross-block Pinyin replacement tests use Premark stable range, not textarea selection.                                                         |
| Mobile soft keyboards do not behave like hardware keyboards        | Slate reports autocorrect/autosuggest/swipe changes that do not map to key events.                                        | Mobile/input tests model direct `input`/`beforeinput` operations without `keydown`; real-device gap is recorded.                               |
| Mobile viewport changes under OS keyboard                          | The visual viewport can shrink or move while the layout viewport remains unchanged.                                       | VisualViewport resize/scroll tests verify textarea anchor, caret rect, and selection rect remain aligned.                                      |
| Selection anchor/focus/focus-element coupling is browser-sensitive | MDN documents that selection and input focus have complex cross-browser behavior.                                         | Tests maintain Premark anchor/head/direction independently from DOM focus and browser selection.                                               |
| Keyboard selection has many modes                                  | Arrow, Shift+Arrow, Shift+Command+Arrow, Home/End, PageUp/PageDown, and select-all are distinct behaviors.                | Playwright keyboard suites cover collapsed, forward, backward, same-block, wrapped-line, and cross-block selections.                           |
| Unicode grapheme boundaries are not UTF-16 boundaries              | UAX #29 notes grapheme clusters approximate user-perceived characters and matter for UI interactions.                     | Grapheme tests cover combining marks, emoji ZWJ, flags, variation selectors, CJK punctuation, delete, and caret movement.                      |
| Bidi text reorders visual and logical positions                    | UAX #9 defines display reordering for mixed-direction text.                                                               | Bidi hit-test fixtures record current behavior for English/Hebrew/Arabic/numbers/Markdown markers.                                             |
| Clipboard needs multiple formats                                   | Clipboard APIs allow manipulating `text/plain`, `text/html`, and richer semantic data during user events.                 | Copy/cut/paste tests assert Markdown, plain text, and HTML serialization for same-block and cross-block ranges.                                |
| Browser extensions/grammar tools may mutate DOM                    | Draft.js warns DOM-modifying extensions can desync controlled editors.                                                    | DOM debug renderer has mutation-injection tests proving source of truth remains Premark state.                                                 |
| Accessibility cannot be ignored                                    | ARIA textbox guidance expects labels and multiline semantics; hidden input must not trap AT users.                        | Accessibility smoke tests assert labels, focusability, `aria-multiline`, and no unlabeled hidden text control.                                 |
| Screenshot tests can be flaky                                      | Playwright warns screenshots vary by OS, browser, hardware, headless mode, and fonts.                                     | Screenshot baseline policy fixes OS/browser/fonts/theme/scale, disables animation, and uses small crops.                                       |
| Active marker reflow can move geometry                             | Showing `**`, backticks, or link URL changes active block width.                                                          | Before/after marker screenshot tests verify caret source offset and selection range stay correct through reflow.                               |
| Remote/AI edits can move active ranges                             | Collaboration and streaming patches can move selection, undo targets, and composition anchors.                            | Stable range transform tests cover edits before, after, inside, and overlapping active ranges.                                                 |

Vitest should cover deterministic logic:

- stable range transform
- source patch operations
- inline source maps for strong/code/link
- hidden and visible marker offset mapping
- hit-test
- caret rects
- selection rects
- grapheme snapping
- composition virtual patch
- local undo merge
- clipboard serialization

Playwright should cover real browser behavior:

- mouse click caret placement
- mouse drag selection within one line
- mouse drag selection across wrapped lines
- mouse drag selection across blocks
- drag direction reversal while selecting
- keyboard ArrowLeft/Right/Up/Down
- keyboard Shift+ArrowLeft/Right/Up/Down
- keyboard Shift+Command+ArrowLeft/Right/Up/Down on macOS
- Home/End/PageUp/PageDown equivalents where relevant
- typing over collapsed and non-collapsed selection
- Backspace/Delete over collapsed, same-block range, and cross-block range
- copy/cut/paste for same-block and cross-block ranges
- active inline marker reveal while navigating
- DOM debug renderer and Canvas renderer visual parity

macOS IME tests should cover:

- Pinyin composition update
- candidate selection
- commit
- cancel
- replacing selected text
- replacing cross-block selected text
- composition near strong/code/link markers
- composition while unrelated remote/AI patches arrive
- undo after IME commit

Mobile selection needs its own test class. It cannot be treated as desktop mouse selection with different coordinates. The first mobile target should include touch long press, drag handles when available, touch drag range extension, soft keyboard focus, composition-capable input where the platform allows automation, viewport resize after keyboard display, and selection rect stability under scroll/zoom. If full native mobile handles cannot be automated in Playwright, the gap must be recorded and covered by a manual or device-farm checklist before claiming mobile support.

Screenshot tests are required, and they need human review by Codex before a phase is marked complete. Screenshots should be cropped to the editor state under test instead of full-page captures whenever possible. Each screenshot scenario should save:

- actual crop
- expected crop or baseline
- diff image when comparison fails
- event trace for the operation that produced the screenshot
- `review.md` note with expected visual behavior and Codex pass/fail judgment

The first screenshot set should include idle rendered Markdown, caret placement, forward selection, backward selection, wrapped-line selection, cross-block selection, active strong/code/link marker reveal, IME preedit text, paste replacement, remote edit while selected, DOM debug renderer, Canvas renderer, and high-DPI canvas rendering.

## Research Sources

- [W3C Input Events Level 2](https://www.w3.org/TR/input-events-2/): composition update ordering and `insertCompositionText`.
- [W3C UI Events](https://www.w3.org/TR/uievents/): composition event ordering and cancelability notes.
- [Chrome for Developers EditContext article](https://developer.chrome.com/blog/introducing-editcontext-api): custom editors, hidden editable element problems, and canvas editing responsibilities.
- [MDN EditContext guide](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API/Guide): updating selection bounds, character bounds, and IME text formatting.
- [ProseMirror composition discussion](https://discuss.prosemirror.net/t/composition-lost-when-i-input-after-select-multi-lines/4493): DOM/selection changes can abort browser composition.
- [CodeMirror 5 internals](https://codemirror.net/5/doc/internals.html): hidden textarea input shim and IME polling history.
- [Draft.js issues and pitfalls](https://draftjs.org/docs/advanced-topics-issues-and-pitfalls/): browser extensions, DOM mutations, IME, mobile support.
- [Slate Android/soft keyboard issue](https://github.com/ianstormtaylor/slate/issues/2062): mobile input may not produce reliable key events.
- [MDN Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Selection): anchor/focus and focus behavior complexity.
- [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport): OS keyboards can shrink the visual viewport without changing layout viewport.
- [Clipboard API and events](https://www.w3.org/TR/clipboard-apis/): multi-format clipboard data during user-initiated clipboard events.
- [Unicode UAX #29](https://www.unicode.org/reports/tr29/) and [Unicode UAX #9](https://unicode.org/reports/tr9/): grapheme segmentation and bidi behavior.
- [Playwright keyboard](https://playwright.dev/docs/api/class-keyboard), [touchscreen](https://playwright.dev/docs/api/class-touchscreen), [screenshots](https://playwright.dev/docs/screenshots), and [visual comparison](https://playwright.dev/docs/next/test-snapshots) docs.
- [Apple InputMethodKit](https://developer.apple.com/documentation/inputmethodkit) and [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AutomatetheUserInterface.html): macOS IME/candidate behavior and OS-level keyboard automation constraints.

## Acceptance

The first prototype is accepted only when:

- CodeMirror is not needed.
- Premark owns visible selection, caret, composition, hit-test, and source mapping.
- macOS Pinyin works for paragraph/heading with strong/code/link fixtures.
- Cross-block selection can be displayed, copied, deleted, and replaced.
- Composition update does not mutate source or undo history.
- DOM debug rendering and Canvas rendering share the same source map and rect computation.
- Selection tests cover mouse, keyboard, Shift navigation, Shift+Command navigation, and mobile-specific behavior.
- Known pitfall matrix items are either automated or explicitly listed as automation gaps.
- Screenshot crops have been generated, visually reviewed by Codex, and recorded in the screenshot review log.

## Open Follow-Ups

- Decide when to experiment with no-reflow marker overlay.
- Decide when to add list item and code block editing.
- Decide when to connect the adapter to Loro.
- Decide how much mobile native selection can be automated versus manually certified.
