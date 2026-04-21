import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outRoot = join(root, "test-results/real-interactions");
const osInputScript = join(root, "tests/macos-ime/os-input.swift");
const inputSourceScript = join(root, "tests/macos-ime/input-source.swift");
const strict = process.env.PREMARK_REAL_INTERACTIONS_STRICT === "1";
const preflight =
  process.env.PREMARK_REAL_INTERACTIONS_PREFLIGHT === "1" || process.argv.includes("--preflight");
const serverPort = Number(process.env.PREMARK_REAL_INTERACTIONS_STORYBOOK_PORT ?? 6126);
const baseURL = `http://127.0.0.1:${serverPort}`;
const nativeStoryUrl = `${baseURL}/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story`;
const canvasStoryUrl = `${baseURL}/iframe.html?id=editing-premark-canvas-native-editor--interactive-canvas-native-editor&viewMode=story`;
const targets = parseTargets();

mkdirSync(outRoot, { recursive: true });

class SkipError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SkipError";
    this.details = details;
  }
}

function parseTargets() {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const raw =
    targetArg?.slice("--target=".length) ?? process.env.PREMARK_REAL_INTERACTIONS_TARGET ?? "all";
  if (raw === "all") {
    return ["chrome", "safari"];
  }
  return raw
    .split(",")
    .map((target) => target.trim())
    .filter((target) => target.length > 0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error === undefined ? undefined : String(result.error),
  };
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function osascript(script) {
  return runRequired("osascript", ["-e", script]);
}

function appleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function swiftOsInput(...args) {
  return runRequired("swift", [osInputScript, ...args]);
}

function swiftInputSource(...args) {
  return runRequired("swift", [inputSourceScript, ...args]);
}

function pbcopy(text) {
  const result = spawnSync("pbcopy", {
    input: text,
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`pbcopy failed: ${result.stderr}`);
  }
}

function pbpaste() {
  return runRequired("pbpaste", []);
}

function captureScreen(target, name) {
  const outDir = join(outRoot, target);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${name}.png`);
  const result = run("screencapture", ["-x", path]);
  if (result.status !== 0) {
    writeFileSync(
      join(outDir, `${name}.txt`),
      `screencapture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n`,
    );
    return null;
  }
  return path;
}

function nsWorkspaceFrontmostApplication() {
  const result = run("swift", [
    "-e",
    `import AppKit
let app = NSWorkspace.shared.frontmostApplication
print([(app?.localizedName ?? ""), (app?.bundleIdentifier ?? ""), String(app?.processIdentifier ?? -1)].joined(separator: "\\t"))`,
  ]);
  if (result.status !== 0) {
    return {
      error: result.stderr || result.stdout || `swift exited ${result.status}`,
    };
  }
  const [name = "", bundleIdentifier = "", processIdentifier = ""] = result.stdout.split("\t");
  return {
    name,
    bundleIdentifier,
    processIdentifier: Number.parseInt(processIdentifier, 10),
  };
}

function cgSessionSnapshot() {
  const result = run("swift", [
    "-e",
    `import CoreGraphics
import Foundation
let session = (CGSessionCopyCurrentDictionary() as? [String: Any]) ?? [:]
let data = try JSONSerialization.data(withJSONObject: session, options: [.sortedKeys])
print(String(data: data, encoding: .utf8) ?? "{}")`,
  ]);
  if (result.status !== 0) {
    return {
      error: result.stderr || result.stdout || `swift exited ${result.status}`,
    };
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (error) {
    return {
      error: `failed to parse CGSession JSON: ${String(error)}`,
      raw: result.stdout,
    };
  }
}

function foregroundSnapshot() {
  return {
    systemEventsFrontmost: run("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]).stdout,
    nsWorkspaceFrontmost: nsWorkspaceFrontmostApplication(),
    cgSession: cgSessionSnapshot(),
  };
}

function isSessionLocked(snapshot = foregroundSnapshot()) {
  const value = snapshot.cgSession?.CGSSessionScreenIsLocked;
  return value === true || value === 1;
}

function activateApplication(processName) {
  if (processName.length === 0) return;
  osascript(`
    tell application ${appleScriptString(processName)} to activate
    tell application "System Events"
      set frontmost of first application process whose name is ${appleScriptString(processName)} to true
    end tell
  `);
}

function frontmostProcessName() {
  return osascript(
    'tell application "System Events" to get name of first application process whose frontmost is true',
  );
}

function sendText(processName, text) {
  activateApplication(processName);
  osascript(`
    tell application "System Events"
      delay 0.15
      keystroke ${appleScriptString(text)}
    end tell
  `);
}

function appleScriptModifierList(modifiers) {
  const normalized = modifiers
    .split(",")
    .map((modifier) => modifier.trim().toLowerCase())
    .filter((modifier) => modifier.length > 0 && modifier !== "none")
    .map((modifier) => {
      switch (modifier) {
        case "command":
        case "cmd":
        case "meta":
          return "command down";
        case "shift":
          return "shift down";
        case "option":
        case "alt":
          return "option down";
        case "control":
        case "ctrl":
          return "control down";
        default:
          throw new Error(`Unknown modifier: ${modifier}`);
      }
    });
  return `{${normalized.join(", ")}}`;
}

function sendShortcut(processName, modifiers, keyCode) {
  activateApplication(processName);
  osascript(`
    tell application "System Events"
      delay 0.15
      key code ${keyCode} using ${appleScriptModifierList(modifiers)}
    end tell
  `);
}

function sendKeyCode(processName, keyCode) {
  activateApplication(processName);
  osascript(`
    tell application "System Events"
      delay 0.15
      key code ${keyCode}
    end tell
  `);
}

function hidClick(point, clickCount = 1) {
  swiftOsInput(
    "hid-click",
    String(Math.round(point.x)),
    String(Math.round(point.y)),
    String(clickCount),
  );
}

function hidDrag(from, to) {
  swiftOsInput(
    "hid-drag",
    String(Math.round(from.x)),
    String(Math.round(from.y)),
    String(Math.round(to.x)),
    String(Math.round(to.y)),
    "14",
  );
}

function startStaticServer() {
  const server = spawn(
    "python3",
    [
      "-m",
      "http.server",
      String(serverPort),
      "--bind",
      "127.0.0.1",
      "--directory",
      "storybook-static",
    ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    process.stdout.write(`[real-interactions-server] ${chunk}`);
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(`[real-interactions-server] ${chunk}`);
  });
  return server;
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok || response.status < 500) return;
    } catch {
      // Retry below.
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for Storybook static server on ${baseURL}`);
}

