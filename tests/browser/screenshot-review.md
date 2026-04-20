# Screenshot Review Log

Current artifact sources: `vp run test:browser`, `vp run test:macos-ime`

Current generated folder pattern:

- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-idle.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-after-typing.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-selection.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-after-replace.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-shot-*.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-mobile-touch-selection.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-canvas-selection-hidpi.png`
- `test-results/macos-ime/pinyin-skipped-no-foreground.png`

## Review Entries

### 2026-04-20

- Reviewer: Codex
- Scenario: native editor Storybook desktop flow
- Result: pass after pointer grapheme snapping fix
- Reviewed screenshots:
  - `native-editor-idle.png`: rendered Markdown is visible, caret appears at document start, no blank surface.
  - `native-editor-after-typing.png`: hidden textarea input updates rendered Markdown and caret stays aligned to the inserted source position.
  - `native-editor-selection.png`: selection is visible across wrapped rendered text and list-item rows; geometry is continuous enough for the current DOM prototype.
  - `native-editor-after-replace.png`: selected range is replaced without leaving the previous emoji ZWJ suffix; caret is visible after inserted text.
- Notes:
  - This is a DOM debug renderer review, not final Canvas visual parity.
  - Paste preview screenshots, mobile screenshots, and remote edit screenshots are still pending.

### 2026-04-20 Composition Preedit

- Reviewer: Codex
- Scenario: native editor Storybook synthetic composition preedit
- Result: pass for DOM debug renderer, not a real OS IME pass
- Reviewed screenshots:
  - `native-editor-composition-preedit.png`: preedit text appears in the rendered paragraph and has a green underline overlay near the active caret.
- Notes:
  - This verifies the Storybook DOM event path and virtual rendering path.
  - It does not verify macOS Pinyin candidate window placement, real event order, or candidate-window screenshots.

### 2026-04-20 macOS IME Foreground Gap

- Reviewer: Codex
- Scenario: macOS real IME runner foreground check
- Result: superseded by the HID routing gap below
- Recorded artifacts:
  - `pinyin-skipped-no-foreground.png`: the editor is loaded and focused through Playwright before the real Pinyin path is skipped.
  - `pinyin-skip.txt`: records that Chrome cannot become the foreground app and that targeted `CGEventPostToPid` bypasses input-method composition.
- Notes:
  - The runner still verifies real macOS key events reach the hidden textarea by posting US key codes to the browser process.
  - This entry is retained for history. The newer HID routing entry is the current blocker for real Pinyin candidate-window screenshots.

### 2026-04-20 macOS IME HID Routing Gap

- Reviewer: Codex
- Scenario: macOS real IME runner with Chrome foreground and global HID event probe
- Result: documented automation gap in the current Codex host
- Recorded artifacts:
  - `hid-probe-failed.png`: editor is foreground and focused before global HID key events are posted.
  - `hid-probe-failed.json`: event trace shows `a/b/c` keydown and keyup events targeting `body`, with `body` active, so the hidden textarea does not receive global OS key input.
  - `pinyin-skip.txt`: records that real Pinyin is skipped because global HID key events do not reach the focused hidden textarea.
- Notes:
  - Chrome can now become the foreground app in this host.
  - Targeted `CGEventPostToPid` still proves browser-process key delivery, but it is not a valid IME path because it bypasses macOS input-method composition.
  - Candidate-window screenshots remain pending until global foreground key events can be routed to the hidden textarea or the runner switches to a trusted device-level automation path.

### 2026-04-20 Screenshot Mode Matrix

- Reviewer: Codex
- Scenario: deterministic Storybook screenshot mode for editor visual states
- Result: pass for DOM debug renderer after source-map alignment fix
- Artifact size check:
  - `native-editor-shot-*.png`: `780x422`
  - `native-editor-shot-hidpi.png`: `1120x564`
- Reviewed screenshots:
  - `native-editor-shot-idle.png`: fixed crop renders the note without toolbar/debug UI noise.
  - `native-editor-shot-caret.png`: caret is visible at the requested heading-end source offset.
  - `native-editor-shot-forward.png` and `native-editor-shot-backward.png`: selected geometry is the same visible range while the model preserves direction separately.
  - `native-editor-shot-wrapped.png`: selection continues across wrapped paragraph lines.
  - `native-editor-shot-cross-block.png`: selection spans paragraph and list rows; list marker gaps remain visible but the selected text geometry is continuous enough for the DOM prototype.
  - `native-editor-shot-inline-token.png`: selecting rendered `bold text` maps to the raw strong-token source range without exposing marker text.
  - `native-editor-shot-composition.png`: synthetic preedit text appears inside the rendered strong text, with underline and caret aligned to the preedit range.
  - `native-editor-shot-paste.png`: pasted Markdown renders as bold text before the existing strong token, and the caret lands after the pasted content.
  - `native-editor-shot-remote.png`: a remote blockquote insertion appears above the active document without remounting the rendered surface.
  - `native-editor-shot-code-block.png`: code-block text selection stays inside the rendered code surface and remains aligned to the code text.
  - `native-editor-shot-hidpi.png`: high-DPI DOM crop keeps the selected list text aligned; the right edge intentionally crops unrelated paragraph text.
- Notes:
  - This review found and fixed a real source-map bug: layout `blockIndex` referred to normalized layout blocks, not parser source blocks, which broke list-item and post-list paragraph mappings.
  - Canvas renderer screenshots, active-marker reveal styling, and real mobile selection-handle screenshots remain pending.

### 2026-04-20 Mobile Touch Selection

- Reviewer: Codex
- Scenario: mobile-emulated Storybook touch pointer selection and soft-keyboard-style input
- Result: pass for Playwright mobile emulation, with real-device handle gap documented
- Reviewed screenshots:
  - `native-editor-mobile-touch-selection.png`: touch pointer drag selects across the paragraph and list rows with multiple visible selection rects; text inserted through an `input` event without keydown appears after `Click text`.
- Notes:
  - This covers Premark's own touch pointer hit-test/selection path, soft-keyboard-style input events, and overlay geometry in a mobile viewport.
  - It does not cover OS long-press handles, native selection affordances, magnifier behavior, or real soft-keyboard candidate bars. Those require device automation or a manual/device-farm checklist before claiming full mobile support.

### 2026-04-20 Canvas Selection

- Reviewer: Codex
- Scenario: high-DPI Canvas renderer selection crop
- Result: pass for the first Canvas selection screenshot guard
- Artifact size check:
  - `native-editor-canvas-selection-hidpi.png`: `1120x680`
- Reviewed screenshots:
  - `native-editor-canvas-selection-hidpi.png`: the Canvas tile renders nonblank Markdown text at device scale factor 2, and the selection overlay spans the paragraph plus list rows without shifting the text layout.
- Notes:
  - This validates that the Canvas renderer can receive Premark selection geometry and produce a deterministic high-DPI crop.
  - It does not yet prove active-marker reveal styling, final Canvas visual parity, or interactive Canvas input behavior.
