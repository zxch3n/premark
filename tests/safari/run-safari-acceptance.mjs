import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "test-results/safari");
const strict = process.env.PREMARK_SAFARI_STRICT === "1";
const serverPort = Number(process.env.PREMARK_SAFARI_STORYBOOK_PORT ?? 6116);
const driverPort = Number(process.env.PREMARK_SAFARI_DRIVER_PORT ?? 6117);
const baseURL = `http://127.0.0.1:${serverPort}`;
const driverURL = `http://127.0.0.1:${driverPort}`;
const storyUrl = `${baseURL}/iframe.html?id=editing-premark-native-editor--interactive-native-prototype&viewMode=story`;
const canvasStoryUrl = `${baseURL}/iframe.html?id=editing-premark-canvas-native-editor--interactive-canvas-native-editor&viewMode=story`;

mkdirSync(outDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error === undefined ? undefined : String(result.error),
  };
}

function commandPath(command) {
  const result = run("/usr/bin/which", [command]);
  return result.status === 0 ? result.stdout : null;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function spawnLogged(command, args, logName) {
  const logPath = join(outDir, logName);
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
    writeFileSync(logPath, log);
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
    writeFileSync(logPath, log);
  });
  return child;
}

async function webdriver(sessionId, method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${driverURL}/session/${sessionId}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WebDriver ${method} ${path} failed: ${JSON.stringify(payload)}`);
  }
  return payload.value;
}

async function driver(method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${driverURL}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WebDriver ${method} ${path} failed: ${JSON.stringify(payload)}`);
  }
  return payload.value;
}

async function execute(sessionId, script, args = []) {
  return webdriver(sessionId, "POST", "/execute/sync", { script, args });
}

async function navigate(sessionId, url) {
  await webdriver(sessionId, "POST", "/url", { url });
}

