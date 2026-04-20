import { test, expect, type Page } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const screenshotStoryUrl = `${storyUrl}&screenshot=1`;
const activeMarkerScreenshotStoryUrl = `${screenshotStoryUrl}&marker=active`;
const canvasSelectionStoryUrl =
  "/iframe.html?id=editing-premark-canvas-selection--canvas-selection&viewMode=story";

async function editorMarkdown(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { markdown(): string };
        }
      ).__premarkNativeEditor?.markdown() ?? "",
  );
}

async function sourceOffset(page: Page, text: string, edge: "start" | "end" = "start") {
  const markdown = await editorMarkdown(page);
  const offset = markdown.indexOf(text);
  expect(offset, `source offset for ${text}`).toBeGreaterThanOrEqual(0);
  return edge === "start" ? offset : offset + text.length;
}

async function setSourceSelection(page: Page, anchor: number, head: number) {
  await page.evaluate(
    ({ anchor, head }) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { setSelection(anchor: number, head: number): void };
        }
      ).__premarkNativeEditor?.setSelection(anchor, head),
    { anchor, head },
  );
}

async function setSourceCaret(page: Page, offset: number) {
  await page.evaluate(
    (caretOffset) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { setCaret(offset: number): void };
        }
      ).__premarkNativeEditor?.setCaret(caretOffset),
    offset,
  );
}

test.describe("Premark native editor visual baselines", () => {
  test("matches deterministic DOM editor crops", async ({ page }) => {
    await page.goto(screenshotStoryUrl);

    const editor = page.locator(".pne-editor-wrap");
    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    await expect(surface).toContainText("Native rendered Markdown");
    await expect(editor).toHaveScreenshot("native-editor-visual-idle.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });

    const paragraphStart = await sourceOffset(page, "Click text");
    const listEnd = await sourceOffset(page, "hidden textarea", "end");
    await setSourceSelection(page, paragraphStart, listEnd);
    await expect(editor).toHaveScreenshot("native-editor-visual-cross-block-selection.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });

    await page.goto(activeMarkerScreenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, (await sourceOffset(page, "bold text")) + 2);
    await expect(surface).toContainText("**bold text**");
    await expect(editor).toHaveScreenshot("native-editor-visual-active-marker.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, await sourceOffset(page, "docs"));
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "链" }));
    });
    await expect(surface).toContainText("链");
    await expect(editor).toHaveScreenshot("native-editor-visual-composition-link.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("matches high-DPI Canvas selection crop", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:6106",
      deviceScaleFactor: 2,
      viewport: { width: 760, height: 520 },
    });
    const page = await context.newPage();
    try {
      await page.goto(canvasSelectionStoryUrl);
      const canvas = page.locator("[data-canvas-selection]");
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveScreenshot("native-editor-visual-canvas-selection.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    } finally {
      await context.close();
    }
  });
});
