# Native Editor Pitfall Test Matrix

This file is the implementation tracker for the research checklist in
`docs/plans/2026-04-20-premark-native-editor-design.md`.

Status legend:

- `planned`: not implemented yet
- `logic`: covered by deterministic Vitest tests
- `browser`: covered by Playwright browser tests
- `macos-ime`: covered by macOS real IME automation
- `mobile-gap`: requires real-device or manual validation before claiming support

| Pitfall                                   | Target Coverage                                                                                   | Current Status |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| IME event order variants                  | Event trace normalization tests for `beforeinput`, `input`, `compositionupdate`, `compositionend` | planned        |
| Non-cancelable composition updates        | Composition virtual patch tests assert source and undo are unchanged until commit                 | logic          |
| DOM/selection mutation aborts composition | Browser test asserts browser selection is not touched during composition                          | planned        |
| Hidden textarea drift                     | Input bridge trace compares textarea state, Premark selection, and source                         | planned        |
| Candidate window bounds                   | macOS IME screenshots or documented capture gap                                                   | planned        |
| Cross-block composition replacement       | Pinyin replacement over cross-block selection                                                     | planned        |
| Soft keyboard input without keydown       | Synthetic mobile input operation tests plus mobile browser coverage                               | planned        |
| Visual viewport changes                   | VisualViewport resize/scroll anchoring tests                                                      | planned        |
| Browser selection/focus coupling          | Tests keep Premark selection independent from DOM focus                                           | planned        |
| Keyboard selection modes                  | Arrow, Shift+Arrow, Shift+Command+Arrow, Home/End, PageUp/PageDown                                | planned        |
| Grapheme boundaries                       | Combining marks, emoji ZWJ, flags, variation selectors, CJK punctuation                           | planned        |
| Bidi hit-test                             | Mixed English/Hebrew/Arabic/numbers/Markdown markers fixtures                                     | planned        |
| Multi-format clipboard                    | Markdown, plain text, HTML, cross-block cut/paste                                                 | planned        |
| DOM mutation by extensions                | Mutation-injection tests prove source of truth remains Premark state                              | planned        |
| Accessibility                             | Label, focus, multiline textbox semantics, hidden textarea behavior                               | planned        |
| Screenshot stability                      | Small deterministic crops, actual/expected/diff, event trace, review log                          | planned        |
| Active marker reflow                      | Before/after marker reveal screenshots and source offset assertions                               | planned        |
| Remote/AI active range movement           | Stable range transform tests for before/after/inside/overlap edits                                | logic          |
