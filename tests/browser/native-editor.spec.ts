import { test, expect, type Page } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const screenshotStoryUrl = `${storyUrl}&screenshot=1`;
const activeMarkerScreenshotStoryUrl = `${screenshotStoryUrl}&marker=active`;
const canvasSelectionStoryUrl =
  "/iframe.html?id=editing-premark-canvas-selection--canvas-selection&viewMode=story";

async function readSelection(page: Page) {
  return JSON.parse((await page.locator("[data-debug-selection]").textContent()) ?? "{}") as {
    anchorOffset: number;
    headOffset: number;
    isCollapsed: boolean;
    direction: string;
    range: { from: number; to: number };
  };
}

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

async function resizeEditor(page: Page, width: number) {
  await page.evaluate(
    (nextWidth) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { resize(width: number): void };
        }
      ).__premarkNativeEditor?.resize(nextWidth),
    width,
  );
}

async function insertRemoteText(page: Page, offset: number, text: string) {
  await page.evaluate(
    ({ offset, text }) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { insertRemote(offset: number, text: string): void };
        }
      ).__premarkNativeEditor?.insertRemote(offset, text),
    { offset, text },
  );
}

async function dragTouchPointer(
  page: Page,
  selector: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }

  await page.evaluate(
    ({ selector, startX, startY, endX, endY }) => {
      const target = document.querySelector(selector);
      if (target === null) {
        throw new Error(`Missing touch target: ${selector}`);
      }

      const pointer = (type: string, x: number, y: number, buttons: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 41,
          pointerType: "touch",
          isPrimary: true,
          buttons,
        });

      target.dispatchEvent(pointer("pointerdown", startX, startY, 1));
      for (let step = 1; step <= 6; step += 1) {
        const ratio = step / 6;
        window.dispatchEvent(
          pointer(
            "pointermove",
            startX + (endX - startX) * ratio,
            startY + (endY - startY) * ratio,
            1,
          ),
        );
      }
      window.dispatchEvent(pointer("pointerup", endX, endY, 0));
    },
    {
      selector,
      startX: box.x + start.x,
      startY: box.y + start.y,
      endX: box.x + end.x,
      endY: box.y + end.y,
    },
  );
}

