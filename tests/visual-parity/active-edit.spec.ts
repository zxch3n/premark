import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test, type Page } from "@playwright/test";

interface RectMetrics {
  index: number;
  text: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface VisualParityMetrics {
  fixture: {
    id: string;
    name: string;
    width: number;
    zoom: number;
    theme: "light" | "dark";
  };
  overlay: {
    lines: RectMetrics[];
  };
}

interface ActiveEditMetrics {
  mode: "caret" | "selection" | null;
  caret: RectMetrics | null;
  selection: RectMetrics[];
}

const activeEditCases = [
  { fixture: "paragraph-wrapping", edit: "caret", pos: 24 },
  { fixture: "heading-h2-wrap", edit: "caret", pos: 8 },
  { fixture: "list-unordered", edit: "selection", anchor: 2, head: 20 },
  { fixture: "code-fenced", edit: "selection", anchor: 7, head: 18 },
] as const;

test.describe("CodeMirror active edit visual probes", () => {
  for (const testCase of activeEditCases) {
    test(`${testCase.fixture}-${testCase.edit}`, async ({ page }, testInfo) => {
      await openActiveEditFixture(page, testCase);
      const metrics = await collect(page);
      const active = await collectActive(page);

      await page
        .locator("[data-overlay-surface]")
        .screenshot({ path: testInfo.outputPath(`${testCase.fixture}-${testCase.edit}.png`) });
      writeJson(testInfo.outputPath(`${testCase.fixture}-${testCase.edit}-active-report.json`), {
        metrics,
        active,
      });

      expect(active.mode).toBe(testCase.edit);
      expect(metrics.overlay.lines.length).toBeGreaterThan(0);
      if (testCase.edit === "caret") {
        expect(active.caret).not.toBeNull();
        const nearest = nearestLine(active.caret!, metrics.overlay.lines);
        expect(active.caret!.top).toBeGreaterThanOrEqual(nearest.top - 4);
        expect(active.caret!.top).toBeLessThanOrEqual(nearest.top + nearest.height);
        expect(active.caret!.height).toBeGreaterThan(8);
      } else {
        expect(active.selection.length).toBeGreaterThan(0);
      }
    });
  }
});

test.describe("Visual parity zoom probes", () => {
  for (const zoom of [0.75, 1, 1.5, 2] as const) {
    test(`paragraph-short-${zoom}x`, async ({ page }) => {
      await page.goto(`/?mode=visual-parity&fixture=paragraph-short&zoom=${zoom}`);
      await page.locator("[data-vp-ready='true']").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await collect(page);

      expect(metrics.fixture.zoom).toBe(zoom);
      expect(metrics.overlay.lines.length).toBeGreaterThan(0);
    });
  }
});

test.describe("Visual parity theme probes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`paragraph-short-${theme}`, async ({ page }, testInfo) => {
      await page.goto(`/?mode=visual-parity&fixture=paragraph-short&theme=${theme}`);
      await page.locator("[data-vp-ready='true']").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await collect(page);

      await page
        .locator("[data-premark-surface]")
        .screenshot({ path: testInfo.outputPath(`paragraph-short-${theme}-premark.png`) });
      await page
        .locator("[data-overlay-surface]")
        .screenshot({ path: testInfo.outputPath(`paragraph-short-${theme}-overlay.png`) });

      expect(metrics.fixture.theme).toBe(theme);
      expect(metrics.overlay.lines.length).toBeGreaterThan(0);
    });
  }
});

async function openActiveEditFixture(
  page: Page,
  testCase: (typeof activeEditCases)[number],
): Promise<void> {
  const params = new URLSearchParams({
    mode: "visual-parity",
    fixture: testCase.fixture,
    edit: testCase.edit,
  });
  if ("pos" in testCase) {
    params.set("pos", String(testCase.pos));
  }
  if ("anchor" in testCase) {
    params.set("anchor", String(testCase.anchor));
    params.set("head", String(testCase.head));
  }

  await page.goto(`/?${params.toString()}`);
  await page.locator("[data-vp-ready='true']").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function collect(page: Page): Promise<VisualParityMetrics> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __premarkVisualParity?: {
          collect: () => VisualParityMetrics;
        };
      }
    ).__premarkVisualParity;
    if (api === undefined) {
      throw new Error("visual parity API missing");
    }
    return api.collect();
  });
}

async function collectActive(page: Page): Promise<ActiveEditMetrics> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __premarkVisualParity?: {
          collectActiveEdit: () => ActiveEditMetrics;
        };
      }
    ).__premarkVisualParity;
    if (api === undefined) {
      throw new Error("visual parity API missing");
    }
    return api.collectActiveEdit();
  });
}

function nearestLine(caret: RectMetrics, lines: RectMetrics[]): RectMetrics {
  return lines.reduce((best, line) =>
    Math.abs(line.top - caret.top) < Math.abs(best.top - caret.top) ? line : best,
  );
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
