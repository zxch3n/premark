/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/macos-ime",
  outputDir: "./artifacts/playwright-macos-ime",
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-macos-ime-html", open: "never" }],
  ],
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4176",
    headless: false,
    trace: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 1100,
    },
  },
  projects: [
    {
      name: "macos-chromium-real-ime",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "vp run playground#dev -- --host 127.0.0.1 --port 4176",
    port: 4176,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
