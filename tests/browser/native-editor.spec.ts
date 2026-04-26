import { test, expect, type Page } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const screenshotStoryUrl = `${storyUrl}&screenshot=1`;
const activeMarkerScreenshotStoryUrl = `${screenshotStoryUrl}&marker=active`;
const canvasSelectionStoryUrl =
  "/iframe.html?id=editing-premark-canvas-selection--canvas-selection&viewMode=story";
const canvasNativeStoryUrl =
  "/iframe.html?id=editing-premark-canvas-native-editor--interactive-canvas-native-editor&viewMode=story";
const canvasNativeRepeatedEmojiStoryUrl = `${canvasNativeStoryUrl}&fixture=repeated-emoji`;
const canvasNativeLargeStoryUrl = `${canvasNativeStoryUrl}&fixture=large`;
const canvasNativeStreamingStoryUrl = `${canvasNativeStoryUrl}&fixture=streaming`;
const canvasNativeContentPadding = 28;
const nativeInteractionMarkdown = `# Native rendered Markdown

Click text, drag across blocks, then type directly on the rendered surface.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Try **bold text**, \`inline code\`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.`;
const canvasInteractionMarkdown = `# Canvas native editor

Click text, drag across blocks, then type directly on the rendered canvas.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Widths iiiii WWWW done.

Try **bold text**, \`inline code\`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.`;
const blankRunMarkdownFixture = [
  "# Canvas native editor",
  "",
  "",
  "asdfsd",
  "",
  "",
  "",
  "",
  "## adddfasdfdsf",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Click text, drag across blocks, then type directly on the rendered canvas.",
  "",
  "- Selection is stored as source offsets.",
  "",
  "",
  "",
  "",
  "",
  "- The hidden textarea mirrors only the active source slice.",
  "- Cross-block replacement uses one source operation.",
  "",
  "Widths iiiii WWWW done.",
  "",
  "Try **bold text**, `inline code`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.",
].join("\n");

async function readSelection(page: Page) {
  return JSON.parse((await page.locator("[data-debug-selection]").textContent()) ?? "{}") as {
    anchorOffset: number;
    headOffset: number;
    isCollapsed: boolean;
    direction: string;
    range: { from: number; to: number };
    headCaret: { rect: { x: number; y: number; width: number; height: number } };
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

async function setEditorMarkdown(page: Page, markdown: string) {
  await page.evaluate(
    (nextMarkdown) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: { setMarkdown(markdown: string): void };
        }
      ).__premarkNativeEditor!.setMarkdown(nextMarkdown),
    markdown,
  );
}

async function setCanvasEditorMarkdown(page: Page, markdown: string) {
  await page.evaluate(
    (nextMarkdown) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { setMarkdown(markdown: string): void };
        }
      ).__premarkCanvasNativeEditor!.setMarkdown(nextMarkdown),
    markdown,
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

async function readCanvasGeometry(page: Page) {
  return JSON.parse(
    (await page.locator("[data-canvas-debug-selection]").textContent()) ?? "{}",
  ) as {
    headCaret: { rect: { x: number; y: number; width: number; height: number } };
    caret?: { rect: { x: number; y: number; width: number; height: number } };
  };
}

async function countCanvasCaretPixels(page: Page) {
  return page.evaluate((contentPadding) => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-canvas-native-editor]");
    const geometry = JSON.parse(
      document.querySelector("[data-canvas-debug-selection]")?.textContent ?? "{}",
    ) as {
      headCaret: { rect: { x: number; y: number; width: number; height: number } };
    };
    const render = JSON.parse(
      document.querySelector("[data-canvas-debug-render]")?.textContent ?? "{}",
    ) as {
      viewport?: { scrollTop: number };
    };
    if (canvas === null) {
      return 0;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return 0;
    }
    const ratio = window.devicePixelRatio || 1;
    const caret = geometry.headCaret.rect;
    const x = Math.round((contentPadding + caret.x) * ratio);
    const y = Math.round((contentPadding + caret.y - (render.viewport?.scrollTop ?? 0)) * ratio);
    const width = Math.max(4, Math.ceil((caret.width + 4) * ratio));
    const height = Math.max(8, Math.ceil((caret.height + 2) * ratio));
    const image = context.getImageData(Math.max(0, x - 2), Math.max(0, y - 1), width, height);
    let pixels = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      const red = image.data[index] ?? 0;
      const green = image.data[index + 1] ?? 0;
      const blue = image.data[index + 2] ?? 0;
      const alpha = image.data[index + 3] ?? 0;
      if (
        red > 90 &&
        red < 160 &&
        green > 170 &&
        green < 235 &&
        blue > 130 &&
        blue < 210 &&
        alpha > 100
      ) {
        pixels += 1;
      }
    }
    return pixels;
  }, canvasNativeContentPadding);
}

async function readCanvasRenderDebug(page: Page) {
  return JSON.parse((await page.locator("[data-canvas-debug-render]").textContent()) ?? "{}") as {
    viewport: { scrollTop: number; height: number; overscanY: number };
    editableIndex: {
      mode: string;
      viewport?: { fromBlock: number; toBlock: number };
      fragmentCount: number;
      rebuiltFragmentCount: number;
    };
    dirtyRects: Array<{ x: number; y: number; width: number; height: number }>;
  };
}

async function readCanvasElementMetrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-canvas-native-editor]");
    const editor = document.querySelector<HTMLElement>(".pcne-editor");
    const render = JSON.parse(
      document.querySelector("[data-canvas-debug-render]")?.textContent ?? "{}",
    ) as {
      viewport?: { scrollTop: number; height: number; overscanY: number };
    };
    const canvasRect = canvas?.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect();
    return {
      cssWidth: canvasRect?.width ?? 0,
      cssHeight: canvasRect?.height ?? 0,
      editorHeight: editorRect?.height ?? 0,
      bitmapWidth: canvas?.width ?? 0,
      bitmapHeight: canvas?.height ?? 0,
      devicePixelRatio: window.devicePixelRatio || 1,
      viewport: render.viewport,
    };
  });
}

async function insertCanvasTextAt(page: Page, offset: number, text: string) {
  await page.evaluate(
    ({ offset, text }) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { insertAt(offset: number, text: string): void };
        }
      ).__premarkCanvasNativeEditor!.insertAt(offset, text),
    { offset, text },
  );
}

async function streamCanvasAIChunk(page: Page, chunk: string) {
  await page.evaluate(
    (chunkText) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { streamAIChunk(chunk: string): void };
        }
      ).__premarkCanvasNativeEditor!.streamAIChunk(chunkText),
    chunk,
  );
}

function caretIsVisuallyAfter(
  next: { headCaret: { rect: { x: number; y: number } } },
  previous: { headCaret: { rect: { x: number; y: number } } },
): boolean {
  if (next.headCaret.rect.y > previous.headCaret.rect.y + 0.5) {
    return true;
  }
  return (
    Math.abs(next.headCaret.rect.y - previous.headCaret.rect.y) <= 0.5 &&
    next.headCaret.rect.x > previous.headCaret.rect.x
  );
}

function sourceLines(markdown: string): Array<{ start: number; end: number; text: string }> {
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  for (let offset = 0; offset < markdown.length; offset += 1) {
    if (markdown.charCodeAt(offset) !== 10) continue;
    lines.push({ start, end: offset, text: markdown.slice(start, offset) });
    start = offset + 1;
  }
  lines.push({ start, end: markdown.length, text: markdown.slice(start) });
  return lines;
}

async function setCanvasCaret(page: Page, offset: number) {
  await page.evaluate(
    (caretOffset) =>
      (
        window as typeof window & {
          __premarkCanvasNativeEditor?: { setCaret(offset: number): void };
        }
      ).__premarkCanvasNativeEditor!.setCaret(caretOffset),
    offset,
  );
}