async function pasteMarkdown(page: Page, markdown: string) {
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
  test("captures deterministic screenshot-mode editor states", async ({ page }, testInfo) => {
    await page.goto(screenshotStoryUrl);

    const editor = page.locator(".pne-editor-wrap");
    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    await expect(surface).toContainText("Native rendered Markdown");

    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-idle.png") });

    await setSourceCaret(page, await sourceOffset(page, "Native rendered Markdown", "end"));
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-caret.png") });

    const paragraphStart = await sourceOffset(page, "Click text");
    const paragraphEnd = await sourceOffset(page, "rendered surface.", "end");
    await setSourceSelection(page, paragraphStart, paragraphEnd);
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-forward.png") });

    await setSourceSelection(page, paragraphEnd, paragraphStart);
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-backward.png") });

    await resizeEditor(page, 360);
    await setSourceSelection(page, paragraphStart, paragraphEnd);
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-wrapped.png") });

    const listEnd = await sourceOffset(page, "hidden textarea", "end");
    await setSourceSelection(page, paragraphStart, listEnd);
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-cross-block.png") });

    await resizeEditor(page, 720);
    const boldStart = await sourceOffset(page, "bold text");
    const boldEnd = await sourceOffset(page, "bold text", "end");
    await setSourceSelection(page, boldStart, boldEnd);
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-inline-token.png") });

    await page.goto(activeMarkerScreenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    const activeBoldStart = await sourceOffset(page, "bold text");
    await setSourceCaret(page, activeBoldStart + 2);
    await expect(surface).toContainText("**bold text**");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-active-marker.png") });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    const compositionBoldStart = await sourceOffset(page, "bold text");
    await setSourceCaret(page, compositionBoldStart);
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "ni" }));
    });
    await expect(surface).toContainText("ni");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-composition.png") });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "" }));
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceSelection(
      page,
      await sourceOffset(page, "bold text"),
      await sourceOffset(page, "bold text", "end"),
    );
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "替换" }));
    });
    await expect(surface).toContainText("替换");
    await editor.screenshot({
      path: testInfo.outputPath("native-editor-shot-composition-replace.png"),
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, (await sourceOffset(page, "bold text")) + 2);
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "强" }));
    });
    await expect(surface).toContainText("强");
    await editor.screenshot({
      path: testInfo.outputPath("native-editor-shot-composition-strong.png"),
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, await sourceOffset(page, "inline code"));
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "码" }));
    });
    await expect(surface).toContainText("码");
    await editor.screenshot({
      path: testInfo.outputPath("native-editor-shot-composition-code.png"),
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, await sourceOffset(page, "docs"));
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "链" }));
    });
    await expect(surface).toContainText("链");
    await editor.screenshot({
      path: testInfo.outputPath("native-editor-shot-composition-link.png"),
    });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await setSourceCaret(page, await sourceOffset(page, "Try ", "end"));
    await pasteMarkdown(page, "**Paste Preview** ");
    await expect(surface).toContainText("Paste Preview");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-paste.png") });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await insertRemoteText(page, 0, "> Remote edit\n\n");
    await expect(surface).toContainText("Remote edit");
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-remote.png") });

    await page.goto(screenshotStoryUrl);
    await expect(surface).toContainText("Native rendered Markdown");
    await insertRemoteText(
      page,
      (await editorMarkdown(page)).length,
      "\n\n```ts\nconst x = 1;\n```",
    );
    await expect(surface).toContainText("const x = 1;");
    await setSourceSelection(
      page,
      await sourceOffset(page, "const x"),
      await sourceOffset(page, "const x = 1;", "end"),
    );
    await editor.screenshot({ path: testInfo.outputPath("native-editor-shot-code-block.png") });
  });

  test("captures high-dpi DOM selection crop", async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:6106",
      deviceScaleFactor: 2,
      viewport: { width: 900, height: 640 },
    });
    const page = await context.newPage();
    try {
      await page.goto(screenshotStoryUrl);

      const editor = page.locator(".pne-editor-wrap");
      const surface = page.locator("[data-editor-surface]");
      await expect(surface).toContainText("Native rendered Markdown");
      await page.addStyleTag({
        content: `
          .pne-screenshot-mode .pne-shell { width: 560px; }
          .pne-screenshot-mode .pne-viewport { min-height: 280px; max-height: 280px; }
        `,
      });
      await resizeEditor(page, 500);

      await setSourceSelection(
        page,
        await sourceOffset(page, "Selection is stored"),
        await sourceOffset(page, "source offsets.", "end"),
      );
      const box = await editor.boundingBox();
      expect(box).not.toBeNull();
      if (box !== null) {
        await page.screenshot({
          clip: {
            x: box.x,
            y: box.y,
            width: 560,
            height: 282,
          },
          path: testInfo.outputPath("native-editor-shot-hidpi.png"),
        });
      }
    } finally {
      await context.close();
    }
  });

  test("captures high-dpi Canvas selection crop", async ({ browser }, testInfo) => {
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
      const pixelCheck = await canvas.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        const ctx = canvasElement.getContext("2d");
        if (ctx === null) {
          return {
            nonBackgroundPixels: 0,
            width: canvasElement.width,
            height: canvasElement.height,
          };
        }
        const data = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height).data;
        let nonBackgroundPixels = 0;
        for (let index = 0; index < data.length; index += 4 * 17) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];
          if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
            nonBackgroundPixels += 1;
          }
        }
        return { nonBackgroundPixels, width: canvasElement.width, height: canvasElement.height };
      });
      expect(pixelCheck.width).toBe(1120);
      expect(pixelCheck.height).toBe(680);
      expect(pixelCheck.nonBackgroundPixels).toBeGreaterThan(500);

      await canvas.screenshot({
        path: testInfo.outputPath("native-editor-canvas-selection-hidpi.png"),
      });
    } finally {
      await context.close();
    }
  });

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

  test("keeps rendered DOM selection out of the surface during composition", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await expect(bridge).toBeFocused();

    const surfaceStableBefore = await surface.evaluate((element) => {
      (window as typeof window & { __premarkSurfaceForTest?: Element }).__premarkSurfaceForTest =
        element;
      return true;
    });
    expect(surfaceStableBefore).toBe(true);

    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "shi" }));
    });

    await expect(surface).toContainText("shi");
    await expect(source).not.toContainText("shi");

    const domSelection = await page.evaluate(() => {
      const surface = document.querySelector("[data-editor-surface]");
      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode ?? null;
      const anchorElement =
        anchorNode instanceof Element ? anchorNode : (anchorNode?.parentElement ?? null);
      return {
        activeTag: document.activeElement?.tagName,
        anchorInsideSurface:
          surface !== null && anchorElement !== null ? surface.contains(anchorElement) : false,
        rangeCount: selection?.rangeCount ?? 0,
        selectedText: selection?.toString() ?? "",
        surfaceElementStable:
          (window as typeof window & { __premarkSurfaceForTest?: Element })
            .__premarkSurfaceForTest === surface,
      };
    });

    expect(domSelection.activeTag).toBe("TEXTAREA");
    expect(domSelection.anchorInsideSurface).toBe(false);
    expect(domSelection.selectedText).toBe("");
    expect(domSelection.rangeCount).toBeLessThanOrEqual(1);
    expect(domSelection.surfaceElementStable).toBe(true);
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

    await page.keyboard.press("Control+A");
    const allSelection = await readSelection(page);
    expect(allSelection.isCollapsed).toBe(false);
    expect(allSelection.range.from).toBe(0);
    expect(allSelection.range.to).toBeGreaterThan(100);
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

  test("keeps Premark source authoritative after rendered DOM mutation", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await surface.click({ position: { x: 118, y: 86 } });
    await surface.evaluate((element) => {
      element.textContent = "MUTATED BY EXTENSION";
    });

    await page.keyboard.type("source ");

    await expect(source).toContainText("source");
    await expect(source).not.toContainText("MUTATED BY EXTENSION");
    await expect(surface).toContainText("Native rendered Markdown");
    await expect(surface).not.toContainText("MUTATED BY EXTENSION");
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

    await page.evaluate(() => {
      document.body.style.setProperty("zoom", "1.2");
    });
    await surface.click({ position: { x: 140, y: 110 } });
    await expect(bridge).toBeFocused();
    const [zoomBridgeRect, zoomViewportRect] = await Promise.all([
      bridge.evaluate((element) => element.getBoundingClientRect().toJSON()),
      viewport.evaluate((element) => element.getBoundingClientRect().toJSON()),
    ]);
    expect(zoomBridgeRect.top).toBeGreaterThanOrEqual(zoomViewportRect.top);
    expect(zoomBridgeRect.left).toBeGreaterThanOrEqual(zoomViewportRect.left);
  });

  test("keeps hidden textarea anchored in a mobile visual viewport resize model", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:6106",
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 700 },
    });
    const page = await context.newPage();
    try {
      await page.goto(storyUrl);

      const surface = page.locator("[data-editor-surface]");
      const bridge = page.locator("[data-input-bridge]");
      await expect(surface).toContainText("Native rendered Markdown");

      await surface.tap({ position: { x: 92, y: 86 } });
      await expect(bridge).toBeFocused();

      await page.setViewportSize({ width: 390, height: 430 });
      await surface.tap({ position: { x: 120, y: 150 } });
      await expect(bridge).toBeFocused();

      const bridgeRect = await bridge.evaluate((element) =>
        element.getBoundingClientRect().toJSON(),
      );
      expect(bridgeRect.top).toBeGreaterThanOrEqual(0);
      expect(bridgeRect.top).toBeLessThanOrEqual(430);
      expect(bridgeRect.left).toBeGreaterThanOrEqual(0);
      expect(bridgeRect.left).toBeLessThanOrEqual(390);
    } finally {
      await context.close();
    }
  });

  test("models mobile touch selection geometry and soft-keyboard input", async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:6106",
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 700 },
    });
    const page = await context.newPage();
    try {
      await page.goto(storyUrl);

      const editor = page.locator(".pne-editor-wrap");
      const surface = page.locator("[data-editor-surface]");
      const bridge = page.locator("[data-input-bridge]");
      const source = page.locator("[data-debug-source]");
      await expect(surface).toContainText("Native rendered Markdown");

      await surface.tap({ position: { x: 92, y: 86 } });
      await expect(bridge).toBeFocused();
      await setSourceCaret(page, await sourceOffset(page, "Click text", "end"));
      await bridge.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        textarea.setRangeText(" mobile", textarea.selectionStart, textarea.selectionEnd, "end");
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: " mobile",
          }),
        );
      });
      await expect(source).toContainText("mobile");

      await dragTouchPointer(page, "[data-editor-surface]", { x: 30, y: 86 }, { x: 280, y: 196 });
      const selection = await readSelection(page);
      expect(selection.isCollapsed).toBe(false);
      expect(selection.range.to).toBeGreaterThan(selection.range.from);

      const selectionRects = await page.locator(".pne-selection").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
          };
        }),
      );
      expect(selectionRects.length).toBeGreaterThan(1);
      expect(selectionRects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);

      await editor.screenshot({
        path: testInfo.outputPath("native-editor-mobile-touch-selection.png"),
      });
    } finally {
      await context.close();
    }
  });
});
