import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

interface VisualParityReport {
  fixture: {
    id: string;
  };
  geometry: {
    lines: {
      countDelta: number;
      maxTopDelta: number;
      maxHeightDelta: number;
    };
  };
  pixel: {
    mismatchRatio: number;
  };
}

const artifactRoot = "artifacts/playwright";

if (!existsSync(artifactRoot)) {
  console.log("No visual parity artifacts found. Run `vp run test:visual` first.");
  process.exit(0);
}

const reports = findReports(artifactRoot)
  .map((path) => JSON.parse(readFileSync(path, "utf8")) as VisualParityReport)
  .sort((left, right) => right.pixel.mismatchRatio - left.pixel.mismatchRatio);

console.table(
  reports.map((report) => ({
    id: report.fixture.id,
    lineCountDelta: report.geometry.lines.countDelta,
    maxTop: report.geometry.lines.maxTopDelta,
    maxHeight: report.geometry.lines.maxHeightDelta,
    pixel: report.pixel.mismatchRatio,
  })),
);

function findReports(dir: string): string[] {
  const output: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name.endsWith("-report.json")) {
      output.push(path);
      continue;
    }
    if (statSync(path).isDirectory()) {
      output.push(...findReports(path));
    }
  }
  return output;
}
