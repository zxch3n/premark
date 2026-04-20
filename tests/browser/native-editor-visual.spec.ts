import { test, expect, type Page } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const screenshotStoryUrl = `${storyUrl}&screenshot=1`;
const activeMarkerScreenshotStoryUrl = `${screenshotStoryUrl}&marker=active`;
const canvasSelectionStoryUrl =
  "/iframe.html?id=editing-premark-canvas-selection--canvas-selection&viewMode=story";
const canvasNativeStoryUrl =
  "/iframe.html?id=editing-premark-canvas-native-editor--interactive-canvas-native-editor&viewMode=story";
const visualParityStoryUrl =
  "/iframe.html?id=editing-premark-visual-parity--fixture-gallery&viewMode=story";

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

async function canvasEditorMarkdown(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { markdown(): string };
        }
      ).__premarkCanvasNativeEditor?.markdown() ?? "",
  );
}

async function sourceOffset(page: Page, text: string, edge: "start" | "end" = "start") {
  const markdown = await editorMarkdown(page);
  const offset = markdown.indexOf(text);
  expect(offset, `source offset for ${text}`).toBeGreaterThanOrEqual(0);
  return edge === "start" ? offset : offset + text.length;
}

async function canvasSourceOffset(page: Page, text: string, edge: "start" | "end" = "start") {
  const markdown = await canvasEditorMarkdown(page);
  const offset = markdown.indexOf(text);
  expect(offset, `canvas source offset for ${text}`).toBeGreaterThanOrEqual(0);
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

async function setCanvasSourceCaret(page: Page, offset: number) {
  await page.evaluate(
    (caretOffset) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { setCaret(offset: number): void };
        }
      ).__premarkCanvasNativeEditor?.setCaret(caretOffset),
    offset,
  );
}

async function readVisualParityReports(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __premarkVisualParity?: {
            fixtures(): Array<{
              id: string;
              title: string;
              blockCount: number;
              lineCount: number;
              totalHeight: number;
              caretRect: { x: number; y: number; width: number; height: number };
              selectionRects: Array<{ x: number; y: number; width: number; height: number }>;
              expectedText: string[];
              issues: string[];
            }>;
          };
        }
      ).__premarkVisualParity?.fixtures() ?? [],
  );
}

test.describe("Premark native editor visual baselines", () => {
  test("matches DOM and Canvas rendered Markdown parity fixtures", async ({ page }) => {
    await page.goto(visualParityStoryUrl);

    const root = page.locator(".pvp-root");
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    const reports = await readVisualParityReports(page);
    expect(reports.length).toBeGreaterThanOrEqual(6);

    for (const report of reports) {
      expect(report.issues, report.id).toEqual([]);
      expect(report.blockCount, report.id).toBeGreaterThan(0);
      expect(report.lineCount, report.id).toBeGreaterThan(0);
      expect(report.totalHeight, report.id).toBeGreaterThan(0);
      expect(report.caretRect.height, report.id).toBeGreaterThan(0);
      expect(report.selectionRects.length, report.id).toBeGreaterThan(0);

      const row = page.locator(`[data-fixture="${report.id}"]`);
      const domText = (await row.locator(".pvp-dom").textContent()) ?? "";
      for (const expected of report.expectedText) {
        expect(domText, `${report.id}: ${expected}`).toContain(expected);
      }

      await expect(row).toHaveScreenshot(`native-editor-visual-parity-${report.id}.png`, {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    }
  });

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

  test("matches Canvas native editor crop", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);
    const canvas = page.locator("[data-canvas-native-editor]");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveScreenshot("native-editor-visual-canvas-native-editor.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("matches Canvas native control, link and emoji editing crops", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);
    const canvas = page.locator("[data-canvas-native-editor]");
    await expect(canvas).toBeVisible();

    await setCanvasSourceCaret(page, (await canvasSourceOffset(page, "**bold text**")) + 2);
    await expect(canvas).toHaveScreenshot(
      "native-editor-visual-canvas-native-control-editing.png",
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      },
    );

    await setCanvasSourceCaret(page, (await canvasSourceOffset(page, "https://example.com")) + 8);
    await expect(canvas).toHaveScreenshot("native-editor-visual-canvas-native-link-editing.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });

    await setCanvasSourceCaret(page, await canvasSourceOffset(page, "👨‍👩‍👧‍👦", "end"));
    await expect(canvas).toHaveScreenshot("native-editor-visual-canvas-native-emoji-editing.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