async function measuredCanvasPointForText(page: Page, text: string) {
  return page.evaluate(
    ({ text, contentPadding }) => {
      const editor = (
        window as typeof window & {
          __premarkCanvasNativeEditor?: {
            fragmentForText(text: string): {
              text: string;
              font: string;
              textInsetX: number;
              sourceRange: { from: number; to: number };
              rect: { x: number; y: number; width: number; height: number };
            };
          };
        }
      ).__premarkCanvasNativeEditor!;
      const fragment = editor.fragmentForText(text);
      const localOffset = fragment.text.indexOf(text);
      if (localOffset < 0) {
        throw new Error(`Text is not inside fragment: ${text}`);
      }
      const context = document.createElement("canvas").getContext("2d");
      if (context === null) {
        throw new Error("Missing canvas measurement context");
      }
      context.font = fragment.font;
      const fullWidth = context.measureText(fragment.text).width;
      const prefixWidth = context.measureText(fragment.text.slice(0, localOffset)).width;
      const visibleTextWidth = Math.max(0, fragment.rect.width - fragment.textInsetX * 2);
      const measuredLocalX = fragment.textInsetX + prefixWidth;
      const expectedContentX = fragment.rect.x + measuredLocalX;
      const proportionalContentX =
        fragment.rect.x + (fragment.rect.width * localOffset) / fragment.text.length;

      return {
        x: contentPadding + expectedContentX,
        y: contentPadding + fragment.rect.y + fragment.rect.height / 2,
        expectedContentX,
        layoutWidthDelta: Math.abs(visibleTextWidth - fullWidth),
        fontReady: "fonts" in document ? document.fonts.check(fragment.font, fragment.text) : true,
        proportionalDelta: Math.abs(expectedContentX - proportionalContentX),
      };
    },
    { text, contentPadding: canvasNativeContentPadding },
  );
}

async function canvasFragmentForText(page: Page, text: string) {
  return page.evaluate((needle) => {
    const editor = (
      window as typeof window & {
        __premarkCanvasNativeEditor?: {
          fragmentForText(text: string): {
            text: string;
            font: string;
            textInsetX: number;
            sourceRange: { from: number; to: number };
            rect: { x: number; y: number; width: number; height: number };
          };
        };
      }
    ).__premarkCanvasNativeEditor!;
    return editor.fragmentForText(needle);
  }, text);
}

async function canvasHasFragmentForText(page: Page, text: string) {
  return page.evaluate((needle) => {
    const editor = (
      window as typeof window & {
        __premarkCanvasNativeEditor?: {
          fragmentForText(text: string): unknown;
        };
      }
    ).__premarkCanvasNativeEditor!;
    try {
      editor.fragmentForText(needle);
      return true;
    } catch {
      return false;
    }
  }, text);
}

async function canvasSourceOffset(page: Page, text: string, edge: "start" | "end" = "start") {
  const markdown = await canvasEditorMarkdown(page);
  const offset = markdown.indexOf(text);
  expect(offset, `canvas source offset for ${text}`).toBeGreaterThanOrEqual(0);
  return edge === "start" ? offset : offset + text.length;
}

async function renderedPointForText(page: Page, text: string) {
  return page.evaluate((needle) => {
    const surface = document.querySelector<HTMLElement>("[data-editor-surface]");
    if (surface === null) {
      throw new Error("Missing editor surface");
    }
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const index = textNode.data.indexOf(needle);
      if (index < 0) continue;
      const offset = index + Math.floor(needle.length / 2);
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, Math.min(offset + 1, textNode.data.length));
      const rect = range.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        x: rect.left - surfaceRect.left + rect.width / 2,
        y: rect.top - surfaceRect.top + rect.height / 2,
      };
    }
    throw new Error(`Missing rendered text: ${needle}`);
  }, text);
}

async function renderedCenterPointForText(page: Page, text: string) {
  return page.evaluate((needle) => {
    const surface = document.querySelector<HTMLElement>("[data-editor-surface]");
    if (surface === null) {
      throw new Error("Missing editor surface");
    }
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const index = textNode.data.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + needle.length);
      const rect = range.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        x: rect.left - surfaceRect.left + rect.width / 2,
        y: rect.top - surfaceRect.top + rect.height / 2,
      };
    }
    throw new Error(`Missing rendered text: ${needle}`);
  }, text);
}

async function sourceOffset(page: Page, text: string, edge: "start" | "end" = "start") {
  const markdown = await editorMarkdown(page);
  const offset = markdown.indexOf(text);
  expect(offset, `source offset for ${text}`).toBeGreaterThanOrEqual(0);
  return edge === "start" ? offset : offset + text.length;
}

async function editorPointForSourceRange(page: Page, from: number, to: number) {
  return page.evaluate(
    ({ from, to }) =>
      (
        window as typeof window & {
          __premarkNativeEditor?: {
            pointForSourceRange(from: number, to: number): { x: number; y: number };
          };
        }
      ).__premarkNativeEditor!.pointForSourceRange(from, to),
    { from, to },
  );
}

