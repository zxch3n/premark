# Safari And WebKit Acceptance

This gate keeps Safari/WebKit coverage separate from the existing Chromium browser gate.

## Layers

- `vp run test:browser:webkit`: fast Playwright WebKit proxy coverage. This is not real Safari and is not a real IME oracle.
- `vp run test:safari:preflight`: local macOS preflight for Safari, Safari Technology Preview, and `safaridriver` availability.
- `vp run test:safari`: real desktop Safari WebDriver behavior runner for hidden textarea focus, typing, Enter, paste, pointer selection, and Canvas geometry. If Safari Remote Automation is not enabled, this writes a skip artifact instead of failing unless `PREMARK_SAFARI_STRICT=1` is set.
- `vp run test:real-interactions:safari`: regular foreground Safari plus real macOS keyboard/mouse/clipboard events. This targets interactions that Playwright/WebDriver cannot prove, such as System Events shortcuts, system clipboard cut/copy/paste, double/triple click timing, and HID drag selection.
- Real foreground Safari IME runner: must stay separate from Safari WebDriver automation windows, because Safari WebDriver installs an automation glass pane that guards the window from stray keyboard and mouse input.
- iOS/iPadOS Safari: must be a separate connected-device gate. Desktop Safari and Playwright device emulation do not prove soft keyboard, visual viewport, touch selection handles, autocorrect, or mobile IME correctness.

## Desktop Safari Setup

Run once on the Mac:

```sh
safaridriver --enable
```

Safari can also be enabled from Safari's Develop menu with Allow Remote Automation. Safari Technology Preview uses its own bundled `safaridriver`.
On this machine, `safaridriver --enable` requests a password, so the agent cannot complete it unattended. Zixuan needs to enable Remote Automation once before `vp run test:safari` can run the behavior checks instead of producing a skip artifact.

For foreground real-interaction tests, Safari also needs:

- Safari > Develop > Allow JavaScript from Apple Events
- macOS Accessibility permission for System Events / Swift HID mouse events

Constraints:

- Safari WebDriver runs one Safari automation session at a time.
- Safari automation windows are isolated from normal browsing state.
- Safari automation windows intentionally guard against stray external input.
- Do not use Safari WebDriver as proof that OS-level IME key events can reach a foreground browser.

## iOS And iPadOS Setup

On the device:

- Enable Safari > Advanced > Web Inspector.
- Enable Safari > Advanced > Remote Automation.
- Connect the device to the Mac that runs the tests.

The first smoke gate should cover hidden textarea focus, soft keyboard anchoring, visual viewport resize/scroll, touch selection start/end/drag, autocorrect/predictive text smoke, and at least one mobile IME path.

## Classification

Every Safari/WebKit failure should be classified as one of:

- implementation bug
- WebKit event-order difference
- unsupported synthetic limitation
- real Safari WebDriver limitation
- real foreground OS input limitation
- expected visual difference

Do not leave a failure as a generic "Safari bug".
