import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:6106",
    colorScheme: "light",
    deviceScaleFactor: 1,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    viewport: {
      width: 1180,
      height: 760,
    },
  },
  webServer: {
    command: "python3 -m http.server 6106 --bind 127.0.0.1 --directory storybook-static",
    reuseExistingServer: true,
    timeout: 30_000,
    url: "http://127.0.0.1:6106",
  },
});
