/// <reference types="node" />

import { expect, test, type Page } from "@playwright/test";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const appleScriptTimeoutMs = Number.parseInt(
  process.env.PREMARK_MACOS_IME_OSASCRIPT_TIMEOUT_MS ?? "10_000".replace("_", ""),
  10,
);

interface CanvasEditorImeEvent {
  readonly type: string;
  readonly data: string | null;
  readonly text: string;
}

interface MacImeScenario {
  readonly text: string;
  readonly expected: string;
  readonly commitKeyCodes: number[];
  readonly cancelKeyCodes: number[];
}

test.describe.configure({ mode: "serial" });

test.skip(process.platform !== "darwin", "Real OS IME smoke tests require macOS.");
test.skip(
  process.env.PREMARK_RUN_MACOS_IME !== "1",
  "Set PREMARK_RUN_MACOS_IME=1 after granting Accessibility permission and installing the target IME.",
);

let restoreInputSourceId: string | null = null;

test.beforeAll(async () => {
  await preflightMacAutomation();
  restoreInputSourceId = await currentInputSourceId().catch(() => null);
  await maybeSelectInputSource();
});

test.afterAll(async () => {
  if (restoreInputSourceId !== null && process.env.PREMARK_MACOS_IME_RESTORE_SOURCE !== "0") {
    await selectInputSourceWithSwift(restoreInputSourceId).catch(() => undefined);
  }
});

test("commits text through the active macOS input source", async ({ page }) => {
  const scenario = readScenario();
  await openSelectedImeTarget(page);

  const hostBefore = await activeOverlayHostId(page);
  await typeAndCommitIme(page, scenario);

  await expectActiveText(page, scenario.expected);
  expect(await activeOverlayHostId(page)).toBe(hostBefore);

  await page.locator("[data-commit-overlay]").click();
  await expect(page.locator("[data-canvas-surface]")).toContainText(scenario.expected);
  await expectCompositionLifecycle(page, scenario.expected);
});

test("commits text into an empty overlay", async ({ page }) => {
  test.fixme(
    true,
    "Real macOS Pinyin composition into a truly empty CodeMirror 6 document currently trips CodeMirror's Chromium composition/tile path. Non-empty selected replacement is the supported workaround until this is isolated upstream or guarded with an editor placeholder.",
  );

  const scenario = readScenario();
  await openClearedImeTarget(page);

  const hostBefore = await activeOverlayHostId(page);
  await typeAndCommitIme(page, scenario);

  await expectActiveText(page, scenario.expected);
  expect(await activeOverlayHostId(page)).toBe(hostBefore);
  await expectCompositionLifecycle(page, scenario.expected);
});

test("replaces a selected range with an IME commit", async ({ page }) => {
  const scenario = readScenario();
  await openSelectedImeTarget(page);

  await page.keyboard.insertText("seed text");
  await page.keyboard.press("Meta+A");
  await typeAndCommitIme(page, scenario);

  await expectActiveText(page, scenario.expected);
  await expectCompositionLifecycle(page, scenario.expected);
});

test("cancels preedit text without leaking raw input or committed text", async ({ page }) => {
  const scenario = readScenario();
  await openSelectedImeTarget(page);

  await typeImePreedit(page, scenario);
  await runAppleScript(buildKeyCodeScript(scenario.cancelKeyCodes));

  await expect.poll(async () => (await activeText(page))?.trim(), { timeout: 15_000 }).toBe("");
  const events = await imeEvents(page);
  expect(events.some((event) => event.type === "compositionstart")).toBe(true);
  expect(events.some((event) => event.type === "compositionend")).toBe(true);
  expect(events.some((event) => event.text.includes(scenario.expected))).toBe(false);
});

