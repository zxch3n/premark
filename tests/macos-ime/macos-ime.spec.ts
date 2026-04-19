/// <reference types="node" />

import { expect, test, type Page } from "@playwright/test";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface CanvasEditorImeEvent {
  readonly type: string;
  readonly data: string | null;
  readonly text: string;
}

interface MacImeScenario {
  readonly text: string;
  readonly expected: string;
  readonly keyCodes: number[];
}

test.describe.configure({ mode: "serial" });

test.skip(process.platform !== "darwin", "Real OS IME smoke tests require macOS.");
test.skip(
  process.env.PREMARK_RUN_MACOS_IME !== "1",
  "Set PREMARK_RUN_MACOS_IME=1 after granting Accessibility permission and installing the target IME.",
);

test("commits text through the active macOS input source", async ({ page }) => {
  const scenario = readScenario();
  await maybeSelectInputSource();

  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();
  await openEmptyImeTarget(page);
  await clearImeEvents(page);
  await page.bringToFront();
  await page.locator(".editable-overlay-host .cm-content").click();

  const hostBefore = await activeOverlayHostId(page);
  await runAppleScript(buildTypingScript(scenario));

  await expect
    .poll(async () => (await activeText(page))?.trim(), { timeout: 15_000 })
    .toBe(scenario.expected);
  expect(await activeOverlayHostId(page)).toBe(hostBefore);

  await page.locator("[data-commit-overlay]").click();
  await expect(page.locator("[data-canvas-surface]")).toContainText(scenario.expected);

  const events = await imeEvents(page);
  expect(events.some((event) => event.type === "compositionstart")).toBe(true);
  expect(events.some((event) => event.type === "compositionend")).toBe(true);
  expect(events.some((event) => event.text.includes(scenario.expected))).toBe(true);
});

function readScenario(): MacImeScenario {
  const preset = process.env.PREMARK_MACOS_IME_SCENARIO ?? "pinyin";
  if (process.env.PREMARK_MACOS_IME_TEXT !== undefined) {
    return {
      text: process.env.PREMARK_MACOS_IME_TEXT,
      expected: requireEnv("PREMARK_MACOS_IME_EXPECTED"),
      keyCodes: readKeyCodes(process.env.PREMARK_MACOS_IME_KEY_CODES ?? ""),
    };
  }

  if (preset === "japanese") {
    return {
      text: "shi",
      expected: "し",
      keyCodes: [36],
    };
  }

  if (preset === "pinyin") {
    return {
      text: "nihao",
      expected: "你好",
      keyCodes: [49],
    };
  }

  throw new Error(
    `Unknown PREMARK_MACOS_IME_SCENARIO=${preset}. Use pinyin, japanese, or PREMARK_MACOS_IME_TEXT/PREMARK_MACOS_IME_EXPECTED.`,
  );
}

function readKeyCodes(value: string): number[] {
  if (value.trim().length === 0) {
    return [];
  }
  return value.split(",").map((entry) => Number.parseInt(entry.trim(), 10));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for a custom macOS IME scenario.`);
  }
  return value;
}

async function maybeSelectInputSource(): Promise<void> {
  if (process.env.PREMARK_MACOS_IME_SWITCH_COMMAND !== undefined) {
    await execAsync(process.env.PREMARK_MACOS_IME_SWITCH_COMMAND);
    return;
  }

  const inputSourceId = process.env.PREMARK_MACOS_IME_INPUT_SOURCE_ID;
  if (inputSourceId === undefined || inputSourceId.length === 0) {
    return;
  }

  const imSelect = await commandPath("im-select");
  if (imSelect === null) {
    throw new Error(
      "PREMARK_MACOS_IME_INPUT_SOURCE_ID was set, but `im-select` is not available. Install im-select or provide PREMARK_MACOS_IME_SWITCH_COMMAND.",
    );
  }

  await execFileAsync(imSelect, [inputSourceId]);
}

async function commandPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("zsh", ["-lc", `command -v ${command}`]);
    const path = stdout.trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

function buildTypingScript(scenario: MacImeScenario): string {
  const lines = [
    'tell application "System Events"',
    `  keystroke "${escapeAppleScriptString(scenario.text)}"`,
    "  delay 0.2",
  ];
  for (const keyCode of scenario.keyCodes) {
    lines.push(`  key code ${keyCode}`);
    lines.push("  delay 0.2");
  }
  lines.push("end tell");
  return lines.join("\n");
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function runAppleScript(script: string): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", script], {
      timeout: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `macOS IME automation failed. Grant Accessibility permission to the terminal/editor running Playwright, ensure the browser is frontmost, and verify the target input source is active.\n${message}`,
    );
  }
}

async function openEmptyImeTarget(page: Page): Promise<void> {
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();
  await expect(page.locator(".editable-overlay-host")).toBeVisible();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");
  await expect.poll(() => activeText(page)).toBe("");
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
