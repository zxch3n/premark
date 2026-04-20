# macOS IME Runner

Run:

```sh
vp run test:macos-ime
```

The runner builds Storybook, serves the native Premark editor story, then runs two macOS-specific probes:

- A required US keyboard probe posts real macOS key events to the browser process and verifies that the hidden textarea bridge receives `keydown`, `beforeinput`, `input`, and source updates.
- A global HID US keyboard probe verifies that foreground OS key events can reach the focused hidden textarea. This is required before running real IME composition because targeted process events bypass macOS input methods.
- A real Pinyin probe runs only when the browser can be made the macOS foreground app and global HID key events reach the hidden textarea. This path uses global key codes so the selected macOS input source can create native composition events and candidate UI.

Current environment boundary:

- `CGEventPostToPid` can deliver physical key events to the browser process even when Chrome is not the foreground app.
- That targeted path bypasses macOS input-method composition, so it is useful for focus/input plumbing but is not a valid Pinyin IME test.
- When the browser cannot be foregrounded safely, or when global HID key events do not reach the focused hidden textarea, the runner records `test-results/macos-ime/pinyin-skip.txt` and exits successfully unless strict mode is enabled.

Useful environment variables:

- `PREMARK_MACOS_IME_SOURCE_ID`: input source ID to test. Defaults to `com.apple.inputmethod.SCIM.ITABC`.
- `PREMARK_MACOS_IME_BROWSER_CHANNEL`: Playwright browser channel. Defaults to `chrome`; set `bundled` to use Playwright's bundled Chromium.
- `PREMARK_MACOS_IME_STRICT=1`: fail instead of skip when real foreground Pinyin cannot run.

Artifacts:

- `test-results/macos-ime/pinyin-commit.png`: real Pinyin succeeded.
- `test-results/macos-ime/pinyin-skipped-no-foreground.png`: browser could not become foreground.
- `test-results/macos-ime/pinyin-skip.txt`: exact skip reason.
- `test-results/macos-ime/hid-probe-failed.png`: browser was foreground, but global HID events did not reach the focused hidden textarea.
- `test-results/macos-ime/hid-probe-failed.json`: event trace and source text for the HID skip.
- `test-results/macos-ime/*-failed.png`: failure crops for debugging.
