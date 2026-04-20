# Screenshot Review Log

Current artifact sources: `vp run test:browser`, `vp run test:macos-ime`

Current generated folder pattern:

- `test-results/native-editor-Premark-nati-*/native-editor-idle.png`
- `test-results/native-editor-Premark-nati-*/native-editor-after-typing.png`
- `test-results/native-editor-Premark-nati-*/native-editor-selection.png`
- `test-results/native-editor-Premark-nati-*/native-editor-after-replace.png`
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
- Result: documented automation gap in the current Codex host
- Recorded artifacts:
  - `pinyin-skipped-no-foreground.png`: the editor is loaded and focused through Playwright before the real Pinyin path is skipped.
  - `pinyin-skip.txt`: records that Chrome cannot become the foreground app and that targeted `CGEventPostToPid` bypasses input-method composition.
- Notes:
  - The runner still verifies real macOS key events reach the hidden textarea by posting US key codes to the browser process.
  - Real Pinyin candidate-window screenshots remain pending until the browser can safely become the foreground app; `PREMARK_MACOS_IME_STRICT=1` makes that requirement fail hard.