async function waitFor(sessionId, script, timeoutMs = 8_000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await execute(sessionId, script);
    if (lastValue) {
      return lastValue;
    }
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for script: ${script}; last value: ${JSON.stringify(lastValue)}`,
  );
}

function keyActions(text) {
  return Array.from(text, (value) => [
    { type: "keyDown", value },
    { type: "keyUp", value },
  ]).flat();
}

async function sendKeys(sessionId, text) {
  await webdriver(sessionId, "POST", "/actions", {
    actions: [
      {
        type: "key",
        id: "keyboard",
        actions: keyActions(text),
      },
    ],
  });
  await webdriver(sessionId, "DELETE", "/actions");
}

async function drag(sessionId, from, to) {
  await webdriver(sessionId, "POST", "/actions", {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", duration: 0, x: from.x, y: from.y, origin: "viewport" },
          { type: "pointerDown", button: 0 },
          { type: "pointerMove", duration: 250, x: to.x, y: to.y, origin: "viewport" },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
  await webdriver(sessionId, "DELETE", "/actions");
}

async function screenshot(sessionId, name) {
  const base64 = await webdriver(sessionId, "GET", "/screenshot");
  writeFileSync(join(outDir, name), Buffer.from(base64, "base64"));
}

async function createSession() {
  const value = await driver("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "safari",
      },
    },
  });
  return value.sessionId;
}

async function main() {
  if (process.platform !== "darwin") {
    const message = "Safari acceptance skipped: this runner requires macOS.";
    writeFileSync(join(outDir, "safari-skip.txt"), `${message}\n`);
    console.log(`[safari] ${message}`);
    return;
  }

  const safaridriver = commandPath("safaridriver");
  if (safaridriver === null) {
    const message = "Safari acceptance skipped: safaridriver was not found.";
    writeFileSync(join(outDir, "safari-skip.txt"), `${message}\n`);
    if (strict) {
      throw new Error(message);
    }
    console.log(`[safari] ${message}`);
    return;
  }

  const storybook = spawnLogged(
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
    "storybook-server.log",
  );
  const safaridriverProcess = spawnLogged(
    safaridriver,
    ["--port", String(driverPort)],
    "safaridriver.log",
  );
  let sessionId = null;
  const report = {
    safaridriverVersion: run(safaridriver, ["--version"]).stdout,
    storyUrl,
    canvasStoryUrl,
    checks: [],
  };

  try {
    await waitForUrl(baseURL);
    await waitForUrl(`${driverURL}/status`);
    try {
      sessionId = await createSession();
    } catch (error) {
      const message =
        "Safari acceptance skipped: could not create a Safari WebDriver session. Run `safaridriver --enable` once and retry.";
      report.skip = message;
      report.error = String(error);
      writeFileSync(join(outDir, "safari-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(join(outDir, "safari-skip.txt"), `${message}\n${String(error)}\n`);
      if (strict) {
        throw error;
      }
      console.log(`[safari] ${message}`);
      return;
    }

    await webdriver(sessionId, "POST", "/window/rect", {
      width: 1180,
      height: 760,
      x: 40,
      y: 40,
    });

    await navigate(sessionId, storyUrl);
    await waitFor(
      sessionId,
      `return document.querySelector(".pne-root")?.dataset.fontsReady === "1";`,
    );
    await execute(
      sessionId,
      `
      window.__premarkSafariTrace = [];
      const bridge = document.querySelector("[data-input-bridge]");
      for (const type of ["keydown", "beforeinput", "input", "keyup"]) {
        bridge.addEventListener(type, (event) => {
          window.__premarkSafariTrace.push({
            type: event.type,
            key: event.key,
            inputType: event.inputType,
            data: event.data,
            isComposing: event.isComposing,
            value: bridge.value,
            selectionStart: bridge.selectionStart,
            selectionEnd: bridge.selectionEnd,
          });
        }, { capture: true });
      }
      return true;
      `,
    );
    await execute(
      sessionId,
      `
      const markdown = window.__premarkNativeEditor.markdown();
      window.__premarkNativeEditor.setCaret(markdown.indexOf("Click text"));
      document.querySelector("[data-input-bridge]").focus();
      return document.activeElement === document.querySelector("[data-input-bridge]");
      `,
    );
    await sendKeys(sessionId, "Safari ");
    await waitFor(
      sessionId,
      `return window.__premarkNativeEditor.markdown().includes("Safari Click text");`,
    );
    report.checks.push("dom typing");

    await sendKeys(sessionId, "\uE007Safari line");
    await waitFor(
      sessionId,
      `return window.__premarkNativeEditor.markdown().includes("Safari line");`,
    );
    report.checks.push("enter typing");

    await execute(
      sessionId,
      `
      const bridge = document.querySelector("[data-input-bridge]");
      const data = new DataTransfer();
      data.setData("text/plain", " pasted");
      bridge.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
      return true;
      `,
    );
    await waitFor(
      sessionId,
      `return window.__premarkNativeEditor.markdown().includes("Safari line pasted");`,
    );
    report.checks.push("paste event");

    const dragPoints = await execute(
      sessionId,
      `
      const markdown = window.__premarkNativeEditor.markdown();
      const start = markdown.indexOf("Safari Click text");
      const end = markdown.indexOf("hidden textarea") + "hidden textarea".length;
      const a = window.__premarkNativeEditor.pointForSourceRange(start, start + "Safari Click text".length);
      const b = window.__premarkNativeEditor.pointForSourceRange(end - "hidden textarea".length, end);
      const surface = document.querySelector("[data-editor-surface]").getBoundingClientRect();
      return {
        from: { x: Math.round(surface.left + a.x), y: Math.round(surface.top + a.y) },
        to: { x: Math.round(surface.left + b.x), y: Math.round(surface.top + b.y) },
      };
      `,
    );
    await drag(sessionId, dragPoints.from, dragPoints.to);
    const selection = await execute(
      sessionId,
      `return JSON.parse(document.querySelector("[data-debug-selection]").textContent);`,
    );
    if (selection.isCollapsed) {
      throw new Error(`Expected non-collapsed drag selection: ${JSON.stringify(selection)}`);
    }
    report.checks.push("pointer drag selection");
    report.domEventTrace = await execute(sessionId, "return window.__premarkSafariTrace;");
    await screenshot(sessionId, "safari-dom-editor.png");

    await navigate(sessionId, canvasStoryUrl);
    await waitFor(
      sessionId,
      `return document.querySelector(".pcne-root")?.dataset.fontsReady === "1";`,
    );
    const canvasReport = await execute(
      sessionId,
      `
      const markdown = window.__premarkCanvasNativeEditor.markdown();
      const offset = markdown.indexOf("WWWW");
      window.__premarkCanvasNativeEditor.setCaret(offset);
      const point = window.__premarkCanvasNativeEditor.pointForText("WWWW");
      const selection = window.__premarkCanvasNativeEditor.selection();
      return { offset, point, selection };
      `,
    );
    if (!canvasReport.selection.isCollapsed || canvasReport.offset < 0) {
      throw new Error(`Unexpected Canvas selection report: ${JSON.stringify(canvasReport)}`);
    }
    report.canvas = canvasReport;
    report.checks.push("canvas geometry");
    await screenshot(sessionId, "safari-canvas-editor.png");

    writeFileSync(join(outDir, "safari-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[safari] acceptance passed: ${report.checks.join(", ")}`);
  } finally {
    if (sessionId !== null) {
      await driver("DELETE", `/session/${sessionId}`).catch(() => {});
    }
    storybook.kill();
    safaridriverProcess.kill();
  }
}

main().catch((error) => {
  const message = `[safari] acceptance failed: ${String(error)}`;
  writeFileSync(join(outDir, "safari-error.txt"), `${message}\n`);
  console.error(message);
  process.exit(1);
});