async function waitFor(adapter, body, timeoutMs = 8_000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await adapter.evaluate(body);
    if (lastValue) return lastValue;
    await sleep(160);
  }
  throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(lastValue)}`);
}

function writeReport(target, report) {
  const outDir = join(outRoot, target);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "real-interactions.json"), `${JSON.stringify(report, null, 2)}\n`);
}

function writeSkip(target, message, details = {}) {
  const outDir = join(outRoot, target);
  mkdirSync(outDir, { recursive: true });
  const report = {
    target,
    skipped: true,
    message,
    details,
  };
  writeFileSync(join(outDir, "real-interactions.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, "real-interactions-skip.txt"), `${message}\n`);
  if (strict) {
    throw new Error(message);
  }
  console.log(`[real-interactions:${target}] skipped: ${message}`);
}

function expressionFromBody(body) {
  return `(() => {
${body}
})()`;
}

async function evaluateExpressionInPage(page, body) {
  const expression = expressionFromBody(body);
  return page.evaluate((source) => {
    const runExpression = globalThis.eval;
    return runExpression(source);
  }, expression);
}

class ChromeAdapter {
  constructor() {
    this.target = "chrome";
    this.processName = "";
    this.browser = null;
    this.page = null;
  }

  async start() {
    const channel = process.env.PREMARK_REAL_INTERACTIONS_BROWSER_CHANNEL ?? "bundled";
    if (channel === "bundled") {
      this.browser = await chromium.launch({ headless: false });
    } else {
      this.browser = await chromium.launch({ channel, headless: false });
    }
    this.page = await this.browser.newPage({ viewport: { width: 1180, height: 760 } });
    const processNames = osascript(
      'tell application "System Events" to get name of every process whose background only is false',
    );
    const candidates =
      channel === "chrome"
        ? ["Google Chrome", "Google Chrome for Testing", "Chromium"]
        : ["Google Chrome for Testing", "Chromium", "Google Chrome"];
    this.processName = candidates.find((candidate) => processNames.includes(candidate)) ?? "";
    if (this.processName.length === 0) {
      throw new SkipError("could not find a foregroundable Chrome-based browser process", {
        processNames,
      });
    }
  }

  async open(url) {
    await this.page.goto(url);
  }

  async evaluate(body) {
    return evaluateExpressionInPage(this.page, body);
  }

  async pageScreenshot(name) {
    const outDir = join(outRoot, this.target);
    mkdirSync(outDir, { recursive: true });
    await this.page.screenshot({ path: join(outDir, `${name}.png`) });
  }

  async close() {
    await this.browser?.close();
  }
}

class SafariAdapter {
  constructor() {
    this.target = "safari";
    this.processName = "Safari";
  }

  async start() {
    if (!existsSync("/Applications/Safari.app")) {
      throw new SkipError("Safari.app was not found in /Applications");
    }
    osascript('tell application "Safari" to activate');
  }

  async open(url) {
    osascript(`
      tell application "Safari"
        activate
        if (count of windows) is 0 then make new document
        set URL of current tab of front window to ${appleScriptString(url)}
      end tell
    `);
    await sleep(500);
  }

  async evaluate(body) {
    const expression = `(() => {
      const value = ${expressionFromBody(body)};
      return JSON.stringify(value === undefined ? null : value);
    })()`;
    const encoded = Buffer.from(expression, "utf8").toString("base64");
    let raw;
    try {
      raw = osascript(`
        tell application "Safari"
          do JavaScript "eval(atob('${encoded}'))" in current tab of front window
        end tell
      `);
    } catch (error) {
      throw new SkipError(
        "Safari JavaScript from Apple Events is not available; enable Safari Develop > Allow JavaScript from Apple Events",
        { error: String(error) },
      );
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Failed to parse Safari JavaScript result: ${raw}`, { cause: error });
    }
  }

  async pageScreenshot(name) {
    captureScreen(this.target, name);
  }

  async close() {
    // Keep the user's Safari app open; tests only add/reuse a foreground tab.
  }
}