async function editorPointForSourceText(page: Page, text: string) {
  const from = await sourceOffset(page, text);
  return editorPointForSourceRange(page, from, from + text.length);
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

async function pasteCanvasMarkdown(page: Page, markdown: string) {
  await page.locator("[data-canvas-input-bridge]").evaluate((element, value) => {
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
  test("ships table and image examples in the default editor fixtures", async ({ page }) => {
    await page.goto(storyUrl);
    await expect(page.locator("[data-editor-surface]")).toContainText("Native rendered Markdown");
    expect(await editorMarkdown(page)).toContain("| Element | Active editing behavior |");
    expect(await editorMarkdown(page)).toContain("![Tiny sample image](data:image/svg+xml");

    await page.goto(canvasNativeStoryUrl);
    await expect(page.locator("[data-canvas-native-editor]")).toBeVisible();
    expect(await canvasEditorMarkdown(page)).toContain("| Element | Active editing behavior |");
    expect(await canvasEditorMarkdown(page)).toContain("![Tiny sample image](data:image/svg+xml");
  });

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

  test("auto-sizes the Canvas native example to the rendered document height", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    await setCanvasEditorMarkdown(
      page,
      [
        "# Auto height",
        "",
        ...Array.from({ length: 28 }, (_, index) => `Visible source line ${index + 1}`),
      ].join("\n"),
    );

    await expect
      .poll(async () => (await readCanvasElementMetrics(page)).cssHeight)
      .toBeGreaterThan(430);
    await expect
      .poll(async () => {
        const metrics = await readCanvasElementMetrics(page);
        return Math.round(
          (metrics.viewport?.height ?? 0) - (metrics.cssHeight - canvasNativeContentPadding * 2),
        );
      })
      .toBe(0);

    const metrics = await readCanvasElementMetrics(page);
    expect(metrics.cssWidth).toBe(780);
    expect(metrics.editorHeight).toBeCloseTo(metrics.cssHeight, 0);
    expect(metrics.bitmapWidth).toBe(Math.round(metrics.cssWidth * metrics.devicePixelRatio));
    expect(metrics.bitmapHeight).toBe(Math.round(metrics.cssHeight * metrics.devicePixelRatio));
    expect(metrics.viewport?.height).toBeCloseTo(
      metrics.cssHeight - canvasNativeContentPadding * 2,
      0,
    );
    expect(metrics.viewport?.scrollTop).toBe(0);
  });

  test("supports Canvas native editor hit-test, typing, drag replacement and composition", async ({
    page,
  }, testInfo) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    const bridge = page.locator("[data-canvas-input-bridge]");
    const source = page.locator("[data-canvas-debug-source]");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, canvasInteractionMarkdown);
    await expect(source).toContainText("Canvas native editor");

    const headingTextStart = await canvasSourceOffset(page, "Canvas native editor");
    await setCanvasCaret(page, 0);
    const headingOffsetZero = await readCanvasGeometry(page);
    await setCanvasCaret(page, 1);
    const headingOffsetOne = await readCanvasGeometry(page);
    await setCanvasCaret(page, headingTextStart);
    const headingTextGeometry = await readCanvasGeometry(page);
    const measuredHeadingTextStart = await measuredCanvasPointForText(page, "Canvas native editor");
    expect(measuredHeadingTextStart.fontReady).toBe(true);
    expect(measuredHeadingTextStart.layoutWidthDelta).toBeLessThan(1);
    expect(headingOffsetOne.headCaret.rect.x).toBeGreaterThan(headingOffsetZero.headCaret.rect.x);
    expect(headingTextGeometry.headCaret.rect.x).toBeCloseTo(
      measuredHeadingTextStart.expectedContentX,
      0,
    );

    const markdownBeforeTyping = await canvasEditorMarkdown(page);
    const strongMarkerStart = markdownBeforeTyping.indexOf("**bold text**");
    expect(strongMarkerStart).toBeGreaterThanOrEqual(0);
    await setCanvasCaret(page, strongMarkerStart + 1);
    const strongMarkerMiddle = await readCanvasGeometry(page);
    await setCanvasCaret(page, strongMarkerStart + 2);
    const strongContentStart = await readCanvasGeometry(page);
    expect(strongContentStart.headCaret.rect.x).toBeGreaterThan(
      strongMarkerMiddle.headCaret.rect.x,
    );

    const linkSuffixStart = markdownBeforeTyping.indexOf("](https://example.com)");
    expect(linkSuffixStart).toBeGreaterThanOrEqual(0);
    await setCanvasCaret(page, linkSuffixStart + 9);
    const linkFirstSlash = await readCanvasGeometry(page);
    await setCanvasCaret(page, linkSuffixStart + 10);
    const linkSecondSlash = await readCanvasGeometry(page);
    expect(caretIsVisuallyAfter(linkSecondSlash, linkFirstSlash)).toBe(true);

    const variableStart = await measuredCanvasPointForText(page, "WWWW");
    expect(variableStart.fontReady).toBe(true);
    expect(variableStart.layoutWidthDelta).toBeLessThan(1);
    expect(variableStart.proportionalDelta).toBeGreaterThan(8);
    await canvas.click({ position: variableStart });
    await expect(bridge).toBeFocused();
    await setCanvasCaret(page, await canvasSourceOffset(page, "WWWW"));
    const measuredCaretGeometry = await readCanvasGeometry(page);
    expect(measuredCaretGeometry.headCaret.rect.x).toBeCloseTo(variableStart.expectedContentX, 0);
    const variableSelection = await readCanvasSelection(page);
    expect(variableSelection.isCollapsed).toBe(true);
    expect(variableSelection.headOffset).toBe(await canvasSourceOffset(page, "WWWW"));

    await page.keyboard.type("wide ");
    await expect(source).toContainText("wide WWWW");

    const dragStart = await canvasPointForText(page, "Click text");
    const dragEnd = await canvasPointForText(page, "hidden textarea", "end");
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 8 });
    await page.mouse.up();
    const draggedSelection = await readCanvasSelection(page);
    expect(draggedSelection.isCollapsed).toBe(false);
    expect(draggedSelection.headOffset).toBeGreaterThan(draggedSelection.anchorOffset);

    await page.keyboard.type("Canvas replace");
    await expect(source).toContainText("Canvas replace");
    await expect(source).not.toContainText("Click text, drag across blocks");

    const docsStart = await canvasPointForText(page, "docs");
    await canvas.click({ position: docsStart });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "链" }));
    });
    await expect(source).not.toContainText("链");
    await canvas.screenshot({
      path: testInfo.outputPath("native-editor-canvas-native-composition.png"),
    });
    await bridge.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "链" }));
    });
    await expect(source).toContainText("链docs");
  });

  test("moves Canvas caret to the next visual line on Enter in normal text", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, canvasInteractionMarkdown);

    const widthsPoint = await canvasPointForText(page, "Widths");
    await canvas.click({ position: widthsPoint });
    const before = await readCanvasGeometry(page);
    const beforeSelection = await readCanvasSelection(page);
    await page.keyboard.press("Enter");
    const after = await readCanvasGeometry(page);
    const afterSelection = await readCanvasSelection(page);
    const markdown = await canvasEditorMarkdown(page);

    expect(markdown).toContain("source operation.\n\n\nWidths iiiii");
    expect(afterSelection.headOffset).toBe(beforeSelection.headOffset + 1);
    expect(after.headCaret.rect.y).toBeGreaterThan(before.headCaret.rect.y);
    expect(after.headCaret.rect.x).toBeLessThanOrEqual(before.headCaret.rect.x + 1);
  });

  test("does not over-render Canvas source gaps for three newline characters", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, "a\n\n\nb");

    await setCanvasCaret(page, 0);
    const geometry = await readCanvasGeometry(page);
    const a = await canvasPointForText(page, "a");
    const b = await canvasPointForText(page, "b");
    const lineHeight = geometry.headCaret.rect.height;

    expect(lineHeight).toBeGreaterThan(10);
    expect(b.y - a.y).toBeCloseTo(lineHeight * 3, 0);
  });

  test("keeps Canvas Enter input to one source visual line per newline", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, "a");

    const end = await canvasPointForText(page, "a", "end");
    await canvas.click({ position: end });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("b");

    expect(await canvasEditorMarkdown(page)).toBe("a\n\n\nb");
    await setCanvasCaret(page, 0);
    const geometry = await readCanvasGeometry(page);
    const a = await canvasPointForText(page, "a");
    const b = await canvasPointForText(page, "b");
    expect(b.y - a.y).toBeCloseTo(geometry.headCaret.rect.height * 3, 0);
  });

  test("keeps leading spaces as source text instead of indented code in Canvas editor", async ({
    page,
  }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    const bridge = page.locator("[data-canvas-input-bridge]");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, "abc");

    const start = await canvasPointForText(page, "abc");
    await canvas.click({ position: start });
    await expect(bridge).toBeFocused();
    await page.keyboard.type("    ");

    expect(await canvasEditorMarkdown(page)).toBe("    abc");
    const fragment = await canvasFragmentForText(page, "abc");
    expect(fragment.text).toBe("    abc");
    expect(fragment.sourceRange).toEqual({ from: 0, to: 7 });

    await setCanvasCaret(page, 0);
    const startCaret = await readCanvasGeometry(page);
    await setCanvasCaret(page, 4);
    const textStartCaret = await readCanvasGeometry(page);
    expect(textStartCaret.headCaret.rect.x).toBeGreaterThan(startCaret.headCaret.rect.x + 8);
    expect(await countCanvasCaretPixels(page)).toBeGreaterThan(0);
  });

  test("keeps Canvas native large documents on viewport incremental paths", async ({ page }) => {
    await page.goto(canvasNativeLargeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const initialRender = await readCanvasRenderDebug(page);
    expect(initialRender.viewport.height).toBe(374);
    expect(initialRender.editableIndex.viewport).toBeDefined();
    expect(initialRender.editableIndex.fragmentCount).toBeLessThan(80);

    const markdown = await canvasEditorMarkdown(page);
    await setCanvasCaret(page, markdown.indexOf("User edit anchor") + "User".length);
    const appendOffset =
      markdown.lastIndexOf("AI stream target paragraph") + "AI stream target paragraph".length;
    await insertCanvasTextAt(page, appendOffset, " streamed token");
    const afterAppend = await readCanvasRenderDebug(page);
    expect(afterAppend.editableIndex.mode).toBe("incremental");
    expect(afterAppend.editableIndex.viewport).toBeDefined();
    expect(afterAppend.editableIndex.rebuiltFragmentCount).toBeLessThan(80);
    expect(afterAppend.dirtyRects).toEqual([]);

    await canvas.hover();
    await page.mouse.wheel(0, 900);
    await expect
      .poll(async () => (await readCanvasRenderDebug(page)).viewport.scrollTop)
      .toBeGreaterThan(0);
    const afterScroll = await readCanvasRenderDebug(page);
    expect(afterScroll.viewport.scrollTop).toBeGreaterThan(0);
    expect(afterScroll.editableIndex.viewport).toBeDefined();
  });

  test("streams AI chunks while Canvas native editing stays local", async ({ page }) => {
    await page.goto(canvasNativeStreamingStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const bridge = page.locator("[data-canvas-input-bridge]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const userOffset = await canvasSourceOffset(page, "User edit anchor", "end");
    await setCanvasCaret(page, userOffset);
    await bridge.focus();
    await page.keyboard.type(" local");
    const selectionBeforeStream = await readCanvasSelection(page);

    await streamCanvasAIChunk(page, " token-1");
    await streamCanvasAIChunk(page, " token-2");
    const selectionAfterStream = await readCanvasSelection(page);
    const markdown = await canvasEditorMarkdown(page);
    const renderDebug = await readCanvasRenderDebug(page);

    expect(markdown).toContain("User edit anchor local paragraph");
    expect(markdown).toContain("AI stream target paragraph: token-1 token-2");
    expect(selectionAfterStream).toEqual(selectionBeforeStream);
    expect(renderDebug.editableIndex.mode).toBe("incremental");
    expect(renderDebug.dirtyRects.length).toBeGreaterThan(0);
  });

  test("keeps Canvas native repeated emoji carets on stable grapheme boundaries", async ({
    page,
  }) => {
    await page.goto(canvasNativeRepeatedEmojiStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const emoji = "👨‍👩‍👧‍👦";
    const markdown = await canvasEditorMarkdown(page);
    const start = markdown.indexOf(emoji.repeat(7));
    expect(start).toBeGreaterThanOrEqual(0);

    const carets: Array<{ x: number; y: number }> = [];
    for (let index = 0; index <= 7; index += 1) {
      await setCanvasCaret(page, start + emoji.length * index);
      const geometry = await readCanvasGeometry(page);
      carets.push({
        x: geometry.headCaret.rect.x,
        y: geometry.headCaret.rect.y,
      });
    }

    for (let index = 1; index < carets.length; index += 1) {
      expect(carets[index]!.y).toBeCloseTo(carets[0]!.y, 0);
      expect(carets[index]!.x).toBeGreaterThan(carets[index - 1]!.x);
    }
    const deltas = carets.slice(1).map((caret, index) => caret.x - carets[index]!.x);
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(2);
  });

  test("keeps Canvas native emoji boundaries aligned before link and code fragments", async ({
    page,
  }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const emoji = "👨‍👩‍👧‍👦";
    await setCanvasEditorMarkdown(page, `${emoji}[docs](https://example.com)\`code\``);
    const markdown = await canvasEditorMarkdown(page);
    const emojiFragment = await canvasFragmentForText(page, emoji);
    const docsFragment = await canvasFragmentForText(page, "docs");
    const codeFragment = await canvasFragmentForText(page, "code");

    expect(docsFragment.rect.x).toBeCloseTo(emojiFragment.rect.x + emojiFragment.rect.width, 0);
    expect(codeFragment.rect.x).toBeCloseTo(docsFragment.rect.x + docsFragment.rect.width, 0);

    await setCanvasCaret(page, markdown.indexOf("[docs]"));
    const linkOpen = await readCanvasGeometry(page);
    await setCanvasCaret(page, markdown.indexOf("docs"));
    const docsStart = await readCanvasGeometry(page);
    expect(docsStart.headCaret.rect.x - linkOpen.headCaret.rect.x).toBeGreaterThan(4);
    expect(docsStart.headCaret.rect.x - linkOpen.headCaret.rect.x).toBeLessThan(8);
  });

  test("renders only the active Canvas table block as raw source text", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const firstTable = "| A | B |\n| - | - |\n| **x** | y |";
    const secondTable = "| C | D |\n| - | - |\n| 1 | 2 |";
    const markdown = `${firstTable}\n\noutside\n\n${secondTable}`;
    await setCanvasEditorMarkdown(page, markdown);

    await setCanvasCaret(page, markdown.indexOf("x"));
    const rawRow = await canvasFragmentForText(page, "| **x** | y |");
    expect(rawRow.sourceRange).toEqual({
      from: markdown.indexOf("| **x** | y |"),
      to: markdown.indexOf("| **x** | y |") + "| **x** | y |".length,
    });
    expect(await canvasHasFragmentForText(page, "| 1 | 2 |")).toBe(false);

    await setCanvasCaret(page, markdown.indexOf("outside"));
    expect(await canvasHasFragmentForText(page, "| **x** | y |")).toBe(false);
  });

  test("renders only the active Canvas image block as raw source text", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const firstImage = "![alt](./one.png)";
    const secondImage = "![other](./two.png)";
    const markdown = `${firstImage}\n\noutside\n\n${secondImage}`;
    await setCanvasEditorMarkdown(page, markdown);

    await setCanvasCaret(page, markdown.indexOf("alt"));
    const rawImage = await canvasFragmentForText(page, firstImage);
    expect(rawImage.sourceRange).toEqual({
      from: 0,
      to: firstImage.length,
    });
    expect(await canvasHasFragmentForText(page, secondImage)).toBe(false);

    await setCanvasCaret(page, markdown.indexOf("outside"));
    expect(await canvasHasFragmentForText(page, firstImage)).toBe(false);
  });

  test("supports double-click word and triple-click block selection", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Click text");

    const clickPoint = await renderedPointForText(page, "Click");
    await surface.click({ position: clickPoint });
    await surface.click({ position: clickPoint });
    const wordSelection = await readSelection(page);
    const clickStart = await sourceOffset(page, "Click text");
    expect(wordSelection.range).toEqual({
      from: clickStart,
      to: clickStart + "Click".length,
    });

    await surface.click({ position: clickPoint });
    const blockSelection = await readSelection(page);
    const markdown = await editorMarkdown(page);
    const blockStart = markdown.indexOf("Click text");
    const blockEnd = markdown.indexOf("rendered surface.") + "rendered surface.".length;
    expect(blockSelection.range).toEqual({
      from: blockStart,
      to: blockEnd,
    });
  });

  test("supports double-click word selection for CJK, emoji, links and inline code", async ({
    page,
  }) => {
    async function doubleClickRenderedText(text: string, pointSource: "dom" | "editor" = "dom") {
      await page.goto(storyUrl);
      const surface = page.locator("[data-editor-surface]");
      await expect(surface).toContainText(text);
      const point =
        pointSource === "editor"
          ? await editorPointForSourceText(page, text)
          : await renderedCenterPointForText(page, text);
      await surface.click({ position: point });
      await surface.click({ position: point });
      return readSelection(page);
    }

    const docsSelection = await doubleClickRenderedText("docs");
    const docsStart = await sourceOffset(page, "docs");
    expect(docsSelection.range).toEqual({
      from: docsStart,
      to: docsStart + "docs".length,
    });

    const codeSelection = await doubleClickRenderedText("inline", "editor");
    const codeStart = await sourceOffset(page, "inline code");
    expect(codeSelection.range).toEqual({
      from: codeStart,
      to: codeStart + "inline".length,
    });

    const emoji = "👨‍👩‍👧‍👦";
    const emojiSelection = await doubleClickRenderedText(emoji);
    const emojiStart = await sourceOffset(page, emoji);
    expect(emojiSelection.range).toEqual({
      from: emojiStart,
      to: emojiStart + emoji.length,
    });

    const cjkSelection = await doubleClickRenderedText("中文输入");
    const cjkStart = await sourceOffset(page, "中文输入");
    expect(cjkSelection.range.from).toBeGreaterThanOrEqual(cjkStart);
    expect(cjkSelection.range.to).toBeLessThanOrEqual(cjkStart + "中文输入".length);
    expect(cjkSelection.range.to).toBeGreaterThan(cjkSelection.range.from);
  });

  test("supports Canvas double-click word and triple-click block selection", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, canvasInteractionMarkdown);

    const wordStartPoint = await canvasPointForText(page, "WWWW");
    const wordEndPoint = await canvasPointForText(page, "WWWW", "end");
    const wordPoint = {
      x: (wordStartPoint.x + wordEndPoint.x) / 2,
      y: wordStartPoint.y,
    };
    await canvas.click({ position: wordPoint });
    await canvas.click({ position: wordPoint });
    const wordSelection = await readCanvasSelection(page);
    const wordStart = await canvasSourceOffset(page, "WWWW");
    expect(wordSelection).toEqual({
      anchorOffset: wordStart,
      headOffset: wordStart + "WWWW".length,
      isCollapsed: false,
    });

    await canvas.click({ position: wordPoint });
    const blockSelection = await readCanvasSelection(page);
    const markdown = await canvasEditorMarkdown(page);
    const blockStart = markdown.indexOf("Widths");
    const blockEnd = markdown.indexOf("done.") + "done.".length;
    expect(blockSelection).toEqual({
      anchorOffset: blockStart,
      headOffset: blockEnd,
      isCollapsed: false,
    });
  });

  test("supports reversed cross-block rendered drag selection", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Click text");

    const start = await renderedPointForText(page, "hidden textarea");
    const end = await renderedPointForText(page, "Click");
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 8 });
    await page.mouse.up();

    const selection = await readSelection(page);
    expect(selection.isCollapsed).toBe(false);
    expect(selection.direction).toBe("backward");
    const clickStart = await sourceOffset(page, "Click text");
    expect(selection.range.from).toBeGreaterThanOrEqual(clickStart);
    expect(selection.range.from).toBeLessThanOrEqual(clickStart + "Click".length);
    expect(selection.range.to).toBeGreaterThan(await sourceOffset(page, "hidden textarea"));
  });

  test("supports code/list selection drags and drag outside the rendered surface", async ({
    page,
  }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("inline code");
    await setEditorMarkdown(page, nativeInteractionMarkdown);
    await expect(surface).toContainText("inline code");
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    const codePoint = await editorPointForSourceText(page, "inline");
    const listPoint = await editorPointForSourceText(page, "Selection is stored");
    await page.mouse.move(box.x + codePoint.x, box.y + codePoint.y);
    await page.mouse.down();
    await page.mouse.move(box.x + listPoint.x, box.y + listPoint.y, { steps: 8 });
    await page.mouse.up();

    const codeToListSelection = await readSelection(page);
    expect(codeToListSelection.isCollapsed).toBe(false);
    expect(codeToListSelection.range.from).toBeLessThanOrEqual(await sourceOffset(page, "inline"));
    expect(codeToListSelection.range.to).toBeGreaterThan(
      await sourceOffset(page, "Selection is stored"),
    );

    const clickPoint = await editorPointForSourceText(page, "Click text");
    await page.mouse.move(box.x + clickPoint.x, box.y + clickPoint.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 80, box.y + box.height + 80, { steps: 10 });
    await page.mouse.up();

    const outsideSelection = await readSelection(page);
    expect(outsideSelection.isCollapsed).toBe(false);
    const clickStart = await sourceOffset(page, "Click text");
    expect(outsideSelection.range.from).toBeGreaterThanOrEqual(clickStart);
    expect(outsideSelection.range.from).toBeLessThanOrEqual(clickStart + "Click text".length);
    expect(outsideSelection.range.to).toBe(await sourceOffset(page, "rendered surface.", "end"));
  });

  test("reveals Markdown controls only when the active range needs them", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");

    await setSourceCaret(page, await sourceOffset(page, "Native rendered Markdown"));
    await expect(surface).toContainText("# Native rendered Markdown");
    const headingGeometry = await readSelection(page);
    const headingTextX = await surface.evaluate((element) => {
      const renderedSurface = element.querySelector(".pmd-surface");
      if (renderedSurface === null) {
        throw new Error("Missing rendered surface");
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode: Text | null = null;
      while (walker.nextNode()) {
        const candidate = walker.currentNode as Text;
        if (candidate.data.includes("# Native rendered Markdown")) {
          textNode = candidate;
          break;
        }
      }
      if (textNode === null) {
        throw new Error("Missing revealed heading text node");
      }
      const offset = textNode.data.indexOf("Native");
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);
      const rect = range.getBoundingClientRect();
      return rect.left - renderedSurface.getBoundingClientRect().left;
    });
    expect(headingGeometry.headCaret.rect.x).toBeCloseTo(headingTextX, 0);

    await setSourceCaret(page, (await sourceOffset(page, "bold text")) + 1);
    await expect(surface).toContainText("**bold text**");
    await expect(surface.locator(".pmd-fragment--strong", { hasText: "bold text" })).toBeVisible();

    await setSourceCaret(page, await sourceOffset(page, "docs"));
    await expect(surface).toContainText("[docs](https://example.com)");
    await expect(surface.locator("a.pmd-fragment--link", { hasText: "docs" })).toBeVisible();

    await setSourceSelection(
      page,
      await sourceOffset(page, "Try"),
      await sourceOffset(page, "emoji", "end"),
    );
    await expect(surface).not.toContainText("**bold text**");
    await expect(surface).not.toContainText("https://example.com");

    await setSourceSelection(
      page,
      await sourceOffset(page, "bold text"),
      await sourceOffset(page, "bold text", "end"),
    );
    await expect(surface).toContainText("**bold text**");
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
      const renderedDocument = element.querySelector(".pmd-doc");
      const renderedSurface = element.querySelector(".pmd-surface");
      (
        window as typeof window & {
          __premarkSurfaceForTest?: Element;
          __premarkRenderedDocumentForTest?: Element | null;
          __premarkRenderedSurfaceForTest?: Element | null;
        }
      ).__premarkSurfaceForTest = element;
      (
        window as typeof window & {
          __premarkRenderedDocumentForTest?: Element | null;
        }
      ).__premarkRenderedDocumentForTest = renderedDocument;
      (
        window as typeof window & {
          __premarkRenderedSurfaceForTest?: Element | null;
        }
      ).__premarkRenderedSurfaceForTest = renderedSurface;
      return renderedDocument !== null && renderedSurface !== null;
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
        renderedDocumentStable:
          (window as typeof window & { __premarkRenderedDocumentForTest?: Element | null })
            .__premarkRenderedDocumentForTest === surface?.querySelector(".pmd-doc"),
        renderedSurfaceStable:
          (window as typeof window & { __premarkRenderedSurfaceForTest?: Element | null })
            .__premarkRenderedSurfaceForTest === surface?.querySelector(".pmd-surface"),
      };
    });

    expect(domSelection.activeTag).toBe("TEXTAREA");
    expect(domSelection.anchorInsideSurface).toBe(false);
    expect(domSelection.selectedText).toBe("");
    expect(domSelection.rangeCount).toBeLessThanOrEqual(1);
    expect(domSelection.surfaceElementStable).toBe(true);
    expect(domSelection.renderedDocumentStable).toBe(true);
    expect(domSelection.renderedSurfaceStable).toBe(true);
  });

  test("exposes the hidden textarea as the focused input bridge", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.getByRole("textbox", { name: "Native editor input bridge" });
    await expect(surface).toContainText("Native rendered Markdown");
    await expect(bridge).toHaveAttribute("aria-label", "Native editor input bridge");

    await surface.click({ position: { x: 118, y: 86 } });
    await expect(bridge).toBeFocused();

    const bridgeSemantics = await bridge.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      const style = window.getComputedStyle(textarea);
      return {
        tagName: textarea.tagName,
        multiline: textarea instanceof HTMLTextAreaElement,
        opacity: style.opacity,
        ariaHidden: textarea.getAttribute("aria-hidden"),
        tabIndex: textarea.tabIndex,
        valueLength: textarea.value.length,
      };
    });

    expect(bridgeSemantics.tagName).toBe("TEXTAREA");
    expect(bridgeSemantics.multiline).toBe(true);
    expect(bridgeSemantics.opacity).not.toBe("0");
    expect(bridgeSemantics.ariaHidden).toBeNull();
    expect(bridgeSemantics.tabIndex).toBe(0);
    expect(bridgeSemantics.valueLength).toBeGreaterThanOrEqual(0);
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

    await setSourceCaret(page, await sourceOffset(page, "Click text"));
    await page.locator("[data-input-bridge]").focus();
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Shift");
    const shiftDownSelection = await readSelection(page);
    expect(shiftDownSelection.isCollapsed).toBe(false);
    expect(shiftDownSelection.anchorOffset).toBe(await sourceOffset(page, "Click text"));
    expect(shiftDownSelection.headOffset).toBeGreaterThan(shiftDownSelection.anchorOffset);

    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Shift");
    const shiftUpSelection = await readSelection(page);
    expect(shiftUpSelection.anchorOffset).toBe(shiftDownSelection.anchorOffset);
    expect(shiftUpSelection.headOffset).toBeLessThan(shiftDownSelection.headOffset);

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

    const bridge = page.locator("[data-input-bridge]");
    await setSourceCaret(page, await sourceOffset(page, "surface", "end"));
    await bridge.focus();
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
    const shiftLeftSelection = await readSelection(page);
    expect(shiftLeftSelection.isCollapsed).toBe(false);
    expect(shiftLeftSelection.anchorOffset).toBe(await sourceOffset(page, "surface", "end"));
    expect(shiftLeftSelection.headOffset).toBeLessThan(shiftLeftSelection.anchorOffset);

    const paragraphStart = await sourceOffset(page, "Click text");
    const paragraphEnd = await sourceOffset(page, "rendered surface.", "end");
    await setSourceCaret(page, paragraphEnd);
    await bridge.focus();
    await page.keyboard.press("Home");
    const homeSelection = await readSelection(page);
    expect(homeSelection.isCollapsed).toBe(true);
    expect(homeSelection.headOffset).toBe(paragraphStart);

    await page.keyboard.press("End");
    const endSelection = await readSelection(page);
    expect(endSelection.isCollapsed).toBe(true);
    expect(endSelection.headOffset).toBe(paragraphEnd);

    await setSourceCaret(page, paragraphEnd);
    await bridge.focus();
    await page.keyboard.down("Shift");
    await page.keyboard.press("Home");
    await page.keyboard.up("Shift");
    const shiftHomeSelection = await readSelection(page);
    expect(shiftHomeSelection.isCollapsed).toBe(false);
    expect(shiftHomeSelection.anchorOffset).toBe(paragraphEnd);
    expect(shiftHomeSelection.headOffset).toBe(paragraphStart);

    await setSourceCaret(page, await sourceOffset(page, "surface", "end"));
    await bridge.focus();
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Alt");
    const altLeftSelection = await readSelection(page);
    expect(altLeftSelection.isCollapsed).toBe(true);
    expect(altLeftSelection.headOffset).toBe(await sourceOffset(page, "surface"));

    await page.keyboard.down("Shift");
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Alt");
    await page.keyboard.up("Shift");
    const shiftAltRightSelection = await readSelection(page);
    expect(shiftAltRightSelection.isCollapsed).toBe(false);
    expect(shiftAltRightSelection.anchorOffset).toBe(await sourceOffset(page, "surface"));
    expect(shiftAltRightSelection.headOffset).toBeGreaterThan(shiftAltRightSelection.anchorOffset);

    await setSourceCaret(page, await sourceOffset(page, "hidden textarea"));
    await bridge.focus();
    await page.keyboard.press("PageDown");
    const pageDownSelection = await readSelection(page);
    expect(pageDownSelection.headOffset).toBeGreaterThan(
      await sourceOffset(page, "hidden textarea"),
    );

    await page.keyboard.press("PageUp");
    const pageUpSelection = await readSelection(page);
    expect(pageUpSelection.headOffset).toBeLessThan(pageDownSelection.headOffset);

    await setSourceCaret(page, await sourceOffset(page, "surface"));
    await bridge.focus();
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Meta");
    const documentStart = await readSelection(page);
    expect(documentStart.headOffset).toBe(0);

    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Meta");
    const documentEnd = await readSelection(page);
    expect(documentEnd.headOffset).toBe((await editorMarkdown(page)).length);

    await page.keyboard.down("Shift");
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Meta");
    await page.keyboard.up("Shift");
    const shiftDocumentStart = await readSelection(page);
    expect(shiftDocumentStart.anchorOffset).toBe((await editorMarkdown(page)).length);
    expect(shiftDocumentStart.headOffset).toBe(0);

    await page.keyboard.press("Control+A");
    const allSelection = await readSelection(page);
    expect(allSelection.isCollapsed).toBe(false);
    expect(allSelection.range.from).toBe(0);
    expect(allSelection.range.to).toBeGreaterThan(100);
  });

  test("moves keyboard caret vertically onto short and blank adjacent lines", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    await expect(surface).toContainText("Native rendered Markdown");

    const fixture = "short\n\nThis is a much much longer line\n\n";
    await insertRemoteText(page, 0, fixture);
    await setSourceCaret(page, fixture.indexOf("line") + "line".length);
    await bridge.focus();

    const before = await readSelection(page);
    await page.keyboard.press("ArrowUp");
    const blankLine = await readSelection(page);
    expect(blankLine.headOffset).toBe(fixture.indexOf("\n\n") + 1);
    expect(blankLine.headCaret.rect.y).toBeLessThan(before.headCaret.rect.y);

    await page.keyboard.press("ArrowUp");
    const shortLine = await readSelection(page);
    expect(shortLine.headOffset).toBeGreaterThanOrEqual(0);
    expect(shortLine.headOffset).toBeLessThanOrEqual("short".length);
    expect(shortLine.headCaret.rect.y).toBeLessThan(blankLine.headCaret.rect.y);
  });

  test("applies Markdown list and blockquote editing behavior through browser input", async ({
    page,
  }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    await setSourceCaret(page, await sourceOffset(page, "Native rendered Markdown"));
    await bridge.focus();
    await page.keyboard.press("Backspace");
    expect(await editorMarkdown(page)).toMatch(/^Native rendered Markdown\n\n/u);

    await setSourceCaret(page, await sourceOffset(page, "source offsets.", "end"));
    await bridge.focus();
    await page.keyboard.press("Enter");
    await expect(source).toContainText("- Selection is stored as source offsets.\n- ");

    await page.keyboard.type("continued");
    await expect(source).toContainText("- continued");

    const hiddenLine = await sourceOffset(page, "- The hidden textarea");
    await setSourceCaret(page, hiddenLine);
    await bridge.focus();
    await page.keyboard.press("Tab");
    expect(await editorMarkdown(page)).toContain("\n  - The hidden textarea");

    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    expect(await editorMarkdown(page)).toContain("\n- The hidden textarea");
    expect(await editorMarkdown(page)).not.toContain("\n  - The hidden textarea");

    const end = (await editorMarkdown(page)).length;
    await page.evaluate(
      (offset) =>
        (
          window as typeof window & {
            __premarkNativeEditor?: { insertRemote(offset: number, text: string): void };
          }
        ).__premarkNativeEditor?.insertRemote(offset, "\n\n> quoted"),
      end,
    );
    await setSourceCaret(page, (await editorMarkdown(page)).length);
    await bridge.focus();
    await page.keyboard.press("Enter");
    await expect(source).toContainText("> quoted\n> ");

    await page.keyboard.press("Enter");
    expect(await editorMarkdown(page)).toContain("> quoted\n");
    expect(await editorMarkdown(page)).not.toContain("> quoted\n> ");

    const linkLabel = await sourceOffset(page, "docs");
    await setSourceSelection(page, linkLabel, linkLabel + "docs".length);
    await bridge.focus();
    await page.keyboard.type("guide");
    expect(await editorMarkdown(page)).toContain("[guide](https://example.com)");

    const imageMarkdown =
      "\n\n![alt](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)";
    await page.evaluate(
      ({ offset, markdown }) =>
        (
          window as typeof window & {
            __premarkNativeEditor?: { insertRemote(offset: number, text: string): void };
          }
        ).__premarkNativeEditor?.insertRemote(offset, markdown),
      { offset: (await editorMarkdown(page)).length, markdown: imageMarkdown },
    );
    const imageAlt = await sourceOffset(page, "alt");
    await setSourceSelection(page, imageAlt, imageAlt + "alt".length);
    await bridge.focus();
    await page.keyboard.type("caption");
    expect(await editorMarkdown(page)).toContain("![caption](data:image/gif");
  });

  test("splits a rendered list when Enter exits an empty middle list item", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    await expect(surface).toContainText("Native rendered Markdown");

    const firstPointBefore = await editorPointForSourceText(page, "Selection is stored");
    const secondPointBefore = await editorPointForSourceText(page, "The hidden textarea");
    const normalLineGap = secondPointBefore.y - firstPointBefore.y;
    await setSourceCaret(page, await sourceOffset(page, "Selection is stored"));
    const firstContentCaret = await readSelection(page);

    await setSourceCaret(page, await sourceOffset(page, "source offsets.", "end"));
    await bridge.focus();
    await page.keyboard.press("Enter");
    const emptyListItemSelection = await readSelection(page);
    const emptyListItemCaret = await page.locator(".pne-caret").boundingBox();
    expect(emptyListItemCaret).not.toBeNull();
    expect(emptyListItemCaret!.height).toBeGreaterThan(10);
    expect(emptyListItemSelection.headCaret.rect.x).toBeCloseTo(
      firstContentCaret.headCaret.rect.x,
      0,
    );

    await page.keyboard.press("Enter");

    const markdown = await editorMarkdown(page);
    expect(markdown).toContain("- Selection is stored as source offsets.\n\n- The hidden textarea");

    const firstPointAfter = await editorPointForSourceText(page, "Selection is stored");
    const secondPointAfter = await editorPointForSourceText(page, "The hidden textarea");
    const selection = await readSelection(page);
    const blankLineCaret = await page.locator(".pne-caret").boundingBox();
    expect(blankLineCaret).not.toBeNull();
    expect(blankLineCaret!.height).toBeGreaterThan(10);
    expect(secondPointAfter.y - firstPointAfter.y).toBeGreaterThan(normalLineGap + 12);
    expect(selection.headCaret.rect.y).toBeGreaterThan(firstPointAfter.y);
    expect(selection.headCaret.rect.y).toBeLessThan(secondPointAfter.y);
  });

  test("keeps visible carets on every blank line in a multi-newline run", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");

    const fixture = "a\n\nb\n\n\n\nc\n\n";
    await page.evaluate(
      (markdown) =>
        (
          window as typeof window & {
            __premarkNativeEditor?: { insertRemote(offset: number, text: string): void };
          }
        ).__premarkNativeEditor?.insertRemote(0, markdown),
      fixture,
    );

    const renderedGaps = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>("[data-editor-surface] .pmd-block"),
      ).slice(0, 3);
      const firstLine = blocks[0]?.querySelector<HTMLElement>(".pmd-line");
      return {
        lineHeight:
          firstLine === null || firstLine === undefined
            ? Number.NaN
            : Number.parseFloat(firstLine.style.height),
        tops: blocks.map((block) => Number.parseFloat(block.style.top)),
      };
    });
    expect(renderedGaps.tops).toHaveLength(3);
    expect(renderedGaps.tops[1]! - renderedGaps.tops[0]!).toBeCloseTo(
      renderedGaps.lineHeight * 2,
      0,
    );
    expect(renderedGaps.tops[2]! - renderedGaps.tops[1]!).toBeCloseTo(
      renderedGaps.lineHeight * 4,
      0,
    );

    const offsets = [fixture.indexOf("b") + 1, 5, 6, 7, fixture.indexOf("c")];
    const carets: Array<{ x: number; y: number; height: number }> = [];
    for (const offset of offsets) {
      await setSourceCaret(page, offset);
      const selection = await readSelection(page);
      const caretBox = await page.locator(".pne-caret").boundingBox();
      expect(caretBox, `visible caret at source offset ${offset}`).not.toBeNull();
      expect(caretBox!.height).toBeGreaterThan(10);
      carets.push(selection.headCaret.rect);
    }

    const lineHeight = carets[0]!.height;
    for (let index = 1; index < carets.length; index += 1) {
      expect(carets[index]!.y, `caret y at step ${index}`).toBeCloseTo(
        carets[0]!.y + lineHeight * index,
        0,
      );
    }
  });

  test("does not over-render DOM source gaps for three newline characters", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");
    await setEditorMarkdown(page, "a\n\n\nb");

    const renderedGaps = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>("[data-editor-surface] .pmd-block"),
      );
      const firstLine = blocks[0]?.querySelector<HTMLElement>(".pmd-line");
      return {
        lineHeight:
          firstLine === null || firstLine === undefined
            ? Number.NaN
            : Number.parseFloat(firstLine.style.height),
        tops: blocks.map((block) => Number.parseFloat(block.style.top)),
      };
    });

    expect(renderedGaps.tops).toHaveLength(2);
    expect(renderedGaps.lineHeight).toBeGreaterThan(10);
    expect(renderedGaps.tops[1]! - renderedGaps.tops[0]!).toBeCloseTo(
      renderedGaps.lineHeight * 3,
      0,
    );
  });

  test("keeps visible carets on leading and trailing blank source lines", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");

    const originalLength = (await editorMarkdown(page)).length;
    const fixture = "\n\ntrail\n\n";
    await insertRemoteText(page, originalLength, fixture);

    const offsets = [
      originalLength + 1,
      originalLength + 2,
      originalLength + fixture.length - 1,
      originalLength + fixture.length,
    ];
    const carets: Array<{ x: number; y: number; height: number }> = [];
    for (const offset of offsets) {
      await setSourceCaret(page, offset);
      const selection = await readSelection(page);
      const caretBox = await page.locator(".pne-caret").boundingBox();
      expect(caretBox, `visible caret at source offset ${offset}`).not.toBeNull();
      expect(caretBox!.height).toBeGreaterThan(10);
      carets.push(selection.headCaret.rect);
    }

    const lineHeight = carets[0]!.height;
    for (let index = 1; index < carets.length; index += 1) {
      expect(carets[index]!.y, `caret y at step ${index}`).toBeCloseTo(
        carets[0]!.y + lineHeight * index,
        0,
      );
    }
  });

  test("keeps blank-only DOM documents as visible editable lines", async ({ page }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    await expect(surface).toContainText("Native rendered Markdown");
    await setEditorMarkdown(page, "\n\n");

    const carets: Array<{ y: number; height: number }> = [];
    for (const offset of [0, 1, 2]) {
      await setSourceCaret(page, offset);
      const selection = await readSelection(page);
      const caretBox = await page.locator(".pne-caret").boundingBox();
      expect(selection.headOffset).toBe(offset);
      expect(caretBox, `visible caret at source offset ${offset}`).not.toBeNull();
      expect(caretBox!.height).toBeGreaterThan(10);
      carets.push(selection.headCaret.rect);
    }

    const lineHeight = carets[0]!.height;
    expect(carets[1]!.y).toBeCloseTo(carets[0]!.y + lineHeight, 0);
    expect(carets[2]!.y).toBeCloseTo(carets[0]!.y + lineHeight * 2, 0);
  });

  test("keeps Canvas geometry gaps for every source newline in a multi-newline run", async ({
    page,
  }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    await insertCanvasTextAt(page, 0, "canvas-alpha\n\ncanvas-beta\n\n\n\ncanvas-charlie\n\n");

    const alpha = await canvasPointForText(page, "canvas-alpha");
    const beta = await canvasPointForText(page, "canvas-beta");
    const charlie = await canvasPointForText(page, "canvas-charlie");
    const lineHeight = (beta.y - alpha.y) / 2;

    expect(lineHeight).toBeGreaterThan(10);
    expect(beta.y - alpha.y).toBeCloseTo(lineHeight * 2, 0);
    expect(charlie.y - beta.y).toBeCloseTo(lineHeight * 4, 0);
  });

  test("places Canvas caret on blank source lines when clicking inter-block whitespace", async ({
    page,
  }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");

    const headingEnd = await canvasPointForText(page, "Canvas native editor", "end");
    const paragraphStart = await canvasPointForText(page, "Click text", "start");
    const markdown = await canvasEditorMarkdown(page);
    const blankOffset = markdown.indexOf("\n\n") + 1;
    await setCanvasCaret(page, blankOffset);
    const blankGeometry = await readCanvasGeometry(page);
    await canvas.click({
      position: {
        x: headingEnd.x,
        y:
          canvasNativeContentPadding +
          blankGeometry.headCaret.rect.y +
          blankGeometry.headCaret.rect.height / 2,
      },
    });

    const selection = await readCanvasSelection(page);
    const paragraphOffset = markdown.indexOf("Click text");
    expect(selection.headOffset).toBeGreaterThanOrEqual(blankOffset);
    expect(selection.headOffset).toBeLessThan(paragraphOffset);

    const geometry = await readCanvasGeometry(page);
    const caretViewportY = canvasNativeContentPadding + geometry.headCaret.rect.y;
    expect(geometry.headCaret.rect.x).toBeCloseTo(0, 0);
    expect(caretViewportY).toBeGreaterThan(headingEnd.y);
    expect(caretViewportY).toBeLessThan(paragraphStart.y);
    expect(await countCanvasCaretPixels(page)).toBeGreaterThan(10);
  });

  test("keeps blank-only Canvas documents clickable and visibly editable", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, "\n\n");

    await setCanvasCaret(page, 0);
    const initial = await readCanvasGeometry(page);
    const lineHeight = initial.headCaret.rect.height;
    expect(lineHeight).toBeGreaterThan(10);

    for (const offset of [0, 1, 2]) {
      await canvas.click({
        position: {
          x: canvasNativeContentPadding + 160,
          y: canvasNativeContentPadding + lineHeight * (offset + 0.5),
        },
      });
      const selection = await readCanvasSelection(page);
      const geometry = await readCanvasGeometry(page);
      expect(selection.headOffset).toBe(offset);
      expect(geometry.headCaret.rect.x).toBe(0);
      expect(geometry.headCaret.rect.y).toBeCloseTo(lineHeight * offset, 0);
      expect(await countCanvasCaretPixels(page)).toBeGreaterThan(10);
    }
  });

  test("keeps Canvas caret visible and clickable across long blank runs", async ({ page }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const root = page.locator(".pcne-root");
    await expect(canvas).toBeVisible();
    await expect(root).toHaveAttribute("data-fonts-ready", "1");
    await setCanvasEditorMarkdown(page, blankRunMarkdownFixture);

    const blankLines = sourceLines(blankRunMarkdownFixture)
      .filter((line) => line.text === "")
      .map((line) => line.start);
    expect(blankLines.length).toBeGreaterThan(10);

    for (const offset of blankLines) {
      await setCanvasCaret(page, offset);
      let geometry = await readCanvasGeometry(page);
      await page.evaluate(
        (scrollTop) => {
          (
            window as typeof window & {
              __premarkCanvasNativeEditor?: { scrollTo(y: number): void };
            }
          ).__premarkCanvasNativeEditor!.scrollTo(scrollTop);
        },
        Math.max(0, geometry.headCaret.rect.y - 120),
      );
      geometry = await readCanvasGeometry(page);
      const render = await readCanvasRenderDebug(page);
      await canvas.click({
        position: {
          x: canvasNativeContentPadding + 260,
          y:
            canvasNativeContentPadding +
            geometry.headCaret.rect.y +
            -render.viewport.scrollTop +
            geometry.headCaret.rect.height / 2,
        },
      });

      const selection = await readCanvasSelection(page);
      const afterClickGeometry = await readCanvasGeometry(page);
      expect(selection.headOffset, `blank source offset ${offset}`).toBe(offset);
      expect(afterClickGeometry.headCaret.rect.y, `blank source offset ${offset}`).toBeCloseTo(
        geometry.headCaret.rect.y,
        0,
      );
      expect(await countCanvasCaretPixels(page)).toBeGreaterThan(10);
    }
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

  test("edits rendered Markdown controls through source-exact input, paste, delete and Enter", async ({
    page,
  }) => {
    await page.goto(storyUrl);

    const surface = page.locator("[data-editor-surface]");
    const bridge = page.locator("[data-input-bridge]");
    const source = page.locator("[data-debug-source]");
    await expect(surface).toContainText("Native rendered Markdown");

    const strongMiddle = (await sourceOffset(page, "**bold text**")) + 1;
    await setSourceCaret(page, strongMiddle);
    await expect(surface).toContainText("**bold text**");
    await bridge.focus();
    await page.keyboard.type("!");
    await expect(source).toContainText("*!*bold text**");

    await page.keyboard.press("Backspace");
    await expect(source).toContainText("**bold text**");
    await expect(source).not.toContainText("*!*bold text**");

    const urlMiddle = (await sourceOffset(page, "https://example.com")) + "https".length;
    await setSourceCaret(page, urlMiddle);
    await bridge.focus();
    await expect(surface).toContainText("[docs](https://example.com)");
    await pasteMarkdown(page, "+md");
    await expect(source).toContainText("[docs](https+md://example.com)");

    await page.keyboard.press("Backspace");
    await expect(source).toContainText("[docs](https+m://example.com)");

    await page.keyboard.press("Enter");
    expect(await editorMarkdown(page)).toContain("[docs](https+m\n://example.com)");

    const boldContent = await sourceOffset(page, "bold text");
    await setSourceSelection(page, boldContent, boldContent + "bold text".length);
    await bridge.focus();
    await page.keyboard.type("strong");
    await expect(source).toContainText("**strong**");
  });

  test("edits Canvas Markdown controls through the same source-exact input path", async ({
    page,
  }) => {
    await page.goto(canvasNativeStoryUrl);

    const canvas = page.locator("[data-canvas-native-editor]");
    const bridge = page.locator("[data-canvas-input-bridge]");
    await expect(canvas).toBeVisible();

    const strongMiddle = (await canvasSourceOffset(page, "**bold text**")) + 1;
    await setCanvasCaret(page, strongMiddle);
    await bridge.focus();
    await page.keyboard.type("!");
    expect(await canvasEditorMarkdown(page)).toContain("*!*bold text**");

    await page.keyboard.press("Backspace");
    expect(await canvasEditorMarkdown(page)).toContain("**bold text**");

    const urlMiddle = (await canvasSourceOffset(page, "https://example.com")) + "https".length;
    await setCanvasCaret(page, urlMiddle);
    await bridge.focus();
    await pasteCanvasMarkdown(page, "+md");
    expect(await canvasEditorMarkdown(page)).toContain("[docs](https+md://example.com)");

    await page.keyboard.press("Enter");
    expect(await canvasEditorMarkdown(page)).toContain("[docs](https+md\n://example.com)");
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
