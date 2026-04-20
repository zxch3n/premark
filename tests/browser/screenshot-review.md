# Screenshot Review Log

Current artifact sources: `vp run test:browser`, `vp run test:macos-ime`

Committed visual baseline sources:

- `tests/browser/native-editor-visual.spec.ts-snapshots/native-editor-visual-*-darwin.png`

Current generated folder pattern:

- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-idle.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-after-typing.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-selection.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-after-replace.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-shot-*.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-mobile-touch-selection.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-canvas-selection-hidpi.png`
- `artifacts/playwright-browser/native-editor-Premark-nati-*/native-editor-canvas-native-composition.png`
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
  - `native-editor-shot-active-marker.png`: active strong text reveals the raw `**` markers, caret stays inside the same source token, and the line reflows without overlap.
  - `native-editor-shot-composition.png`: synthetic preedit text appears inside the rendered strong text, with underline and caret aligned to the preedit range.
  - `native-editor-shot-composition-replace.png`: composition preedit replaces the selected strong text and remains underlined at the replacement range.
  - `native-editor-shot-composition-strong.png`: preedit near a strong token stays in the bold rendered run without exposing unrelated marker text.
  - `native-editor-shot-composition-code.png`: preedit at the start of an inline-code token is visible and does not break the inline code pill layout.
  - `native-editor-shot-composition-link.png`: preedit at the link label start is visible before the rendered link text and does not shift the surrounding line unexpectedly.
  - `native-editor-shot-paste.png`: pasted Markdown renders as bold text before the existing strong token, and the caret lands after the pasted content.
  - `native-editor-shot-remote.png`: a remote blockquote insertion appears above the active document without remounting the rendered surface.
  - `native-editor-shot-code-block.png`: code-block text selection stays inside the rendered code surface and remains aligned to the code text.
  - `native-editor-shot-hidpi.png`: high-DPI DOM crop keeps the selected list text aligned; the right edge intentionally crops unrelated paragraph text.
- Notes:
  - This review found and fixed a real source-map bug: layout `blockIndex` referred to normalized layout blocks, not parser source blocks, which broke list-item and post-list paragraph mappings.
  - Final Canvas visual parity, real mobile selection-handle screenshots, and OS candidate-window screenshots remain pending.

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

### 2026-04-20 Visual Baselines

- Reviewer: Codex
- Scenario: committed Playwright visual baselines for stable native editor crops
- Result: pass on the local macOS Chromium baseline
- Reviewed baseline screenshots:
  - `native-editor-visual-idle-darwin.png`: deterministic idle crop renders the note, link, inline code, and caret without debug UI noise.
  - `native-editor-visual-cross-block-selection-darwin.png`: cross-block selection spans paragraph/list text with stable geometry and visible list marker gaps.
  - `native-editor-visual-active-marker-darwin.png`: active strong token reveals raw `**` markers without overlapping neighboring inline code.
  - `native-editor-visual-composition-link-darwin.png`: link-label preedit is underlined and remains positioned before the rendered link text.
  - `native-editor-visual-canvas-selection-darwin.png`: Canvas crop renders at high DPI and keeps the selection overlay aligned with paragraph/list text.
- Notes:
  - These are hard visual diffs through Playwright `toHaveScreenshot`, not only generated review artifacts.
  - The current baseline is macOS/Chromium-specific. Refreshing baselines must be a reviewed visual change.

### 2026-04-20 Canvas Native Editor

- Reviewer: Codex
- Scenario: interactive Canvas-native editor story with hidden textarea input bridge
- Result: pass for first Canvas-native editor crop and composition preedit crop
- Reviewed baseline screenshots:
  - `native-editor-visual-canvas-native-editor-darwin.png`: the visible editing surface is a Canvas-rendered Markdown tile; heading, list text, variable-width inline text, inline code, link text, CJK text, and emoji all render without a DOM text surface.
- Reviewed generated screenshots:
  - `native-editor-canvas-native-composition.png`: synthetic preedit text is not committed to Markdown source, while the Canvas renderer keeps the active caret/composition underline on the rendered line.
- Notes:
  - The browser test independently recomputes the `WWWW` hit-test coordinate with Canvas `measureText`, then checks both source offset and caret geometry. This is meant to catch regressions back to proportional character-width placement.
  - This validates the first Canvas-native editing path. It still uses the existing tile skin rather than final document-canvas art direction.

### 2026-04-20 Source-Preserving Newlines

- Reviewer: Codex
- Scenario: refreshed visual baselines after native editor layout began preserving source newline characters
- Result: pass on the local macOS Chromium baseline
- Reviewed baseline screenshots:
  - `native-editor-visual-idle-darwin.png`: blank source lines and paragraph softbreaks are now visible as real vertical advances; the heading marker reveal and caret remain aligned.
  - `native-editor-visual-cross-block-selection-darwin.png`: cross-block selection still spans paragraph/list content with stable geometry after the line-height based source spacing change.
  - `native-editor-visual-active-marker-darwin.png`: active marker reveal still exposes raw Markdown controls without overlap after explicit source lines are used.
  - `native-editor-visual-composition-link-darwin.png`: composition underline remains attached to the link-label line after source-preserving line layout.
  - `native-editor-visual-canvas-selection-darwin.png`: Canvas selection crop reflects the same source line advances and keeps overlay rectangles on the intended lines.
  - `native-editor-visual-canvas-native-editor-darwin.png`: Canvas-native editor crop now shows source line gaps consistently with the DOM editor path.
- Notes:
  - The changed screenshots are intentional: native editing no longer uses Markdown preview softbreak collapsing.
  - Parser semantics are unchanged; this is an editor-layout behavior change.

### 2026-04-20 Font-Ready Canvas Native Baseline

- Reviewer: Codex
- Scenario: Canvas-native editor visual baseline after waiting for Inter/JetBrains Mono before layout
- Result: pass on the local macOS Chromium baseline
- Reviewed baseline screenshots:
  - `native-editor-visual-canvas-native-editor-darwin.png`: the Canvas-native editor now uses real Inter/JetBrains Mono metrics instead of fallback/serif-like widths; heading, paragraph, list rows, `WWWW`, inline code, link text, CJK text, and emoji remain aligned and non-overlapping.
- Notes:
  - The old baseline differed because layout was allowed to happen before the Storybook font stylesheet and FontFaceSet had finished loading.
  - The browser test now asserts target fragment font readiness and that the layout fragment width matches a fresh `canvas.measureText` width within 1px, so this visual baseline is backed by a geometry check rather than only pixel comparison.

### 2026-04-20 Canvas Native Control Editing Crops

- Reviewer: Codex
- Scenario: Canvas-native editor visual baselines for editing states near Markdown controls, link suffix controls, and emoji.
- Result: pass on the local macOS Chromium baseline.
- Artifact size check:
  - `native-editor-visual-canvas-native-control-editing-darwin.png`: `780x430`, about `162K`.
  - `native-editor-visual-canvas-native-link-editing-darwin.png`: `780x430`, about `165K`.
  - `native-editor-visual-canvas-native-emoji-editing-darwin.png`: `780x430`, about `161K`.
- Reviewed baseline screenshots:
  - `native-editor-visual-canvas-native-control-editing-darwin.png`: Canvas is nonblank; strong Markdown controls are revealed around `bold text`; caret is inside the source-addressed strong token without shifting the line.
  - `native-editor-visual-canvas-native-link-editing-darwin.png`: Canvas reveals `[docs](https://example.com)`; caret sits inside the URL suffix rather than snapping back to the rendered link label.
  - `native-editor-visual-canvas-native-emoji-editing-darwin.png`: caret lands immediately after the family emoji; the Canvas text run does not show the repeated-emoji drift class of bug.
- Notes:
  - These crops are committed Playwright visual baselines, not only generated artifacts.
  - They specifically guard the states that manual testing tends to catch late: hidden controls becoming visible, hidden link suffixes becoming editable, and emoji caret placement staying on grapheme boundaries.