function installEventTraceScript() {
  return `
    window.__premarkRealInteractionEvents = [];
    const eventTypes = [
      "keydown",
      "beforeinput",
      "input",
      "keyup",
      "paste",
      "copy",
      "cut",
      "pointerdown",
      "pointermove",
      "pointerup",
      "dblclick",
      "click"
    ];
    for (const type of eventTypes) {
      document.addEventListener(type, (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        window.__premarkRealInteractionEvents.push({
          type: event.type,
          key: event instanceof KeyboardEvent ? event.key : undefined,
          code: event instanceof KeyboardEvent ? event.code : undefined,
          inputType: event instanceof InputEvent ? event.inputType : undefined,
          data: event instanceof InputEvent ? event.data : undefined,
          isComposing: event instanceof InputEvent ? event.isComposing : undefined,
          pointerType: event instanceof PointerEvent ? event.pointerType : undefined,
          clientX: event instanceof PointerEvent ? Math.round(event.clientX) : undefined,
          clientY: event instanceof PointerEvent ? Math.round(event.clientY) : undefined,
          target: target?.getAttribute("data-input-bridge") === "" ? "input-bridge" : target?.tagName?.toLowerCase(),
          active: document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("data-input-bridge") === ""
              ? "input-bridge"
              : document.activeElement.tagName.toLowerCase()
            : undefined,
          value: document.querySelector("[data-input-bridge]")?.value ?? "",
          selectionStart: document.querySelector("[data-input-bridge]")?.selectionStart ?? null,
          selectionEnd: document.querySelector("[data-input-bridge]")?.selectionEnd ?? null,
        });
      }, { capture: true });
    }
    return true;
  `;
}

