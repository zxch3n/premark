# Browser Test Reporting

`vp run test:browser` writes Playwright runtime artifacts under ignored `artifacts/`
folders so CI can upload them without polluting git:

- `artifacts/playwright-browser`: per-test outputs, explicit screenshot crops, failure screenshots, and trace zips.
- `artifacts/playwright-browser-html`: Playwright HTML report.

The browser config keeps `screenshot: "only-on-failure"` and
`trace: "retain-on-failure"`. A failed interaction test should therefore include
at least one failure screenshot plus a `trace.zip`. Deterministic review crops
created through `testInfo.outputPath(...)` are also stored beside the test output.

Baseline visual assertions are enabled for the stable native editor crops in
`tests/browser/native-editor-visual.spec.ts`. The committed baselines live under
`tests/browser/native-editor-visual.spec.ts-snapshots` and currently target the
local macOS Chromium/font stack. On mismatch, Playwright writes the actual image,
expected baseline, and diff image into the same output folder. Those
actual/expected/diff images, the HTML report, and any event trace fixture that
produced the screenshot must be uploaded together by CI.

Current CI artifact guidance:

```yaml
- run: vp run storybook:build
- run: vp run test:browser
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-browser-artifacts
    path: |
      artifacts/playwright-browser
      artifacts/playwright-browser-html
```

To intentionally refresh baselines after a reviewed visual change:

```bash
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost vp exec playwright test tests/browser/native-editor-visual.spec.ts --update-snapshots
```

Do not refresh baselines as part of routine failure triage; inspect the
actual/expected/diff images first.
