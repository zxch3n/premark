import { expect, test, type Page } from "@playwright/test";

declare const process: {
  readonly platform: string;
};

interface CanvasEditorImeEvent {
  readonly type: string;
  readonly data: string | null;
  readonly inputType: string | null;
  readonly isComposing: boolean;
  readonly text: string;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();
});

test("records synthetic composition lifecycle without replacing the overlay", async ({ page }) => {
  await openImeTarget(page);
  await clearImeEvents(page);

  const hostBefore = await activeOverlayHostId(page);
  await dispatchCompositionProbe(page, "compositionstart", "");
  await dispatchCompositionProbe(page, "compositionupdate", "ni");

  await page.locator("[data-zoom]").fill("1.25");

  expect(await activeOverlayHostId(page)).toBe(hostBefore);

  await page.keyboard.insertText("你好");
  await dispatchCompositionProbe(page, "compositionend", "你好");
  await page.locator("[data-commit-overlay]").click();

  await expect(page.locator("[data-canvas-surface]")).toContainText("你好");

  const events = await imeEvents(page);
  expect(events.map((event) => event.type)).toEqual(
    expect.arrayContaining(["compositionstart", "compositionupdate", "input", "compositionend"]),
  );
  expect(events.find((event) => event.type === "compositionupdate")?.data).toBe("ni");
  expect(events.at(-1)?.text).toContain("你好");
});

test("keeps composition cancellation isolated from committed Markdown", async ({ page }) => {
  await openImeTarget(page);
  await clearImeEvents(page);

  const before = await markdown(page);
  await dispatchCompositionProbe(page, "compositionstart", "");
  await dispatchCompositionProbe(page, "compositionupdate", "temporary");
  await dispatchCompositionProbe(page, "compositionend", "");
  await page.locator("[data-cancel-overlay]").click();

  expect(await markdown(page)).toBe(before);
  const events = await imeEvents(page);
  expect(events.map((event) => event.type)).toEqual(
    expect.arrayContaining(["compositionstart", "compositionupdate", "compositionend"]),
  );
});

async function openImeTarget(page: Page): Promise<void> {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();
  await expect(page.locator(".editable-overlay-host")).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
}

async function dispatchCompositionProbe(
  page: Page,
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data: string,
): Promise<void> {
  await page.locator(".editable-overlay-host .cm-content").evaluate(
    (element, payload) => {
      element.dispatchEvent(
        new CompositionEvent(payload.type, {
          bubbles: true,
          data: payload.data,
        }),
      );
    },
    { type, data },
  );
}

async function activeOverlayHostId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __premarkCanvasEditor?: {
            activeOverlayHostId: () => string | null;
          };
        }
      ).__premarkCanvasEditor?.activeOverlayHostId() ?? null,
  );
}

async function clearImeEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as {
        __premarkCanvasEditor?: {
          clearImeEvents: () => void;
        };
      }
    ).__premarkCanvasEditor?.clearImeEvents();
  });
}

async function imeEvents(page: Page): Promise<CanvasEditorImeEvent[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __premarkCanvasEditor?: {
            imeEvents: () => CanvasEditorImeEvent[];
          };
        }
      ).__premarkCanvasEditor?.imeEvents() ?? [],
  );
}

async function markdown(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __premarkCanvasEditor?: {
            markdown: () => string;
          };
        }
      ).__premarkCanvasEditor?.markdown() ?? "",
  );
}