function clientToScreenScript(clientXExpression, clientYExpression) {
  return `
    const clientX = ${clientXExpression};
    const clientY = ${clientYExpression};
    const borderX = Math.max(0, Math.round((window.outerWidth - window.innerWidth) / 2));
    const chromeY = Math.max(0, Math.round(window.outerHeight - window.innerHeight - borderX));
    return {
      x: Math.round(window.screenX + borderX + clientX),
      y: Math.round(window.screenY + chromeY + clientY),
      metrics: {
        screenX: window.screenX,
        screenY: window.screenY,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        borderX,
        chromeY,
      },
    };
  `;
}

function domPointForTextScript(text, edge = "start") {
  return `
    const markdown = window.__premarkNativeEditor.markdown();
    const offset = markdown.indexOf(${JSON.stringify(text)});
    if (offset < 0) throw new Error("missing source text: ${text}");
    const point = window.__premarkNativeEditor.pointForSourceRange(
      ${edge === "end" ? `offset + ${JSON.stringify(text)}.length` : "offset"},
      offset + ${JSON.stringify(text)}.length
    );
    const surface = document.querySelector("[data-editor-surface]").getBoundingClientRect();
    ${clientToScreenScript("surface.left + point.x", "surface.top + point.y")}
  `;
}

function canvasPointForTextScript(text, edge = "start") {
  return `
    const point = window.__premarkCanvasNativeEditor.pointForText(${JSON.stringify(text)}, ${JSON.stringify(edge)});
    const canvas = document.querySelector("[data-canvas-native-editor]").getBoundingClientRect();
    ${clientToScreenScript("canvas.left + point.x", "canvas.top + point.y")}
  `;
}

async function ensureBrowserForeground(adapter) {
  activateApplication(adapter.processName);
  await sleep(300);
  const frontmost = frontmostProcessName();
  if (frontmost !== adapter.processName) {
    throw new SkipError(`cannot make ${adapter.processName} the foreground app`, {
      foreground: foregroundSnapshot(),
    });
  }
}

async function openNativeEditor(adapter) {
  await adapter.open(nativeStoryUrl);
  await waitFor(adapter, `return document.querySelector(".pne-root")?.dataset.fontsReady === "1";`);
  await adapter.evaluate(installEventTraceScript());
}

async function focusDomBridge(adapter, text = "Click text", edge = "start") {
  await adapter.evaluate(`
    const markdown = window.__premarkNativeEditor.markdown();
    const offset = markdown.indexOf(${JSON.stringify(text)});
    if (offset < 0) throw new Error("missing source text: ${text}");
    window.__premarkNativeEditor.setCaret(offset + (${edge === "end" ? JSON.stringify(text.length) : "0"}));
    const bridge = document.querySelector("[data-input-bridge]");
    bridge.focus({ preventScroll: true });
    bridge.setSelectionRange(bridge.selectionStart, bridge.selectionEnd);
    return document.activeElement === bridge;
  `);
  await ensureBrowserForeground(adapter);
}

async function runKeyboardClipboardScenario(adapter, report) {
  await openNativeEditor(adapter);
  await focusDomBridge(adapter, "Click text");
  sendText(adapter.processName, "os ");
  await waitFor(
    adapter,
    `return window.__premarkNativeEditor.markdown().includes("os Click text");`,
  );
  report.checks.push("real text input through focused hidden textarea");

  await focusDomBridge(adapter, "rendered surface", "end");
  sendShortcut(adapter.processName, "shift,option", 123);
  const selectedWord = await waitFor(
    adapter,
    `
      const selection = window.__premarkNativeEditor.selection();
      const markdown = window.__premarkNativeEditor.markdown();
      return !selection.isCollapsed && markdown.slice(selection.range.from, selection.range.to).length > 0
        ? markdown.slice(selection.range.from, selection.range.to)
        : "";
    `,
  );
  if (!selectedWord.includes("surface")) {
    throw new Error(`Shift+Option+Left selected unexpected text: ${selectedWord}`);
  }
  report.checks.push("real Shift+Option+Left word selection");

  sendShortcut(adapter.processName, "command", 8);
  await sleep(500);
  const copied = pbpaste();
  if (!copied.includes("surface")) {
    throw new Error(`Command+C did not copy selected word; clipboard=${JSON.stringify(copied)}`);
  }
  report.checks.push("real Command+C system clipboard copy");

  sendShortcut(adapter.processName, "command", 7);
  await waitFor(
    adapter,
    `return !window.__premarkNativeEditor.markdown().includes("rendered surface.");`,
  );
  report.checks.push("real Command+X cut updates source");

  pbcopy("system-paste");
  sendShortcut(adapter.processName, "command", 9);
  await waitFor(
    adapter,
    `return window.__premarkNativeEditor.markdown().includes("rendered system-paste.");`,
  );
  report.checks.push("real Command+V paste event");

  sendKeyCode(adapter.processName, 36);
  sendText(adapter.processName, "next line");
  await waitFor(
    adapter,
    `return window.__premarkNativeEditor.markdown().includes("system-paste\\nnext line.");`,
  );
  report.checks.push("real Return key inserts editor newline");

  sendShortcut(adapter.processName, "shift,command", 126);
  await waitFor(
    adapter,
    `
      const selection = window.__premarkNativeEditor.selection();
      return !selection.isCollapsed && selection.range.from === 0;
    `,
  );
  report.checks.push("real Shift+Command+Up document selection");
}

