import { expect, test, type Page } from "@playwright/test";

declare const process: {
  readonly platform: string;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();
});

test("commits CJK text through Chromium CDP Input.insertText", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP input is Chromium-only.");

  await openEmptyImeTarget(page);
  const client = await page.context().newCDPSession(page);
  await client.send("Input.insertText", { text: "你好かな" });

  await expect.poll(async () => (await activeText(page))?.trim()).toBe("你好かな");
  await page.locator("[data-commit-overlay]").click();
  await expect(page.locator("[data-canvas-surface]")).toContainText("你好かな");
});

test("documents current CDP imeSetComposition blocker on CodeMirror overlay", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CDP input is Chromium-only.");
  test.fixme(
    true,
    "Chromium Input.imeSetComposition currently leaves preedit text stuck and can trip CodeMirror 6 composition/tile assertions in this overlay. Keep real preedit coverage in synthetic + macOS OS IME layers until this is isolated.",
  );
});

async function openEmptyImeTarget(page: Page): Promise<void> {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();
  await expect(page.locator(".editable-overlay-host")).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await expect.poll(() => activeText(page)).toBe("");
}

async function activeText(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __premarkCanvasEditor?: {
            activeText: () => string | null;
          };
        }
      ).__premarkCanvasEditor?.activeText() ?? null,
  );
}
