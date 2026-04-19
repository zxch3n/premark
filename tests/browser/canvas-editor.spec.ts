import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();
});

test("opens an editable overlay from a rendered block and commits changes", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();

  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();
  await expect(page.locator("[data-commit-overlay]")).toBeEnabled();

  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("Edited paragraph with **bold** rendered text.");
  await page.locator("[data-commit-overlay]").click();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-canvas-surface]")).toContainText("Edited paragraph with");
  await expect(page.locator("[data-canvas-surface]")).toContainText("bold");
  await expect(page.locator("[data-canvas-surface]")).toContainText("rendered text.");
});

test("supports keyboard typing, paste, undo and redo inside the overlay", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();

  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("Typed");
  await page.keyboard.insertText(" pasted");
  await expect(overlay).toContainText("Typed pasted");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(overlay).not.toContainText("Typed pasted");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z");
  for (const shortcut of ["Meta+Y", "Meta+Shift+Z", "Control+Y", "Control+Shift+Z"]) {
    if ((await overlay.textContent())?.includes("Typed pasted") === true) {
      break;
    }
    await page.keyboard.press(shortcut);
  }
  await expect(overlay).toContainText("Typed pasted");

  await page.locator("[data-commit-overlay]").click();
  await expect(page.locator("[data-canvas-surface]")).toContainText("Typed pasted");
});

test("keeps the overlay anchored when zoom changes", async ({ page }) => {
  const block = page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Click a rendered block to edit it in-place" });
  await block.click();

  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();
  const before = await relativeTopLeft(page);

  await page.locator("[data-zoom]").fill("1.4");
  const after = await relativeTopLeft(page);

  expect(Math.abs(after.left - before.left * 1.4)).toBeLessThan(2);
  expect(Math.abs(after.top - before.top * 1.4)).toBeLessThan(2);

  const beforeScroll = await relativeTopLeft(page);
  await page.locator("[data-canvas-viewport]").evaluate((element) => {
    element.scrollTop = 120;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const afterScroll = await relativeTopLeft(page);
  expect(Math.abs(afterScroll.left - beforeScroll.left)).toBeLessThan(1);
  expect(Math.abs(afterScroll.top - beforeScroll.top)).toBeLessThan(1);
});

test("does not replace the overlay host during composition", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "CodeMirror owns input" })
    .click();

  const sameHost = await page.evaluate(() => {
    const host = document.querySelector(".editable-overlay-host");
    const editor = document.querySelector(".editable-overlay-host .cm-content");
    editor?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    (
      window as unknown as {
        __premarkCanvasEditor?: {
          activeBlockIndex: () => number | null;
        };
      }
    ).__premarkCanvasEditor?.activeBlockIndex();
    editor?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    return host === document.querySelector(".editable-overlay-host");
  });

  expect(sameHost).toBe(true);
});

test("keeps simulated CJK composition text through commit", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();
  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();

  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.locator(".editable-overlay-host .cm-content").evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  await page.keyboard.insertText("中文かな한국어");
  await page.locator(".editable-overlay-host .cm-content").evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await page.locator("[data-commit-overlay]").click();

  await expect(page.locator("[data-canvas-surface]")).toContainText("中文かな한국어");
});

test("streams into another block while an overlay stays mounted", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Click a rendered block to edit it in-place" })
    .click();
  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();

  await page.locator("[data-stream-ai]").click();

  await expect(overlay).toBeVisible();
  await expect(page.locator("[data-canvas-surface]")).toContainText("streamed chunk");
  await expect(page.locator("[data-canvas-surface] [data-streaming-block]")).toBeVisible();
});

test("streams into another document while an overlay stays mounted", async ({ page }) => {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Click a rendered block to edit it in-place" })
    .click();
  const overlay = page.locator(".editable-overlay-host");
  await expect(overlay).toBeVisible();

  await page.locator("[data-stream-other]").click();

  await expect(overlay).toBeVisible();
  await expect(page.locator("[data-other-doc-surface]")).toContainText("cross document chunk");
});

async function relativeTopLeft(page: import("@playwright/test").Page): Promise<{
  top: number;
  left: number;
}> {
  return page.evaluate(() => {
    const layer = document.querySelector("[data-canvas-layer]")!.getBoundingClientRect();
    const overlay = document.querySelector(".editable-overlay-host")!.getBoundingClientRect();
    return {
      top: overlay.top - layer.top,
      left: overlay.left - layer.left,
    };
  });
}
