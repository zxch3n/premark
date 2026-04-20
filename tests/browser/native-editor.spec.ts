import { test, expect } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";

async function readSelection(page: import("@playwright/test").Page) {
  return JSON.parse((await page.locator("[data-debug-selection]").textContent()) ?? "{}") as {
    anchorOffset: number;
    headOffset: number;
    isCollapsed: boolean;
    direction: string;
    range: { from: number; to: number };
  };
}

async function pasteMarkdown(page: import("@playwright/test").Page, markdown: string) {
  await page.locator("[data-input-bridge]").evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/markdown", value);
    data.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, markdown);
}

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
  }, testInfo) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "shi" }));
    });
    await expect(surface).toContainText("shi");
    await expect(source).not.toContainText("shi");
    await page
      .locator(".pne-editor-wrap")
      .screenshot({ path: testInfo.outputPath("native-editor-composition-preedit.png") });

    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "世界" }));
    });

    await expect(source).toContainText("世界");
  });

  test("supports desktop keyboard selection intents in the browser story", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    const initial = await readSelection(page);
    expect(initial.isCollapsed).toBe(true);

    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");

    const extended = await readSelection(page);
    expect(extended.isCollapsed).toBe(false);
    expect(extended.anchorOffset).toBe(initial.headOffset);
    expect(extended.headOffset).toBeGreaterThan(initial.headOffset);

    await page.keyboard.down("Meta");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Meta");

    const documentSelection = await readSelection(page);
    expect(documentSelection.isCollapsed).toBe(false);
    expect(documentSelection.headOffset).toBeGreaterThan(extended.headOffset);

    await surface.click({ position: { x: 118, y: 86 } });
    const wordStart = await readSelection(page);
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Alt");

    const wordMoved = await readSelection(page);
    expect(wordMoved.isCollapsed).toBe(true);
    expect(wordMoved.headOffset).toBeGreaterThan(wordStart.headOffset + 1);

    await page.keyboard.down("Shift");
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");

    const lineBoundarySelection = await readSelection(page);
    expect(lineBoundarySelection.isCollapsed).toBe(false);
    expect(lineBoundarySelection.anchorOffset).toBe(wordMoved.headOffset);
    expect(lineBoundarySelection.headOffset).toBeGreaterThan(wordMoved.headOffset);
  });

  test("supports browser paste and cut events through clipboard intents", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await bridge.evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/markdown", "**Pasted**");
      data.setData("text/plain", "Pasted");
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    });

    await expect(source).toContainText("**Pasted**");

    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");

    await bridge.evaluate((element) => {
      element.dispatchEvent(
        new ClipboardEvent("cut", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect(source).not.toContainText("**Pasted**");
  });

  test("keeps hidden textarea focused and anchored after scroll, blur and resize", async ({
    page,
  }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const viewport = page.locator(".pne-viewport");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await expect(bridge).toBeFocused();

    const longMarkdown = Array.from(
      { length: 36 },
      (_, index) => `Scroll probe line ${index + 1} with enough words to wrap inside the editor.`,
    ).join("\n\n");
    await pasteMarkdown(page, longMarkdown);
    await expect(source).toContainText("Scroll probe line 36");

    await viewport.evaluate((element) => {
      element.scrollTop = Math.floor(element.scrollHeight / 2);
    });

    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    if (viewportBox === null) return;

    await page.mouse.click(viewportBox.x + 120, viewportBox.y + 180);
    await expect(bridge).toBeFocused();

    const [bridgeRect, viewportRect] = await Promise.all([
      bridge.evaluate((element) => element.getBoundingClientRect().toJSON()),
      viewport.evaluate((element) => element.getBoundingClientRect().toJSON()),
    ]);
    expect(bridgeRect.top).toBeGreaterThanOrEqual(viewportRect.top);
    expect(bridgeRect.top).toBeLessThanOrEqual(viewportRect.bottom);
    expect(bridgeRect.left).toBeGreaterThanOrEqual(viewportRect.left);
    expect(bridgeRect.left).toBeLessThanOrEqual(viewportRect.right);

    await bridge.evaluate((element) => element.blur());
    await expect(bridge).not.toBeFocused();
    await page.mouse.click(viewportBox.x + 160, viewportBox.y + 220);
    await expect(bridge).toBeFocused();

    await page.setViewportSize({ width: 920, height: 640 });
    await surface.click({ position: { x: 180, y: 120 } });
    await expect(bridge).toBeFocused();
  });
});
