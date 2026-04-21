import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "test-results/safari");
const strict = process.env.PREMARK_SAFARI_STRICT === "1";

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

function writeReport(report) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
}

const safaridriverPath = commandPath("safaridriver");
const report = {
  platform: process.platform,
  darwin: process.platform === "darwin",
  safaridriverPath,
  safaridriverVersion:
    safaridriverPath === null ? null : run(safaridriverPath, ["--version"]).stdout || null,
  safariAppExists: existsSync("/Applications/Safari.app"),
  safariTechnologyPreviewAppExists: existsSync("/Applications/Safari Technology Preview.app"),
  safariTechnologyPreviewDriverExists: existsSync(
    "/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver",
  ),
  nextSteps: [
    "Run `safaridriver --enable` once if remote automation is not enabled.",
    "Use Playwright WebKit as a fast proxy only; use Safari WebDriver for real desktop Safari behavior.",
    "Use a separate foreground Safari runner for OS-level IME because WebDriver automation windows guard external input.",
  ],
};

writeReport(report);

if (!report.darwin || report.safaridriverPath === null || !report.safariAppExists) {
  const message = `[safari-preflight] Safari preflight incomplete: ${JSON.stringify(report)}`;
  if (strict) {
    throw new Error(message);
  }
  console.log(message);
  process.exit(0);
}

console.log(
  `[safari-preflight] ok: ${report.safaridriverVersion}; report written to ${join(
    outDir,
    "preflight.json",
  )}`,
);