async function runPointerScenario(adapter, report) {
  await openNativeEditor(adapter);
  await ensureBrowserForeground(adapter);
  const clickPoint = await adapter.evaluate(domPointForTextScript("Click text"));
  hidClick(clickPoint, 2);
  const doubleSelection = await waitFor(
    adapter,
    `
      const selection = window.__premarkNativeEditor.selection();
      return !selection.isCollapsed ? selection.range.to - selection.range.from : 0;
    `,
  );
  if (doubleSelection <= 0) {
    throw new Error("double-click did not create a word selection");
  }
  report.checks.push("real double-click word selection");

  hidClick(clickPoint, 3);
  const tripleSelection = await waitFor(
    adapter,
    `
      const selection = window.__premarkNativeEditor.selection();
      return !selection.isCollapsed ? selection.range.to - selection.range.from : 0;
    `,
  );
  if (tripleSelection <= doubleSelection) {
    throw new Error(
      `triple-click selection did not expand beyond double-click: ${tripleSelection} <= ${doubleSelection}`,
    );
  }
  report.checks.push("real triple-click block selection");

  const dragFrom = await adapter.evaluate(domPointForTextScript("Click text"));
  const dragTo = await adapter.evaluate(domPointForTextScript("hidden textarea", "end"));
  hidDrag(dragFrom, dragTo);
  const dragSelection = await waitFor(
    adapter,
    `
      const selection = window.__premarkNativeEditor.selection();
      return !selection.isCollapsed && selection.range.to - selection.range.from > 20;
    `,
  );
  if (dragSelection !== true) {
    throw new Error("cross-block drag did not create a large source selection");
  }
  report.checks.push("real cross-block mouse drag selection");
}

async function runCanvasScenario(adapter, report) {
  await adapter.open(canvasStoryUrl);
  await waitFor(
    adapter,
    `return document.querySelector(".pcne-root")?.dataset.fontsReady === "1";`,
  );
  await adapter.evaluate(`
    window.__premarkRealInteractionEvents = [];
    for (const type of ["keydown", "beforeinput", "input", "keyup", "pointerdown", "pointermove", "pointerup"]) {
      document.addEventListener(type, (event) => {
        window.__premarkRealInteractionEvents.push({
          type: event.type,
          key: event instanceof KeyboardEvent ? event.key : undefined,
          inputType: event instanceof InputEvent ? event.inputType : undefined,
          data: event instanceof InputEvent ? event.data : undefined,
          pointerType: event instanceof PointerEvent ? event.pointerType : undefined,
          active: document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("data-canvas-input-bridge") === ""
              ? "canvas-input-bridge"
              : document.activeElement.tagName.toLowerCase()
            : undefined,
        });
      }, { capture: true });
    }
    return true;
  `);
  await ensureBrowserForeground(adapter);

  const clickPoint = await adapter.evaluate(canvasPointForTextScript("WWWW"));
  hidClick(clickPoint, 1);
  await waitFor(
    adapter,
    `return document.activeElement === document.querySelector("[data-canvas-input-bridge]");`,
  );
  sendText(adapter.processName, "canvas ");
  await waitFor(
    adapter,
    `return window.__premarkCanvasNativeEditor.markdown().includes("canvas WWWW");`,
  );
  report.checks.push("real Canvas click focuses hidden bridge and accepts text");

  const dragFrom = await adapter.evaluate(canvasPointForTextScript("canvas WWWW"));
  const dragTo = await adapter.evaluate(canvasPointForTextScript("docs", "end"));
  hidDrag(dragFrom, dragTo);
  await waitFor(
    adapter,
    `
      const selection = window.__premarkCanvasNativeEditor.selection();
      return !selection.isCollapsed && Math.abs(selection.headOffset - selection.anchorOffset) > 8;
    `,
  );
  report.checks.push("real Canvas mouse drag selection");
}

