# Native Editor Pitfall Test Matrix

This file is the implementation tracker for the research checklist in
`docs/plans/2026-04-20-premark-native-editor-design.md`.

Status legend:

- `planned`: not implemented yet
- `logic`: covered by deterministic Vitest tests
- `browser`: covered by Playwright browser tests
- `logic+browser`: covered by deterministic Vitest tests and Playwright browser tests
- `macos-ime`: covered by macOS real IME automation
- `gap`: automation gap is explicitly documented
- `mobile-gap`: requires real-device or manual validation before claiming support

| Pitfall                                   | Target Coverage                                                                                   | Current Status |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| IME event order variants                  | Event trace normalization tests for `beforeinput`, `input`, `compositionupdate`, `compositionend` | logic          |
| Non-cancelable composition updates        | Composition virtual patch tests assert source and undo are unchanged until commit                 | logic          |
| DOM/selection mutation aborts composition | Browser test asserts browser selection is not touched during composition                          | browser        |
| Hidden textarea drift                     | Input bridge trace compares textarea state, Premark selection, and source                         | browser        |
| macOS foreground activation               | Browser must be the foreground app before System Events can exercise real IME composition         | macos-ime      |
| macOS global HID key routing              | Foreground global key events must reach the hidden textarea before real IME can be trusted        | gap            |
| Candidate window bounds                   | macOS IME screenshots or documented capture gap                                                   | gap            |
| Cross-block composition replacement       | Synthetic composition replacement over cross-block selection; real Pinyin remains blocked by HID  | logic          |
| Soft keyboard input without keydown       | Synthetic mobile input operation tests plus mobile browser coverage                               | logic+browser  |
| Visual viewport changes                   | VisualViewport resize/scroll anchoring tests                                                      | browser        |
| Native mobile selection handles           | OS long-press handles, magnifier, selection affordances, and candidate bars                       | mobile-gap     |
| Browser selection/focus coupling          | Tests keep Premark selection independent from DOM focus                                           | browser        |
| Keyboard selection modes                  | Arrow, Shift+Arrow, Shift+Command+Arrow, Home/End, PageUp/PageDown                                | logic+browser  |
| Grapheme boundaries                       | Combining marks, emoji ZWJ, flags, variation selectors, CJK punctuation                           | logic          |
| Bidi hit-test                             | Mixed English/Hebrew/Arabic/numbers/Markdown markers fixtures                                     | logic          |
| Multi-format clipboard                    | Markdown, plain text, HTML, cross-block cut/paste                                                 | browser        |
| Control-adjacent source edits             | Insert/delete/paste/Enter inside revealed Markdown controls and hidden link suffixes              | logic+browser  |
| DOM mutation by extensions                | Mutation-injection tests prove source of truth remains Premark state                              | browser        |
| Accessibility                             | Label, focus, multiline textbox semantics, hidden textarea behavior                               | browser        |
| Screenshot stability                      | Small deterministic crops, actual/expected/diff, event trace, review log                          | browser        |
| Active marker reflow                      | Before/after marker reveal screenshots and source offset assertions                               | logic+browser  |
| Remote/AI active range movement           | Stable range transform tests for before/after/inside/overlap edits                                | logic          |
