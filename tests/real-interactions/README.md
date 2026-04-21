# Real Browser Interaction Runner

This runner covers interactions that Playwright can approximate but cannot prove as real OS input.

## Commands

Preflight only, no browser launch and no HID events:

```sh
vp run test:real-interactions:preflight
```

Chrome-based foreground browser:

```sh
vp run test:real-interactions:chrome
```

Regular foreground Safari:

```sh
vp run test:real-interactions:safari
```

Both targets:

```sh
vp run test:real-interactions
```

These tests take foreground focus and send real macOS keyboard and mouse events. They should only be
run when the machine is available for exclusive browser automation.

## Coverage

The scenario set focuses on operations that are weak signals in Playwright-only automation:

- real text input into the focused hidden textarea
- real Shift+Option word selection and Shift+Command document selection
- real Command+C, Command+X, and Command+V through the system clipboard
- real Return-key newline insertion
- real double-click word selection and triple-click block selection
- real cross-block mouse drag selection
- real Canvas click-to-focus, typing, and mouse drag selection

Chrome-based tests use Playwright only to launch/read page state; the input itself is sent through
System Events and the Swift HID helper. Safari tests use regular Safari plus JavaScript from Apple
Events for state inspection, not a Safari WebDriver automation window. That keeps this separate from
`vp run test:safari`, whose WebDriver window is useful for isolated browser behavior but not for
foreground OS input.

## Setup And Artifacts

- macOS Accessibility permission is required for System Events and HID mouse events.
- Safari requires `Develop > Allow JavaScript from Apple Events` for state inspection.
- The runner selects the US keyboard source for non-IME interaction tests and restores the previous
  input source afterward.
- Artifacts are written to `test-results/real-interactions/<target>/`.
- `PREMARK_REAL_INTERACTIONS_STRICT=1` turns environment skips into failures.
- `PREMARK_REAL_INTERACTIONS_BROWSER_CHANNEL=chrome` can run Chrome-based tests in installed Google
  Chrome instead of bundled Chromium/Chrome for Testing.

IME remains covered by `vp run test:macos-ime`. This runner deliberately avoids mixing IME scenario
state with non-IME clipboard, shortcut, and pointer behavior.