async function readTrace(adapter) {
  return adapter.evaluate(`
    return window.__premarkRealInteractionEvents ?? [];
  `);
}

function buildPreflightReport() {
  const foreground = foregroundSnapshot();
  const inputSources =
    process.platform === "darwin"
      ? {
          current: run("swift", [inputSourceScript, "current"]).stdout,
          usInstalled: run("swift", [inputSourceScript, "list-all"]).stdout.includes(
            "com.apple.keylayout.US",
          ),
        }
      : undefined;
  return {
    platform: process.platform,
    targets,
    storybookStaticExists: existsSync(join(root, "storybook-static")),
    osInputHelper: process.platform === "darwin" ? run("swift", [osInputScript, "check"]) : null,
    inputSources,
    safariAppExists: existsSync("/Applications/Safari.app"),
    foreground,
    screenLocked: isSessionLocked(foreground),
  };
}

async function createAdapter(target) {
  if (target === "chrome") {
    return new ChromeAdapter();
  }
  if (target === "safari") {
    return new SafariAdapter();
  }
  throw new Error(`Unsupported real-interactions target: ${target}`);
}

async function runTarget(target) {
  const report = {
    target,
    startedAt: new Date().toISOString(),
    nativeStoryUrl,
    canvasStoryUrl,
    checks: [],
    artifacts: [],
  };
  let adapter;
  try {
    adapter = await createAdapter(target);
    await adapter.start();
    await runKeyboardClipboardScenario(adapter, report);
    await runPointerScenario(adapter, report);
    await runCanvasScenario(adapter, report);
    report.eventTrace = await readTrace(adapter);
    await adapter.pageScreenshot("real-interactions-final-page");
    const screenPath = captureScreen(target, "real-interactions-final-screen");
    if (screenPath !== null) {
      report.artifacts.push(screenPath);
    }
    report.finishedAt = new Date().toISOString();
    writeReport(target, report);
    console.log(`[real-interactions:${target}] passed: ${report.checks.join(", ")}`);
  } catch (error) {
    if (error instanceof SkipError) {
      writeSkip(target, error.message, error.details);
      return;
    }
    report.error = String(error);
    report.foreground = foregroundSnapshot();
    captureScreen(target, "real-interactions-failed-screen");
    writeReport(target, report);
    throw error;
  } finally {
    await adapter?.close();
  }
}

async function main() {
  if (process.platform !== "darwin") {
    for (const target of targets) {
      writeSkip(target, "real browser interaction tests require macOS");
    }
    return;
  }

  if (preflight) {
    const report = buildPreflightReport();
    writeFileSync(join(outRoot, "preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[real-interactions] preflight report written: ${JSON.stringify(report, null, 2)}`);
    return;
  }

  const foreground = foregroundSnapshot();
  if (isSessionLocked(foreground)) {
    for (const target of targets) {
      writeSkip(target, "macOS screen is locked; foreground OS input would be unsafe", foreground);
    }
    return;
  }

  const previousInputSource = swiftInputSource("current");
  if (swiftInputSource("list-all").includes("com.apple.keylayout.US")) {
    swiftInputSource("select", "com.apple.keylayout.US");
  }
  const server = startStaticServer();
  try {
    await waitForServer();
    for (const target of targets) {
      await runTarget(target);
    }
  } finally {
    if (previousInputSource.length > 0) {
      try {
        swiftInputSource("select", previousInputSource);
      } catch (error) {
        console.warn(`[real-interactions] failed to restore input source: ${String(error)}`);
      }
    }
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
