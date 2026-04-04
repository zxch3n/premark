# Optimization Log

## Goal

- Reduce cold full-render time for very large Markdown documents.
- Reduce incremental update time without causing regressions in rendering output.
- Keep a running memory of what was tried, what worked, and what should be tried next.

## Loop Protocol

1. Capture a baseline benchmark and a CPU profile.
2. Identify the dominant bottleneck.
3. Optimize only that bottleneck.
4. Run `vp check --fix` and `vp test`.
5. Re-run benchmarks and compare against baseline.
6. Run rendering consistency checks.
7. If the optimization is ineffective or regresses behavior, revert it and record why.
8. If the optimization is effective, commit and push it, then start the next loop.

## Current Baseline

- Status: collected
- Large document target: ~1,000,000 characters
- Width: 720px benchmark layout, 920px canvas render previews

### Baseline Snapshot

- Date: 2026-04-04
- Tooling:
  - `vp exec jiti scripts/benchmark-million.ts --json --profile --iterations 2`
  - `vp exec node --cpu-prof --cpu-prof-dir .profiles ./node_modules/jiti/lib/jiti-cli.mjs scripts/benchmark-million.ts --iterations 1 --warmup 0`
- Chrome DevTools-compatible CPU profile:
  - `.profiles/CPU.20260404.023127.131887.0.001.cpuprofile`
- Benchmark fixture:
  - `999,822` chars
  - `28,981` source blocks
  - `33,811` normalized blocks

### Baseline Metrics

- Full render:
  - `parseStateMs`: `567.94`
  - `normalizeMs`: `43.40`
  - `layoutMeasureMs`: `4483.09`
  - `totalEngineLayoutMs`: `5084.93`
- Incremental middle insert:
  - `diffMs`: `22.83`
  - `incrementalParseMs`: `106.96`
  - `applyParseResultMs`: `71.42`
  - `layoutIncrementalMs`: `62.48`
  - `totalIncrementalLayoutMs`: `158.83`
  - `fullRerenderAfterInsertMs`: `5610.56`

### Baseline Hotspots

- Internal timing:
  - `prepare.rich`: `2288.26ms`
  - `prepare.table`: `1334.72ms`
  - `prepare.code`: `565.95ms`
  - `prepare.text`: `218.20ms`
- CPU profile top frames:
  - GC: `2375.75ms` self time
  - Pretext `buildMergedSegmentation`
  - Pretext `getFontMeasurementState`
  - local `measureTextWidth`
  - local `hashContent`

## Current Bottleneck Hypotheses

1. Table preparation still does too much repeated intrinsic-width measurement work.
2. Full layout still repeatedly prepares identical blocks across the same document.
3. `hashContent` and allocation churn are contributing to GC-heavy cold renders.

## Current Loop

- Status: loop 1 completed, loop 2 starting
- Step 1: optimize cross-index repeated block preparation
- Step 2: validate tests, benchmark deltas, and render consistency
- Step 3: decide whether further optimization is still worth the added complexity

## Loop History

### Loop 1

- Hypothesis:
  - `packages/layout/src/measure/table.ts` was re-measuring intrinsic widths with recursive `measureTextWidth()` even though `prepareRichText()` already had enough information to derive them.
- Change:
  - Added `intrinsicWidth` to `PreparedRichText`.
  - Switched table cell width estimation to reuse `prepareRichText()` output instead of recursive `measureTextWidth()`.
- Files:
  - `packages/layout/src/measure/rich-text.ts`
  - `packages/layout/src/measure/table.ts`
  - `scripts/benchmark-million.ts`
- Validation:
  - `vp check --fix`
  - `vp test`
- Benchmark result:
  - Full render `totalEngineLayoutMs`: `5084.93 -> 4582.15` (`-9.9%`)
  - Full render `layoutMeasureMs`: `4483.09 -> 3966.24` (`-11.5%`)
  - Full rerender after insert: `5610.56 -> 5070.28` (`-9.6%`)
  - `prepare.table`: `1334.72ms -> 622.79ms` (`-53.3%`)
  - `prepare.total`: `4407.14ms -> 3985.12ms` (`-9.6%`)
- Incremental note:
  - `totalIncrementalLayoutMs` moved from `158.83ms` to `168.66ms` in the 2-iteration sample. This looks like noise rather than a structural regression because the optimized path is not on the dirty blocks in this benchmark, but it needs to be watched in later loops.
- Render consistency:
  - Compared baseline `HEAD` worktree vs current working tree renders for:
    - `examples/markdown/*.md`
    - `/tmp/pretext-md-million-previews-tight/*.md`
  - Result:
    - `7` PNGs compared
    - `1` hash mismatch: `03-code-and-tables.png`
    - Pixel diff ratio on that image: `0.00285`
    - Visual inspection: no meaningful visible layout regression
- Decision:
  - Keep the change.

## Notes

- Use Chrome DevTools-compatible CPU profiles (`node --cpu-prof`) so the data can be inspected in DevTools if needed.
- Prefer changes that improve both cold render and incremental update paths.
