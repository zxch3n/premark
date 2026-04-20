import { test, expect } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";

test.describe("Premark native editor story", () => {
  test("supports rendered-surface click, typing, drag selection, replacement and screenshots", async ({
    page,
  }, testInfo) => {
    await page.goto(storyUrl);

    const editor = page.locator(".pne-editor-wrap");
    const surface = page.locator("[data-editor-surface]");
    const source = page.locator("[data-debug-source]");
    const selection = page.locator("[data-debug-selection]");
    await expect(surface).toContainText("Native rendered Markdown");

    await editor.screenshot({ path: testInfo.outputPath("native-editor-idle.png") });

    await surface.click({ position: { x: 118, y: 86 } });
    await page.keyboard.type("fast ");
    await expect(source).toContainText("fast");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-after-typing.png") });

    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    await page.mouse.move(box.x + 76, box.y + 82);
    await page.mouse.down();
    await page.mouse.move(box.x + 360, box.y + 236, { steps: 8 });
    await page.mouse.up();

    await expect(selection).toContainText('"isCollapsed": false');
    await editor.screenshot({ path: testInfo.outputPath("native-editor-selection.png") });

    await page.keyboard.type("X");
    await expect(source).toContainText("X");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-after-replace.png") });
  });

  test("commits synthetic composition events through the hidden textarea bridge", async ({
    page,
  }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "shi" }));
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "世界" }));
    });

    await expect(source).toContainText("世界");
  });
});
