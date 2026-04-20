# Screenshot Review Log

Current artifact source: `vp run test:browser`

Current generated folder pattern:

- `test-results/native-editor-Premark-nati-*/native-editor-idle.png`
- `test-results/native-editor-Premark-nati-*/native-editor-after-typing.png`
- `test-results/native-editor-Premark-nati-*/native-editor-selection.png`
- `test-results/native-editor-Premark-nati-*/native-editor-after-replace.png`

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
