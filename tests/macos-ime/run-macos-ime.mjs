import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storyUrl =
  "http://127.0.0.1:6108/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story";
const inputSourceScript = join(root, "tests/macos-ime/input-source.swift");
const osInputScript = join(root, "tests/macos-ime/os-input.swift");
const targetInputSourceID =
  process.env.PREMARK_MACOS_IME_SOURCE_ID ?? "com.apple.inputmethod.SCIM.ITABC";
const strictRealIme = process.env.PREMARK_MACOS_IME_STRICT === "1";

if (process.platform !== "darwin") {
  console.log("[macos-ime] skipped: not running on macOS");
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function swiftInputSource(...args) {
  return run("swift", [inputSourceScript, ...args]);
}

function swiftOsInput(...args) {
  return run("swift", [osInputScript, ...args]);
}

function osascript(script) {
  return run("osascript", ["-e", script]);
}

async function installEventProbe(page) {
  await page.evaluate(() => {
    window.__premarkMacosImeEvents = [];
    const record = (event) => {
      window.__premarkMacosImeEvents.push({
        type: event.type,
        key: event instanceof KeyboardEvent ? event.key : undefined,
        inputType: event instanceof InputEvent ? event.inputType : undefined,
        data:
          event instanceof InputEvent || event instanceof CompositionEvent ? event.data : undefined,
        target:
          event.target instanceof HTMLElement
            ? event.target.getAttribute("data-input-bridge") === ""
              ? "input-bridge"
              : event.target.tagName.toLowerCase()
            : undefined,
      });
    };
    for (const type of [
      "keydown",
      "beforeinput",
      "input",
      "keyup",
      "compositionstart",
      "compositionupdate",
      "compositionend",
    ]) {
      document.addEventListener(type, record, true);
    }
  });
}

async function readEventProbe(page) {
  return page.evaluate(() => window.__premarkMacosImeEvents ?? []);
}

function activateBrowser(browserProcessName) {
  if (browserProcessName === "") {
    return;
  }
  osascript(`
    tell application "${browserProcessName}" to activate
    tell application "System Events"
      set frontmost of first application process whose name is "${browserProcessName}" to true
    end tell
  `);
}

async function frontmostProcessName() {
  return osascript(
    'tell application "System Events" to get name of first application process whose frontmost is true',
  );
}

async function foregroundBrowser(browserProcessName) {
  activateBrowser(browserProcessName);
  return (await frontmostProcessName()) === browserProcessName;
}

async function focusBridge(page, browserProcessName) {
  await page.bringToFront();
  activateBrowser(browserProcessName);
  await page.locator("[data-input-bridge]").focus();
  await page.locator("[data-input-bridge]").click({ force: true });
  const activeElement = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-input-bridge"),
  );
  if (activeElement === null) {
    throw new Error("Hidden textarea bridge did not become the active element");
  }
  console.log(`[macos-ime] frontmost after bridge focus: ${await frontmostProcessName()}`);
}

function sendSystemKeyCodes(browserProcessName, keyCodes) {
  const keyCodeLines = keyCodes.map((code) => `key code ${code}`).join("\n        ");
  activateBrowser(browserProcessName);
  osascript(`
    tell application "System Events"
      delay 0.2
      ${keyCodeLines}
    end tell
  `);
}

function sendTargetedKeyCodes(browserProcessName, browserPid, keyCodes) {
  if (browserPid !== undefined) {
    console.log(`[macos-ime] posting key codes to pid ${browserPid}: ${keyCodes.join(",")}`);
    swiftOsInput("keycodes", String(browserPid), ...keyCodes.map(String));
    return;
  }

  sendSystemKeyCodes(browserProcessName, keyCodes);
}

function findPlaywrightBrowserPid() {
  const output = run("ps", ["-axo", "pid=,command="]);
  const candidates = output
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.includes("--remote-debugging-pipe") &&
        line.includes("--no-startup-window") &&
        !line.includes("Helper"),
    )
    .map((line) => Number.parseInt(line, 10))
    .filter((pid) => Number.isInteger(pid));
  return candidates.at(-1);
}

function startStaticServer() {
  const server = spawn(
    "python3",
    ["-m", "http.server", "6108", "--bind", "127.0.0.1", "--directory", "storybook-static"],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    process.stdout.write(`[macos-ime-server] ${chunk}`);
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(`[macos-ime-server] ${chunk}`);
  });
  return server;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:6108/");
      if (response.ok) return;
    } catch {
      // Retry below.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error("Timed out waiting for Storybook static server");
}

async function launchMacBrowser() {
  const preferredChannel = process.env.PREMARK_MACOS_IME_BROWSER_CHANNEL ?? "chrome";
  if (preferredChannel !== "bundled") {
    try {
      return {
        browser: await chromium.launch({ channel: preferredChannel, headless: false }),
        processCandidates:
          preferredChannel === "chrome"
            ? ["Google Chrome"]
            : ["Google Chrome for Testing", "Chromium", "Google Chrome"],
      };
    } catch (error) {
      console.log(
        `[macos-ime] could not launch Playwright channel ${preferredChannel}; falling back to bundled Chromium: ${String(error)}`,
      );
    }
  }

  return {
    browser: await chromium.launch({ headless: false }),
    processCandidates: ["Google Chrome for Testing", "Chromium", "Google Chrome"],
  };
}

