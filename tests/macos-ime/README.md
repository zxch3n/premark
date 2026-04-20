# macOS IME Runner

Run:

```sh
vp run test:macos-ime
```

Non-interactive readiness check:

```sh
vp run test:macos-ime:dry-run
```

The dry run does not build Storybook, launch a browser, foreground an app, or post keyboard/HID
events. It only verifies the Swift helpers, records the current input source, checks whether the
selected target IME and US sources are available, lists likely Pinyin/Japanese/Korean input-source
candidates, and records the selected scenario set.

The runner builds Storybook, serves the native Premark editor story, then runs two macOS-specific probes:

- A required US keyboard probe posts real macOS key events to the browser process and verifies that the hidden textarea bridge receives `keydown`, `beforeinput`, `input`, and source updates.
- A global HID US keyboard probe verifies that foreground OS key events can reach the focused hidden textarea. This is required before running real IME composition because targeted process events bypass macOS input methods.
- A real IME probe runs only when the browser can be made the macOS foreground app and global HID key events reach the hidden textarea. This path uses global key codes so the selected macOS input source can create native composition events and candidate UI.

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

Useful environment variables:

- `PREMARK_MACOS_IME_SCENARIO_SET`: scenario set to run. Supported values: `pinyin`, `japanese`, `korean`. Defaults to `pinyin`.
- `PREMARK_MACOS_IME_SOURCE_ID`: input source ID to test. Defaults to the selected set's built-in macOS source ID.
- `PREMARK_MACOS_IME_BROWSER_CHANNEL`: Playwright browser channel. Defaults to `chrome`; set `bundled` to use Playwright's bundled Chromium.
- `PREMARK_MACOS_IME_STRICT=1`: fail instead of skip when real foreground IME cannot run.
- `PREMARK_MACOS_IME_DRY_RUN=1`: run the non-interactive readiness check only.

Artifacts:

- `test-results/macos-ime/dry-run.json`: input-source and helper readiness report.
- `test-results/macos-ime/dry-run.txt`: short dry-run summary.
- `test-results/macos-ime/*-screen.png`: whole-screen OS screenshots, used for candidate-window anchoring when available.
- `test-results/macos-ime/<scenario-name>.png`: real IME scenario screenshots.
- `test-results/macos-ime/ime-skipped-no-foreground.png`: browser could not become foreground.
- `test-results/macos-ime/ime-skip.txt`: exact skip reason.
- `test-results/macos-ime/hid-probe-failed.png`: browser was foreground, but global HID events did not reach the focused hidden textarea.
- `test-results/macos-ime/hid-probe-failed.json`: event trace and source text for the HID skip.
- `test-results/macos-ime/*-failed.png`: failure crops for debugging.
