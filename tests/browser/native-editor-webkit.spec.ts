import { expect, test, type Page, type TestInfo } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const canvasNativeStoryUrl =
  "/iframe.html?id=editing-premark-canvas-native-editor--interactive-canvas-native-editor&viewMode=story";

type EventTraceEntry = {
  readonly type: string;
  readonly key?: string;
  readonly code?: string;
  readonly inputType?: string;
  readonly data?: string;
  readonly isComposing?: boolean;
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
};

async function editorMarkdown(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { markdown(): string };
        }
      ).__premarkNativeEditor?.markdown() ?? "",
  );
}

async function canvasEditorMarkdown(page: Page): Promise<string> {
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

async function setSourceCaret(page: Page, offset: number): Promise<void> {
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

async function setCanvasCaret(page: Page, offset: number): Promise<void> {
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

async function readCanvasSelection(page: Page) {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __premarkCanvasNativeEditor?: {
          selection(): { anchorOffset: number; headOffset: number; isCollapsed: boolean };
        };
      }
    ).__premarkCanvasNativeEditor!.selection(),
  );
}

async function canvasPointForText(page: Page, text: string, edge: "start" | "end" = "start") {
  return page.evaluate(
    ({ text, edge }) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: {
            pointForText(text: string, edge?: "start" | "end"): { x: number; y: number };
          };
        }
      ).__premarkCanvasNativeEditor!.pointForText(text, edge),
    { text, edge },
  );
}

async function installTextareaEventTrace(page: Page, selector: string): Promise<void> {
  await page.evaluate((bridgeSelector) => {
    const bridge = document.querySelector<HTMLTextAreaElement>(bridgeSelector);
    if (bridge === null) {
      throw new Error(`Missing textarea bridge: ${bridgeSelector}`);
    }
    const trace: EventTraceEntry[] = [];
    (
      window as typeof window & {
        __premarkInputEventTrace?: EventTraceEntry[];
      }
    ).__premarkInputEventTrace = trace;
    const eventTypes = [
      "keydown",
      "beforeinput",
      "input",
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "keyup",
    ];
    for (const type of eventTypes) {
      bridge.addEventListener(
        type,
        (event) => {
          const maybeInput = event as InputEvent;
          const maybeKeyboard = event as KeyboardEvent;
          const maybeComposition = event as CompositionEvent;
          trace.push({
            type: event.type,
            key: "key" in event ? maybeKeyboard.key : undefined,
            code: "code" in event ? maybeKeyboard.code : undefined,
            inputType: "inputType" in event ? maybeInput.inputType : undefined,
            data: "data" in event ? (maybeInput.data ?? maybeComposition.data) : undefined,
            isComposing: "isComposing" in event ? Boolean(maybeInput.isComposing) : undefined,
            value: bridge.value,
            selectionStart: bridge.selectionStart,
            selectionEnd: bridge.selectionEnd,
          });
        },
        { capture: true },
      );
    }
  }, selector);
}

async function readTextareaEventTrace(page: Page): Promise<EventTraceEntry[]> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __premarkInputEventTrace?: EventTraceEntry[];
        }
      ).__premarkInputEventTrace ?? [],
  );
}

async function attachTrace(testInfo: TestInfo, name: string, trace: EventTraceEntry[]) {
  await testInfo.attach(name, {
    body: JSON.stringify(trace, null, 2),
    contentType: "application/json",
  });
}

function skipDesktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name === "mobile-webkit-proxy", "covered by the mobile proxy smoke");
}

test.describe("Premark native editor WebKit acceptance", () => {
  test("records hidden textarea event traces for normal input and synthetic composition", async ({
    page,
  }, testInfo) => {
    skipDesktopOnly(testInfo);
    await page.goto(storyUrl);

    const root = page.locator(".pne-root");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    await installTextareaEventTrace(page, "[data-input-bridge]");
    await setSourceCaret(page, await sourceOffset(page, "Click text"));
    await bridge.focus();
    await page.keyboard.type("Safari ");
    await expect(source).toContainText("Safari Click text");

    await setSourceCaret(page, await sourceOffset(page, "docs"));
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "査" }));
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "査" }));
    });
    await expect(source).toContainText("査docs");

    const trace = await readTextareaEventTrace(page);
    await attachTrace(testInfo, `${testInfo.project.name}-textarea-event-trace`, trace);

    expect(trace.some((entry) => entry.type === "keydown" && entry.key === "S")).toBe(true);
    expect(trace.some((entry) => entry.type === "beforeinput")).toBe(true);
    expect(trace.some((entry) => entry.type === "input")).toBe(true);
    expect(trace.some((entry) => entry.type === "compositionstart")).toBe(true);
    expect(trace.some((entry) => entry.type === "compositionupdate" && entry.data === "査")).toBe(
      true,
    );
    expect(trace.some((entry) => entry.type === "compositionend" && entry.data === "査")).toBe(
      true,
    );
  });

  test("validates rendered DOM editor focus, keyboard selection and clipboard smoke", async ({
    page,
  }, testInfo) => {
    skipDesktopOnly(testInfo);
    await page.goto(storyUrl);

    const root = page.locator(".pne-root");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    const selection = page.locator("[data-debug-selection]");
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    await setSourceCaret(page, await sourceOffset(page, "rendered surface.", "end"));
    await bridge.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(selection).toContainText('"isCollapsed": false');

    await page.keyboard.press("Backspace");
    await expect(source).toContainText("rendered surface");

    await page.keyboard.press("Enter");
    await page.keyboard.type("Safari line");
    await expect(source).toContainText("Safari line");

    await bridge.evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/plain", " pasted");
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
    });
    await expect(source).toContainText("Safari line pasted");
  });

  test("validates Canvas editor WebKit geometry, hit-test and input smoke", async ({
    page,
  }, testInfo) => {
    skipDesktopOnly(testInfo);
    await page.goto(canvasNativeStoryUrl);

    const root = page.locator(".pcne-root");
    const canvas = page.locator("[data-canvas-native-editor]");
    const bridge = page.locator("[data-canvas-input-bridge]");
    const source = page.locator("[data-canvas-debug-source]");
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await expect(canvas).toBeVisible();

    const textStart = await canvasPointForText(page, "WWWW");
    await canvas.click({ position: textStart });
    await expect(bridge).toBeFocused();
    await setCanvasCaret(page, await canvasSourceOffset(page, "WWWW"));

    const before = await readCanvasSelection(page);
    expect(before.isCollapsed).toBe(true);

    await page.keyboard.type("webkit ");
    await expect(source).toContainText("webkit WWWW");

    const docsStart = await canvasPointForText(page, "docs");
    await canvas.click({ position: docsStart });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "査" }));
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "査" }));
    });
    await expect(source).toContainText("査docs");
  });

  test("keeps the hidden textarea usable in the mobile WebKit proxy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-webkit-proxy", "mobile proxy only");
    await page.goto(storyUrl);

    const root = page.locator(".pne-root");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    await setSourceCaret(page, await sourceOffset(page, "Click text"));
    await bridge.focus();
    await expect(bridge).toBeFocused();

    const box = await bridge.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);

    await page.keyboard.insertText("mobile ");
    await expect(source).toContainText("mobile Click text");
  });
});
