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
const dryRun = process.env.PREMARK_MACOS_IME_DRY_RUN === "1" || process.argv.includes("--dry-run");

const PINYIN_NIHAO_KEY_CODES = [45, 34, 4, 0, 31, 49, 36];
const PINYIN_SCENARIOS = [
  {
    name: "pinyin-commit",
    description: "Commit 你好 at the current caret.",
    keyCodes: PINYIN_NIHAO_KEY_CODES,
    expectIncludes: "你好",
  },
  {
    name: "pinyin-cancel",
    description: "Start a Pinyin preedit and cancel it with Escape.",
    keyCodes: [45, 34, 53],
    expectUnchanged: true,
  },
  {
    name: "pinyin-replacement",
    description: "Replace rendered inline text with a committed Pinyin word.",
    selection: {
      anchorText: "Click text",
      anchorEdge: "start",
      headText: "Click text",
      headEdge: "end",
    },
    keyCodes: PINYIN_NIHAO_KEY_CODES,
    expectIncludes: "你好, drag across blocks",
  },
  {
    name: "pinyin-cross-block-replacement",
    description: "Replace a cross-block source selection with a committed Pinyin word.",
    selection: {
      anchorText: "Click text",
      anchorEdge: "start",
      headText: "hidden textarea",
      headEdge: "end",
    },
    keyCodes: PINYIN_NIHAO_KEY_CODES,
    expectIncludes: "你好 mirrors only the active source slice",
  },
  {
    name: "pinyin-undo",
    description: "Commit Pinyin text and undo it through the browser native history path.",
    keyCodes: PINYIN_NIHAO_KEY_CODES,
    after: [{ type: "shortcut", modifiers: "command", keyCode: 6 }],
    expectNotIncludes: "你好",
  },
];

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

function parseInputSources(sources) {
  return sources
    .split("\n")
    .map((line) => {
      const [id = "", enabled = "", ...nameParts] = line.split("\t");
      return {
        id,
        enabled: enabled === "enabled",
        name: nameParts.join("\t"),
      };
    })
    .filter((source) => source.id.length > 0);
}

function findImeCandidates(sources, patterns) {
  return sources.filter((source) =>
    patterns.some((pattern) => pattern.test(`${source.id} ${source.name}`)),
  );
}