async function main() {
  const sources = swiftInputSource("list");
  if (!sources.includes(targetInputSourceID)) {
    console.log(`[macos-ime] skipped: input source not found: ${targetInputSourceID}`);
    console.log(sources);
    return;
  }

  const previousInputSourceID = swiftInputSource("current");
  const server = startStaticServer();
  let browser;
  try {
    await waitForServer();
    const launched = await launchMacBrowser();
    browser = launched.browser;
    const browserPid =
      (typeof browser.process === "function" ? browser.process()?.pid : undefined) ??
      findPlaywrightBrowserPid();
    console.log(`[macos-ime] browser pid: ${browserPid ?? "(unknown)"}`);
    const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
    await page.goto(storyUrl);
    await installEventProbe(page);
    await page.locator("[data-editor-surface]").click({ position: { x: 118, y: 86 } });
    await page.locator("[data-input-bridge]").waitFor({ state: "attached" });

    const processNames = osascript(
      'tell application "System Events" to get name of every process whose background only is false',
    );
    console.log(`[macos-ime] visible processes: ${processNames}`);
    const browserProcessName =
      launched.processCandidates.find((name) => processNames.includes(name)) ?? "";
    console.log(`[macos-ime] browser activation target: ${browserProcessName || "(none)"}`);

    const usSourceID = "com.apple.keylayout.US";
    if (sources.includes(usSourceID)) {
      const selectedUS = swiftInputSource("select", usSourceID);
      console.log(`[macos-ime] selected input source for focus probe: ${selectedUS}`);
      await focusBridge(page, browserProcessName);
      sendTargetedKeyCodes(browserProcessName, browserPid, [0, 11, 8]);
      try {
        await page.waitForFunction(
          () => document.querySelector("[data-debug-source]")?.textContent?.includes("abc"),
          undefined,
          { timeout: 5_000 },
        );
      } catch (error) {
        mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
        const sourceText = await page.locator("[data-debug-source]").textContent();
        const events = await readEventProbe(page);
        await page
          .locator(".pne-editor-wrap")
          .screenshot({ path: join(root, "test-results/macos-ime/focus-probe-failed.png") });
        throw new Error(
          `macOS key-event focus probe did not produce abc. Browser events were:\n${JSON.stringify(events, null, 2)}\nSource was:\n${sourceText}`,
          { cause: error },
        );
      }
      console.log("[macos-ime] macOS key-event focus probe passed");
    } else {
      console.log("[macos-ime] skipped US focus probe: com.apple.keylayout.US not found");
    }

    await page.reload();
    await installEventProbe(page);
    await page.locator("[data-editor-surface]").click({ position: { x: 118, y: 86 } });
    await page.locator("[data-input-bridge]").waitFor({ state: "attached" });

    const selected = swiftInputSource("select", targetInputSourceID);
    console.log(`[macos-ime] selected input source: ${selected}`);
    await focusBridge(page, browserProcessName);

    if (!(await foregroundBrowser(browserProcessName))) {
      mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
      await page.locator(".pne-editor-wrap").screenshot({
        path: join(root, "test-results/macos-ime/pinyin-skipped-no-foreground.png"),
      });
      const frontmost = await frontmostProcessName();
      const message =
        `skipped real Pinyin commit: cannot make ${browserProcessName || "browser"} the foreground app ` +
        `(frontmost is ${frontmost}). Targeted CGEventPostToPid is not enough for IME because it bypasses macOS input-method composition.`;
      writeFileSync(join(root, "test-results/macos-ime/pinyin-skip.txt"), `${message}\n`);
      if (strictRealIme) {
        throw new Error(`[macos-ime] ${message}`);
      }
      console.log(`[macos-ime] ${message}`);
      return;
    }

    sendSystemKeyCodes(browserProcessName, [45, 34, 4, 0, 31, 49, 36]);

    await page.locator("[data-debug-source]").waitFor({
      state: "attached",
    });
    try {
      await page.waitForFunction(
        () => document.querySelector("[data-debug-source]")?.textContent?.includes("你好"),
        undefined,
        { timeout: 10_000 },
      );
    } catch (error) {
      mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
      const sourceText = await page.locator("[data-debug-source]").textContent();
      const events = await readEventProbe(page);
      await page
        .locator(".pne-editor-wrap")
        .screenshot({ path: join(root, "test-results/macos-ime/pinyin-failed.png") });
      throw new Error(
        `Pinyin commit did not produce 你好. Browser events were:\n${JSON.stringify(events, null, 2)}\nSource was:\n${sourceText}`,
        { cause: error },
      );
    }

    mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
    await page
      .locator(".pne-editor-wrap")
      .screenshot({ path: join(root, "test-results/macos-ime/pinyin-commit.png") });
    console.log("[macos-ime] pinyin commit passed");
  } finally {
    if (previousInputSourceID) {
      try {
        swiftInputSource("select", previousInputSourceID);
      } catch (error) {
        console.warn(`[macos-ime] failed to restore input source: ${String(error)}`);
      }
    }
    if (browser !== undefined) {
      await browser.close();
    }
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
