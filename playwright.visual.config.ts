import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual-parity",
  outputDir: "./artifacts/playwright",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-html", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 1100,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "vp run playground#dev -- --host 127.0.0.1 --port 4174",
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
