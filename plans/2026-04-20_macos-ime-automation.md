# IME Automation Plan

Status: in progress
Owner: Codex / Zixuan
Last Updated: 2026-04-20

## Current Objective

- Turn IME coverage from a manual release follow-up into a layered test suite.
- Keep the fast layers CI-friendly.
- Make the real OS layer macOS-first and opt-in, because it needs Accessibility permission, a visible browser, and an installed input source.

## New Learnings

- Playwright synthetic input can check our composition guard and state machine, but it cannot prove real OS IME behavior.
- Chromium CDP `Input.insertText` is useful for IME/emoji-style commit coverage. CDP `Input.imeSetComposition` is Chromium-only, experimental, and currently trips CodeMirror 6 composition/tile state in this overlay, so it is tracked as a blocker instead of a green CI gate.
- macOS real IME automation must drive the focused browser through `System Events`; the runner has to be headed and serial.
- Input source switching is the least portable part on macOS. The runner supports `im-select` when available and an override command for local machines.
- The current machine has Apple Pinyin enabled and Swift available, but `System Events` automation hangs without Accessibility permission. The runner now has a preflight timeout so this fails clearly instead of stalling.

## Phase 1: Synthetic Browser Coverage

Goal: prove our own overlay composition guard and event logging without depending on OS state.

- [x] Expose a test-only IME event log from the canvas editor demo.
- [x] Track overlay host identity so tests can detect remounts.
- [x] Add synthetic composition lifecycle coverage.
- [x] Add synthetic cancellation coverage.

Acceptance:

- [x] Tests run under `vp run test:ime:browser`.
- [x] Overlay host is stable while composing.
- [x] Synthetic cancellation does not leak preedit text into Markdown.

## Phase 2: Chromium CDP Coverage

Goal: exercise Chromium's browser input pipeline where it is stable, and track the preedit blocker explicitly.

- [x] Add CDP `Input.insertText` smoke coverage for CJK commit text.
- [x] Add a skipped/fixme test documenting the current `Input.imeSetComposition` blocker.
- [ ] Isolate whether `Input.imeSetComposition` can be made safe with a different CodeMirror selection/composition setup.
- [ ] Add CDP preedit/cancel coverage if the blocker is resolved.

Acceptance:

- [x] CDP commit path produces final Markdown text through `Input.insertText`.
- [ ] CDP preedit text reaches the active overlay without CodeMirror internal errors.
- [ ] CDP cancellation leaves the active overlay empty.

## Phase 3: macOS Real IME Smoke

Goal: make real OS IME smoke reproducible on a local or self-hosted macOS machine.

- [x] Add a headed macOS Playwright config.
- [x] Add opt-in macOS real IME tests using `osascript`.
- [x] Support a default Chinese Pinyin scenario.
- [x] Support a default Japanese Romaji scenario.
- [x] Support custom text/expected/key-code scenarios through environment variables.
- [x] Support input source switching through `im-select`, Swift/TIS, or a custom shell command.
- [x] Add preflight timeout for missing Accessibility permission.
- [x] Add selected-range replacement coverage.
- [x] Add preedit cancellation coverage.
- [x] Add rerender/other-document stream during composition coverage.
- [x] Add undo/redo after IME commit coverage.
- [ ] Run Chinese Pinyin on a real macOS input source.
- [ ] Run Japanese Romaji on a real macOS input source.
- [ ] Add a Korean scenario after choosing the target input source and expected key sequence.

Acceptance:

- [ ] `PREMARK_RUN_MACOS_IME=1 vp run test:ime:macos` passes on a configured macOS machine.
- [ ] The event log contains real `compositionstart` and `compositionend`.
- [ ] The committed canvas Markdown contains the expected CJK text.
- [ ] The active overlay host remains stable during OS composition.

## Commands

- Fast browser IME layers:
  - `vp run test:ime:browser`
- macOS real IME, assuming the active input source is already Pinyin:
  - `PREMARK_RUN_MACOS_IME=1 vp run test:ime:macos`
- macOS real IME with `im-select`:
  - `PREMARK_RUN_MACOS_IME=1 PREMARK_MACOS_IME_INPUT_SOURCE_ID=<source-id> vp run test:ime:macos`
- Japanese preset:
  - `PREMARK_RUN_MACOS_IME=1 PREMARK_MACOS_IME_SCENARIO=japanese vp run test:ime:macos`
- Custom scenario:
  - `PREMARK_RUN_MACOS_IME=1 PREMARK_MACOS_IME_TEXT=<typed> PREMARK_MACOS_IME_EXPECTED=<committed> PREMARK_MACOS_IME_KEY_CODES=<comma-separated-key-codes> vp run test:ime:macos`

## Iteration Log

### 2026-04-20

- Added event logging and overlay identity APIs to `?mode=canvas-editor`.
- Added synthetic composition and cancellation browser tests.
- Added Chromium CDP `Input.insertText` commit coverage.
- Tried Chromium CDP `Input.imeSetComposition`; it leaves preedit text stuck and can trigger CodeMirror 6 tile/composition assertions in the current overlay. The test is kept as an explicit fixme instead of a passing gate.
- Added `playwright.macos-ime.config.ts` and a real macOS IME smoke test.
- The macOS test is intentionally opt-in because it needs a headed browser and Accessibility permission.
- Real OS Pinyin/Japanese smoke has not yet been run on this machine after the harness was added.
- Expanded the macOS runner from a single smoke test to cover selected-range replacement, cancel, rerender/stream during composition, and undo/redo after IME commit.
- Added Swift/TIS input source switching fallback because `im-select` is not installed on the current machine.
- Tried direct `System Events` automation on this machine; it hung until killed, consistent with missing Accessibility permission for the current runner.
- Ran the opt-in Pinyin command with `PREMARK_RUN_MACOS_IME=1 PREMARK_MACOS_IME_INPUT_SOURCE_ID=com.apple.inputmethod.SCIM.ITABC`; it failed immediately in preflight because `System Events` is not authorized for the current runner. This confirms the suite now fails clearly instead of hanging.
- After Accessibility permission was granted, real macOS Pinyin automation ran. The stable path is selected-range replacement with native composition; direct composition into a truly empty CodeMirror document still reproduces a CodeMirror/Chromium composition tile blocker and is tracked as an explicit fixme.
- Changed the runner to send text one character at a time and to preserve CodeMirror selection by focusing instead of clicking before OS key dispatch. This matches real typing more closely and fixed the selected-replacement path.
- Redo after IME commit uses a shortcut fallback matrix, matching the browser test behavior.
- Validation:
  - `vp run test:ime:browser` passed with 3 passing tests and 1 explicit CDP preedit fixme.
  - `vp run test:ime:macos` skipped cleanly without `PREMARK_RUN_MACOS_IME=1`; 6 opt-in macOS real IME tests are registered.
  - `PREMARK_RUN_MACOS_IME=1 PREMARK_MACOS_IME_INPUT_SOURCE_ID=com.apple.inputmethod.SCIM.ITABC vp run test:ime:macos` failed at preflight due to missing Accessibility permission for `System Events`.
  - After Accessibility permission: `PREMARK_RUN_MACOS_IME=1 vp run test:ime:macos` passed with 5 passing real IME tests and 1 explicit empty-document fixme.
  - `vp run test:browser` passed with 10 passing tests and 1 explicit CDP preedit fixme.
  - `vp check --fix` passed with the two unrelated existing wiki-canvas warnings.
  - `vp run build` passed with the existing large playground chunk warning.
  - `vp test` passed: 5 files, 47 tests.
