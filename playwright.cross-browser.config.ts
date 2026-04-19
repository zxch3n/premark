import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/cross-browser",
  outputDir: "./artifacts/playwright-cross-browser",
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-cross-browser-html", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4176",
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
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        deviceScaleFactor: 1,
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
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
