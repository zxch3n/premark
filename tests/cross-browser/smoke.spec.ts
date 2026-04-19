import { expect, test } from "@playwright/test";

test("visual parity harness renders measurable Premark and overlay output", async ({ page }) => {
  await page.goto("/?mode=visual-parity&fixture=paragraph-short");
  await page.locator("[data-vp-ready='true']").waitFor();
  await page.evaluate(() => document.fonts.ready);

  const metrics = await page.evaluate(() => {
    const api = (
      window as unknown as {
        __premarkVisualParity?: {
          collect: () => {
            premark: { lines: unknown[] };
            overlay: { lines: unknown[] };
          };
        };
      }
    ).__premarkVisualParity;
    if (api === undefined) {
      throw new Error("visual parity API missing");
    }
    return api.collect();
  });

  expect(metrics.premark.lines.length).toBeGreaterThan(0);
  expect(metrics.overlay.lines.length).toBeGreaterThan(0);
});

test("canvas editor opens and keeps an editable overlay", async ({ page }) => {
  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();

  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Click a rendered block to edit it in-place" })
    .click();

  await expect(page.locator(".editable-overlay-host")).toBeVisible();
});