function writeDryRunReport(report) {
  mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
  writeFileSync(
    join(root, "test-results/macos-ime/dry-run.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "test-results/macos-ime/dry-run.txt"),
    [
      `current=${report.currentInputSourceID}`,
      `target=${report.targetInputSourceID}`,
      `targetFound=${String(report.targetFound)}`,
      `usFound=${String(report.usFound)}`,
      `japaneseCandidates=${report.japaneseCandidates.length}`,
      `koreanCandidates=${report.koreanCandidates.length}`,
      `pinyinScenarios=${report.pinyinScenarios.length}`,
      `osInputHelper=${report.osInputHelper}`,
      "",
    ].join("\n"),
  );
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
        active:
          document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("data-input-bridge") === ""
              ? "input-bridge"
              : document.activeElement.tagName.toLowerCase()
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
  await page.locator("[data-input-bridge]").evaluate((element) => {
    const textarea = element;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.selectionStart, textarea.selectionEnd);
  });
  const activeElement = await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-input-bridge") === "",
    undefined,
    { timeout: 2_000 },
  );
  if ((await activeElement.jsonValue()) !== true) {
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

function sendHidKeyCodes(browserProcessName, keyCodes) {
  activateBrowser(browserProcessName);
  console.log(`[macos-ime] posting HID key codes: ${keyCodes.join(",")}`);
  swiftOsInput("hid-keycodes", ...keyCodes.map(String));
}

function sendHidShortcut(browserProcessName, modifiers, keyCode) {
  activateBrowser(browserProcessName);
  console.log(`[macos-ime] posting HID shortcut: ${modifiers}+${keyCode}`);
  swiftOsInput("hid-shortcut", modifiers, String(keyCode));
}

async function writeImeFailureArtifact(page, name, message) {
  mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
  const sourceText = await page.locator("[data-debug-source]").textContent();
  const events = await readEventProbe(page);
  await page
    .locator(".pne-editor-wrap")
    .screenshot({ path: join(root, `test-results/macos-ime/${name}.png`) });
  writeFileSync(
    join(root, `test-results/macos-ime/${name}.json`),
    `${JSON.stringify({ message, events, source: sourceText }, null, 2)}\n`,
  );
  return { events, sourceText };
}

async function readEditorMarkdown(page) {
  return page.evaluate(
    () =>
      window.__premarkNativeEditor?.markdown?.() ??
      document.querySelector("[data-debug-source]")?.textContent ??
      "",
  );
}

async function sourceOffset(page, text, edge) {
  return page.evaluate(
    ({ text, edge }) => {
      const markdown =
        window.__premarkNativeEditor?.markdown?.() ??
        document.querySelector("[data-debug-source]")?.textContent ??
        "";
      const offset = markdown.indexOf(text);
      if (offset < 0) {
        throw new Error(`Missing source text for macOS IME scenario: ${text}`);
      }
      return edge === "end" ? offset + text.length : offset;
    },
    { text, edge },
  );
}

async function applyScenarioSelection(page, selection) {
  if (selection === undefined) {
    return;
  }
  const anchor = await sourceOffset(page, selection.anchorText, selection.anchorEdge);
  const head = await sourceOffset(page, selection.headText, selection.headEdge);
  await page.evaluate(
    ({ anchor, head }) => {
      window.__premarkNativeEditor?.setSelection?.(anchor, head);
    },
    { anchor, head },
  );
}

async function resetScenarioPage(page, browserProcessName) {
  await page.reload();
  await installEventProbe(page);
  await page.locator("[data-editor-surface]").click({ position: { x: 118, y: 86 } });
  await page.locator("[data-input-bridge]").waitFor({ state: "attached" });
  await focusBridge(page, browserProcessName);
}

async function assertScenarioResult(page, scenario, beforeMarkdown) {
  if (scenario.expectIncludes !== undefined) {
    await page.waitForFunction(
      (expected) => document.querySelector("[data-debug-source]")?.textContent?.includes(expected),
      scenario.expectIncludes,
      { timeout: 10_000 },
    );
  }
  if (scenario.expectNotIncludes !== undefined) {
    await page.waitForTimeout(600);
    const source = await readEditorMarkdown(page);
    if (source.includes(scenario.expectNotIncludes)) {
      throw new Error(
        `${scenario.name} expected source not to include ${scenario.expectNotIncludes}, but source was:\n${source}`,
      );
    }
  }
  if (scenario.expectUnchanged === true) {
    await page.waitForTimeout(600);
    const source = await readEditorMarkdown(page);
    if (source !== beforeMarkdown) {
      throw new Error(
        `${scenario.name} expected unchanged source.\nBefore:\n${beforeMarkdown}\nAfter:\n${source}`,
      );
    }
  }
}

async function runPinyinScenario(page, browserProcessName, scenario) {
  console.log(`[macos-ime] running scenario: ${scenario.name}`);
  await resetScenarioPage(page, browserProcessName);
  await applyScenarioSelection(page, scenario.selection);
  const beforeMarkdown = await readEditorMarkdown(page);
  sendHidKeyCodes(browserProcessName, scenario.keyCodes);
  for (const action of scenario.after ?? []) {
    if (action.type === "shortcut") {
      sendHidShortcut(browserProcessName, action.modifiers, action.keyCode);
    }
  }
  try {
    await assertScenarioResult(page, scenario, beforeMarkdown);
  } catch (error) {
    const { events, sourceText } = await writeImeFailureArtifact(
      page,
      `${scenario.name}-failed`,
      `${scenario.name} failed: ${String(error)}`,
    );
    throw new Error(
      `${scenario.name} failed. Browser events were:\n${JSON.stringify(events, null, 2)}\nSource was:\n${sourceText}`,
      { cause: error },
    );
  }
  await page
    .locator(".pne-editor-wrap")
    .screenshot({ path: join(root, `test-results/macos-ime/${scenario.name}.png`) });
  console.log(`[macos-ime] scenario passed: ${scenario.name}`);
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
  const parsedSources = parseInputSources(sources);
  const usSourceID = "com.apple.keylayout.US";

  if (dryRun) {
    const report = {
      mode: "dry-run",
      currentInputSourceID: swiftInputSource("current"),
      targetInputSourceID,
      targetFound: parsedSources.some((source) => source.id === targetInputSourceID),
      usFound: parsedSources.some((source) => source.id === usSourceID),
      pinyinCandidates: findImeCandidates(parsedSources, [/pinyin/iu, /SCIM/iu, /ITABC/iu]),
      japaneseCandidates: findImeCandidates(parsedSources, [/japanese/iu, /kotoeri/iu, /romaji/iu]),
      koreanCandidates: findImeCandidates(parsedSources, [/korean/iu, /hangul/iu]),
      pinyinScenarios: PINYIN_SCENARIOS.map((scenario) => ({
        name: scenario.name,
        description: scenario.description,
      })),
      osInputHelper: swiftOsInput("check"),
      enabledSourceCount: parsedSources.filter((source) => source.enabled).length,
      sourceCount: parsedSources.length,
    };
    writeDryRunReport(report);
    console.log(`[macos-ime] dry-run report written: ${JSON.stringify(report, null, 2)}`);
    return;
  }

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

    if (sources.includes(usSourceID)) {
      const selectedUS = swiftInputSource("select", usSourceID);
      console.log(`[macos-ime] selected input source for HID probe: ${selectedUS}`);
      await focusBridge(page, browserProcessName);
      sendHidKeyCodes(browserProcessName, [0, 11, 8]);
      try {
        await page.waitForFunction(
          () => document.querySelector("[data-debug-source]")?.textContent?.includes("abc"),
          undefined,
          { timeout: 5_000 },
        );
      } catch (error) {
        const message =
          "skipped real Pinyin commit: global HID key events did not reach the foreground browser. " +
          "Real IME automation requires global key events; targeted CGEventPostToPid bypasses input-method composition.";
        await writeImeFailureArtifact(page, "hid-probe-failed", message);
        writeFileSync(join(root, "test-results/macos-ime/pinyin-skip.txt"), `${message}\n`);
        if (strictRealIme) {
          throw new Error(`[macos-ime] ${message}`, { cause: error });
        }
        console.log(`[macos-ime] ${message}`);
        return;
      }
      console.log("[macos-ime] global HID key-event probe passed");
    } else {
      console.log("[macos-ime] skipped HID US probe: com.apple.keylayout.US not found");
    }

    const selected = swiftInputSource("select", targetInputSourceID);
    console.log(`[macos-ime] selected input source: ${selected}`);
    await resetScenarioPage(page, browserProcessName);

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

    mkdirSync(join(root, "test-results/macos-ime"), { recursive: true });
    for (const scenario of PINYIN_SCENARIOS) {
      await runPinyinScenario(page, browserProcessName, scenario);
    }
    console.log("[macos-ime] pinyin scenarios passed");
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