test("keeps the overlay mounted if canvas work happens during composition", async ({ page }) => {
  const scenario = readScenario();
  await openSelectedImeTarget(page);

  const hostBefore = await activeOverlayHostId(page);
  await typeImePreedit(page, scenario);
  await page.evaluate(() => {
    (
      window as unknown as {
        __premarkCanvasEditor?: {
          rerender: () => void;
          streamOtherDocument: () => void;
        };
      }
    ).__premarkCanvasEditor?.rerender();
    (
      window as unknown as {
        __premarkCanvasEditor?: {
          streamOtherDocument: () => void;
        };
      }
    ).__premarkCanvasEditor?.streamOtherDocument();
  });
  expect(await activeOverlayHostId(page)).toBe(hostBefore);

  await runAppleScript(buildKeyCodeScript(scenario.commitKeyCodes));
  await expectActiveText(page, scenario.expected);
  expect(await activeOverlayHostId(page)).toBe(hostBefore);
  await expect(page.locator("[data-other-doc-surface]")).toContainText("cross document chunk");
});

test("keeps CodeMirror undo and redo valid after an IME commit", async ({ page }) => {
  const scenario = readScenario();
  await openSelectedImeTarget(page);
  const original = ((await activeText(page)) ?? "").trim();

  await typeAndCommitIme(page, scenario);
  await expectActiveText(page, scenario.expected);

  await page.keyboard.press("Meta+Z");
  await expect
    .poll(async () => (await activeText(page))?.trim(), { timeout: 15_000 })
    .toBe(original);
  for (const shortcut of ["Meta+Shift+Z", "Meta+Y", "Control+Y", "Control+Shift+Z"]) {
    await page.keyboard.press(shortcut);
    if ((await activeText(page))?.trim() === scenario.expected) {
      break;
    }
  }
  await expectActiveText(page, scenario.expected);
});

async function typeAndCommitIme(page: Page, scenario: MacImeScenario): Promise<void> {
  await typeImePreedit(page, scenario);
  await runAppleScript(buildKeyCodeScript(scenario.commitKeyCodes));
}

async function typeImePreedit(page: Page, scenario: MacImeScenario): Promise<void> {
  await clearImeEvents(page);
  await page.bringToFront();
  await page
    .locator(".editable-overlay-host .cm-content")
    .evaluate((element) => (element as HTMLElement).focus());
  await runAppleScript(buildTextScript(scenario.text));
}

