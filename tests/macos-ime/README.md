# macOS IME Runner

Run:

```sh
vp run test:macos-ime
```

Non-interactive readiness check:

```sh
vp run test:macos-ime:dry-run
```

Foreground/input-source preflight:

```sh
vp run test:macos-ime:preflight
```

The dry run does not build Storybook, launch a browser, foreground an app, or post keyboard/HID
events. It only verifies the Swift helpers, records the current input source, checks whether the
selected target IME and US sources are enabled, lists likely Pinyin/Japanese/Korean input-source
candidates from both enabled and all installed input sources, and records the selected scenario set.
The preflight has the same no-HID/no-browser boundary, but also records current macOS foreground
diagnostics from System Events, `NSWorkspace`, and `CGSessionCopyCurrentDictionary`. It is the quick
check to run before the exclusive real IME path. If `CGSSessionScreenIsLocked` is `1`, real IME/HID
cannot run because macOS routes foreground state through `loginwindow`.

Input-source readiness uses `list-all` plus each source's enabled flag because macOS can omit enabled
input modes from `TISCreateInputSourceList(..., includeAllInstalled: false)`. The helper also has an
explicit `enable` command for manual setup, but the runner does not enable input sources automatically.

The runner builds Storybook, serves the native Premark editor story, then runs two macOS-specific probes:

- A required US keyboard probe posts real macOS key events to the browser process and verifies that the hidden textarea bridge receives `keydown`, `beforeinput`, `input`, and source updates.
- A global-key US keyboard probe verifies that foreground OS key events can reach the focused hidden textarea. This is required before running real IME composition because targeted process events bypass macOS input methods.
- A real IME probe runs only when the browser can be made the macOS foreground app and global key events reach the hidden textarea. This path uses System Events key codes by default so the selected macOS input source can create native composition events and candidate UI.

When the real IME path is enabled, the runner executes one scenario set. `pinyin` is the default:

- `pinyin-candidate-anchor`: start a Pinyin preedit, capture a whole-screen artifact for candidate-window anchoring, then cancel.
- `pinyin-commit`: commit `你好` at the current caret.
- `pinyin-cancel`: start a preedit and cancel it with Escape, leaving source unchanged.
- `pinyin-replacement`: replace rendered inline text with committed Pinyin text.
- `pinyin-cross-block-replacement`: replace a cross-block rendered selection with committed Pinyin text.
- `pinyin-undo`: commit Pinyin text and undo it through the browser history path.

Additional prepared sets:

- `japanese`: commit, cancel, and rendered-text replacement using a Japanese Romaji input source.
- `korean`: commit, cancel, and rendered-text replacement using a Korean 2-set input source.

Current environment boundary:

- `CGEventPostToPid` can deliver physical key events to the browser process even when Chrome is not the foreground app.
- That targeted path bypasses macOS input-method composition, so it is useful for focus/input plumbing but is not a valid IME test.
- When the browser cannot be foregrounded safely, or when global HID key events do not reach the focused hidden textarea, the runner records `test-results/macos-ime/ime-skip.txt` and exits successfully unless strict mode is enabled.
- The HID gate checks foreground state before posting global key codes. If macOS reports another app
  as frontmost, or if `NSWorkspace` reports `loginwindow`, the runner stops before sending HID input.

Useful environment variables:

- `PREMARK_MACOS_IME_SCENARIO_SET`: scenario set to run. Supported values: `pinyin`, `japanese`, `korean`. Defaults to `pinyin`.
- `PREMARK_MACOS_IME_SOURCE_ID`: input source ID to test. Defaults to the selected set's built-in macOS source ID.
- `PREMARK_MACOS_IME_BROWSER_CHANNEL`: Playwright browser channel. Defaults to `bundled` so real IME runs use the isolated Chrome for Testing app instead of an existing Chrome window.
- `PREMARK_MACOS_IME_GLOBAL_KEY_METHOD`: global key sender for the real IME path. Defaults to `system-events`. Set `swift-hid` only for diagnostics; in current testing it can reach Chrome but can bypass IME composition.
- `PREMARK_MACOS_IME_STRICT=1`: fail instead of skip when real foreground IME cannot run.
- `PREMARK_MACOS_IME_DRY_RUN=1`: run the non-interactive readiness check only.
- `PREMARK_MACOS_IME_PREFLIGHT=1`: run input-source plus foreground diagnostics only.

Artifacts:

- `test-results/macos-ime/dry-run.json`: input-source and helper readiness report.
- `test-results/macos-ime/dry-run.txt`: short dry-run summary.
- `test-results/macos-ime/dry-run-<scenario-set>.json`: scenario-set-specific dry-run report.
- `test-results/macos-ime/preflight.json`: input-source plus foreground readiness report.
- `test-results/macos-ime/preflight.txt`: short preflight summary.
- `test-results/macos-ime/preflight-<scenario-set>.json`: scenario-set-specific preflight report.
- `test-results/macos-ime/*-screen.png`: whole-screen OS screenshots, used for candidate-window anchoring when available.
- `test-results/macos-ime/<scenario-name>.png`: real IME scenario screenshots.
- `test-results/macos-ime/ime-skipped-locked-session.json`: foreground diagnostics captured before browser launch when the macOS session is locked.
- `test-results/macos-ime/ime-skipped-no-foreground.png`: browser could not become foreground.
- `test-results/macos-ime/ime-skipped-no-foreground.json`: foreground diagnostics for the final IME foreground gate.
- `test-results/macos-ime/ime-skip.txt`: exact skip reason.
- `test-results/macos-ime/hid-probe-no-foreground.png`: browser could not become foreground before the HID probe.
- `test-results/macos-ime/hid-probe-no-foreground.json`: foreground diagnostics for a skipped HID probe.
- `test-results/macos-ime/hid-probe-failed.png`: browser was foreground, but global HID events did not reach the focused hidden textarea.
- `test-results/macos-ime/hid-probe-failed.json`: event trace and source text for the HID skip.
- `test-results/macos-ime/*-failed.png`: failure crops for debugging.
