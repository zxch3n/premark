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

1. Cold full render is now dominated by parser + normalization rather than block preparation.
2. Incremental update cost is now mostly parser-side (`simpleDiff` + `incrementalParse`) rather than layout-side.
3. Further large wins likely require parser-side or normalization-side changes, not more renderer-side micro-optimization.

## Current Loop

- Status: loop 2 completed
- Current conclusion:
  - Renderer-side cold-layout hot path has been reduced enough that parser + normalization are now the dominant cost centers.
  - Further wins are possible, but they would be a new workstream rather than a continuation of the same renderer bottleneck.
- Next candidates if optimization continues later:
  - parser-side profiling / optimization
  - normalization hashing / allocation reduction
  - fixture diversification to measure non-repetitive corpora

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

### Loop 2

- Hypothesis:
  - Cross-index duplicate blocks in the same document were still being fully re-prepared.
  - The first memoization attempt was incomplete because `sourceBlockIndex` polluted the content identity, preventing repeated blocks from sharing a memo entry.
- Change:
  - Added an engine-level bounded prepared-block LRU memo.
  - Switched content identity serialization to ignore `sourceBlockIndex`, which is not render-relevant.
  - Reused prepared blocks across different indices when their render-relevant normalized content matched exactly.
- Files:
  - `packages/layout/src/cache.ts`
  - `packages/layout/src/engine.ts`
- Validation:
  - `vp check --fix`
  - `vp test`
  - `vp run build`
- A/B against loop 1 commit `b28c685` using:
  - `vp exec jiti scripts/benchmark-million.ts --json --iterations 3`
- Benchmark result:
  - Full render `totalEngineLayoutMs`: `5046.85 -> 1171.46` (`-76.8%`)
  - Full render `layoutMeasureMs`: `4436.90 -> 502.81` (`-88.7%`)
  - Full rerender after insert: `4263.00 -> 989.78` (`-76.8%`)
  - Incremental `totalIncrementalLayoutMs`: `133.58 -> 126.18` (`-5.5%`)
  - Incremental `applyParseResultMs`: `51.21 -> 57.71` (`+12.7%`)
  - Incremental `layoutIncrementalMs`: `41.00 -> 46.45` (`+13.3%`)
  - Interpretation:
    - The incremental `apply/layout` delta is small compared with the cold-render win and stayed in the same rough band.
    - The dominant incremental cost remains parser-side, not layout-side.
- Current profile snapshot:
  - `totalMs`: `990.79`
  - `prepare.totalMs`: `2.06`
  - `layout.totalMs`: `174.19`
  - Only `8` unique blocks were actually prepared in the profiled million-char fixture, which confirms duplicate prepared-block reuse is working.
- Render consistency:
  - Compared loop 1 render output vs current render output for:
    - `examples/markdown/*.md`
    - `/tmp/pretext-md-million-previews-tight/*.md`
  - Result:
    - `7` PNGs compared
    - `0` mismatches
- Decision:
  - Keep the change.

## Stop Condition

- Renderer-side preparation is no longer the limiting factor on the million-character benchmark.
- The next biggest gains would require parser-side or normalization-side work, which is a distinct optimization track.
- For the current renderer-focused loop, this is a reasonable stop point.

## Notes

- Use Chrome DevTools-compatible CPU profiles (`node --cpu-prof`) so the data can be inspected in DevTools if needed.
- Prefer changes that improve both cold render and incremental update paths.
