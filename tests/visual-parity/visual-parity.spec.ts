import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  getVisualParityStatus,
  visualParityFixtures,
} from "../../apps/playground/src/visual-parity/fixtures.ts";
import { findKnownVisualMismatch } from "./known-mismatches.ts";

interface RectMetrics {
  index: number;
  text: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PaneMetrics {
  blocks: RectMetrics[];
  lines: RectMetrics[];
  height: number;
  width: number;
}

interface VisualParityMetrics {
  fixture: {
    id: string;
    name: string;
    width: number;
  };
  premark: PaneMetrics;
  overlay: PaneMetrics;
}

interface RectComparison {
  leftCount: number;
  rightCount: number;
  countDelta: number;
  maxTopDelta: number;
  maxLeftDelta: number;
  maxWidthDelta: number;
  maxHeightDelta: number;
}

interface PixelComparison {
  width: number;
  height: number;
  mismatchedPixels: number;
  mismatchRatio: number;
}

const strict = process.env.VISUAL_PARITY_STRICT === "1";
const strictMaxPixelMismatchRatio = 0.015;

test.describe("Premark vs CodeMirror visual parity", () => {
  for (const fixture of visualParityFixtures) {
    test(fixture.id, async ({ page }, testInfo) => {
      await openFixture(page, fixture.id);

      const metrics = await page.evaluate<VisualParityMetrics>(() => {
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

      const premarkScreenshot = testInfo.outputPath(`${fixture.id}-premark.png`);
      const overlayScreenshot = testInfo.outputPath(`${fixture.id}-overlay.png`);
      const diffScreenshot = testInfo.outputPath(`${fixture.id}-diff.png`);
      await page.locator("[data-premark-surface]").screenshot({ path: premarkScreenshot });
      await page.locator("[data-overlay-surface]").screenshot({ path: overlayScreenshot });

      const pixel = diffScreenshots(premarkScreenshot, overlayScreenshot, diffScreenshot);
      const knownMismatch = findKnownVisualMismatch(fixture.id);
      const report = {
        fixture: metrics.fixture,
        parityStatus: getVisualParityStatus(fixture),
        knownMismatch,
        geometry: {
          blocks: compareRects(metrics.premark.blocks, metrics.overlay.blocks),
          lines: compareRects(metrics.premark.lines, metrics.overlay.lines),
        },
        pixel,
        screenshots: {
          premark: premarkScreenshot,
          overlay: overlayScreenshot,
          diff: diffScreenshot,
        },
        rawMetrics: metrics,
      };

      writeJson(testInfo.outputPath(`${fixture.id}-report.json`), report);

      expect(metrics.premark.blocks.length, "Premark block metrics").toBeGreaterThan(0);
      expect(metrics.overlay.lines.length, "CodeMirror line metrics").toBeGreaterThan(0);

      if (strict && knownMismatch === undefined && isCoreSupportedFixture(fixture.category)) {
        expect(report.geometry.lines.countDelta, "line count delta").toBe(0);
        expect(report.geometry.lines.maxTopDelta, "line top delta").toBeLessThanOrEqual(1);
        expect(report.geometry.lines.maxHeightDelta, "line height delta").toBeLessThanOrEqual(1);
        expect(report.pixel.mismatchRatio, "pixel mismatch ratio").toBeLessThanOrEqual(
          strictMaxPixelMismatchRatio,
        );
      }
    });
  }
});

async function openFixture(page: Page, fixtureId: string): Promise<void> {
  await page.goto(`/?mode=visual-parity&fixture=${encodeURIComponent(fixtureId)}`);
  await page.locator("[data-vp-ready='true']").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

function compareRects(left: RectMetrics[], right: RectMetrics[]): RectComparison {
  const count = Math.min(left.length, right.length);
  let maxTopDelta = 0;
  let maxLeftDelta = 0;
  let maxWidthDelta = 0;
  let maxHeightDelta = 0;

  for (let index = 0; index < count; index += 1) {
    const leftRect = left[index]!;
    const rightRect = right[index]!;
    maxTopDelta = Math.max(maxTopDelta, Math.abs(leftRect.top - rightRect.top));
    maxLeftDelta = Math.max(maxLeftDelta, Math.abs(leftRect.left - rightRect.left));
    maxWidthDelta = Math.max(maxWidthDelta, Math.abs(leftRect.width - rightRect.width));
    maxHeightDelta = Math.max(maxHeightDelta, Math.abs(leftRect.height - rightRect.height));
  }

  return {
    leftCount: left.length,
    rightCount: right.length,
    countDelta: right.length - left.length,
    maxTopDelta: round(maxTopDelta),
    maxLeftDelta: round(maxLeftDelta),
    maxWidthDelta: round(maxWidthDelta),
    maxHeightDelta: round(maxHeightDelta),
  };
}

function diffScreenshots(
  premarkPath: string,
  overlayPath: string,
  diffPath: string,
): PixelComparison {
  const premark = PNG.sync.read(readFileSync(premarkPath));
  const overlay = PNG.sync.read(readFileSync(overlayPath));
  const width = Math.max(premark.width, overlay.width);
  const height = Math.max(premark.height, overlay.height);
  const normalizedPremark = normalizePng(premark, width, height);
  const normalizedOverlay = normalizePng(overlay, width, height);
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(
    normalizedPremark.data,
    normalizedOverlay.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.4,
    },
  );
  writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    width,
    height,
    mismatchedPixels,
    mismatchRatio: round(mismatchedPixels / Math.max(1, width * height)),
  };
}

function normalizePng(source: PNG, width: number, height: number): PNG {
  const output = new PNG({ width, height, fill: true });
  output.data.fill(255);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (source.width * y + x) << 2;
      const outputIndex = (width * y + x) << 2;
      output.data[outputIndex] = source.data[sourceIndex];
      output.data[outputIndex + 1] = source.data[sourceIndex + 1];
      output.data[outputIndex + 2] = source.data[sourceIndex + 2];
      output.data[outputIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  return output;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isCoreSupportedFixture(category: string): boolean {
  return ["paragraph", "text", "heading", "inline", "list", "blockquote", "code"].includes(
    category,
  );
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