function readScenario(): MacImeScenario {
  const preset = process.env.PREMARK_MACOS_IME_SCENARIO ?? "pinyin";
  if (process.env.PREMARK_MACOS_IME_TEXT !== undefined) {
    return {
      text: process.env.PREMARK_MACOS_IME_TEXT,
      expected: requireEnv("PREMARK_MACOS_IME_EXPECTED"),
      commitKeyCodes: readKeyCodes(
        process.env.PREMARK_MACOS_IME_COMMIT_KEY_CODES ??
          process.env.PREMARK_MACOS_IME_KEY_CODES ??
          "",
      ),
      cancelKeyCodes: readKeyCodes(process.env.PREMARK_MACOS_IME_CANCEL_KEY_CODES ?? "53"),
    };
  }

  if (preset === "japanese") {
    return {
      text: "shi",
      expected: "し",
      commitKeyCodes: [36],
      cancelKeyCodes: [53],
    };
  }

  if (preset === "pinyin") {
    return {
      text: "nihao",
      expected: "你好",
      commitKeyCodes: [49],
      cancelKeyCodes: [53],
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

async function preflightMacAutomation(): Promise<void> {
  await runAppleScript(
    'tell application "System Events" to return name of first process whose frontmost is true',
    5_000,
  );
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
  if (imSelect !== null) {
    await execFileAsync(imSelect, [inputSourceId]);
    return;
  }

  await selectInputSourceWithSwift(inputSourceId);
  if (!(await isSelectedInputSource(inputSourceId))) {
    await cycleInputSourceUntil(inputSourceId);
  }
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

async function currentInputSourceId(): Promise<string> {
  const source = [
    "import Carbon",
    "let source = TISCopyCurrentKeyboardInputSource().takeRetainedValue()",
    "let pointer = TISGetInputSourceProperty(source, kTISPropertyInputSourceID)!",
    "let value = Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String",
    "print(value)",
  ].join("\n");
  const { stdout } = await execFileAsync("swift", ["-e", source], {
    timeout: 15_000,
  });
  return stdout.trim();
}

async function selectInputSourceWithSwift(inputSourceId: string): Promise<void> {
  const source = [
    "import Carbon",
    `let id = ${JSON.stringify(inputSourceId)}`,
    "let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary",
    "let list = TISCreateInputSourceList(filter, false).takeRetainedValue() as NSArray",
    'guard let source = list.firstObject else { print("missing input source \\(id)"); exit(2) }',
    "let status = TISSelectInputSource(source as! TISInputSource)",
    'guard status == noErr else { print("failed to select \\(id): \\(status)"); exit(Int32(status)) }',
  ].join("\n");
  await execFileAsync("swift", ["-e", source], {
    timeout: 15_000,
  });
}

async function isSelectedInputSource(inputSourceId: string): Promise<boolean> {
  const plist = `${process.env.HOME ?? ""}/Library/Preferences/com.apple.HIToolbox.plist`;
  if (plist.startsWith("/Library") || plist.length === 0) {
    return false;
  }
  try {
    const { stdout } = await execFileAsync(
      "defaults",
      ["read", plist, "AppleSelectedInputSources"],
      {
        timeout: 5_000,
      },
    );
    return stdout.includes(inputSourceId);
  } catch {
    return false;
  }
}

async function cycleInputSourceUntil(inputSourceId: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isSelectedInputSource(inputSourceId)) {
      return;
    }
    await runAppleScript('tell application "System Events" to key code 49 using {control down}');
  }
  throw new Error(
    `Unable to select macOS input source ${inputSourceId}. Set PREMARK_MACOS_IME_SWITCH_COMMAND for this machine.`,
  );
}

function buildTextScript(text: string): string {
  const lines = ['tell application "System Events"'];
  for (const character of text) {
    lines.push(`  keystroke "${escapeAppleScriptString(character)}"`);
    lines.push("  delay 0.08");
  }
  lines.push("end tell");
  return lines.join("\n");
}

function buildKeyCodeScript(keyCodes: number[]): string {
  const lines = ['tell application "System Events"'];
  for (const keyCode of keyCodes) {
    lines.push(`  key code ${keyCode}`);
    lines.push("  delay 0.2");
  }
  lines.push("end tell");
  return lines.join("\n");
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function runAppleScript(script: string, timeout = appleScriptTimeoutMs): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", script], {
      timeout,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `macOS IME automation failed. Grant Accessibility permission to the terminal/editor running Playwright, ensure the browser is frontmost, and verify the target input source is active.\n${message}`,
    );
  }
}

async function openSelectedImeTarget(page: Page): Promise<void> {
  await page.goto("/?mode=canvas-editor");
  await expect(page.locator("[data-canvas-editor-ready='true']")).toBeVisible();
  await page
    .locator("[data-canvas-surface] .pmd-block")
    .filter({ hasText: "Workspace search can return rendered Markdown snippets" })
    .click();
  await expect(page.locator(".editable-overlay-host")).toBeVisible();
  await page.keyboard.press("Meta+A");
  await expect.poll(() => activeText(page)).not.toBe("");
}

async function openClearedImeTarget(page: Page): Promise<void> {
  await openSelectedImeTarget(page);
  await page.keyboard.press("Backspace");
  await expect.poll(async () => (await activeText(page))?.trim()).toBe("");
}

async function expectActiveText(page: Page, expected: string): Promise<void> {
  await expect
    .poll(async () => (await activeText(page))?.trim(), { timeout: 15_000 })
    .toBe(expected);
}

async function expectCompositionLifecycle(page: Page, expectedText: string): Promise<void> {
  const events = await imeEvents(page);
  expect(events.some((event) => event.type === "compositionstart")).toBe(true);
  expect(events.some((event) => event.type === "compositionend")).toBe(true);
  expect(events.some((event) => event.text.includes(expectedText))).toBe(true);
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
