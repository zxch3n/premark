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

1. Remaining dominant hotspots are Lezer parser internals and GC, not our layout prepare path.
2. Incremental update cost is now mostly parser-side (`simpleDiff` + `incrementalParse`) rather than layout-side.
3. Runtime immutability is now intentionally disabled, so further gains likely require either parser replacement or parser-internal upstream work.
4. The streaming API still pays avoidable overhead by reconstructing `newText` and then rediscovering an append-only change via `simpleDiff`.

## Current Loop

- Status: loop 5 completed
- Current conclusion:
  - Renderer-side cold-layout hot path has been reduced to a small fraction of total cost.
  - Parser-side allocation cleanup and runtime-freeze removal both produced additional wins.
  - Stream append now has an explicit append-only fast path without weakening Lezer-based middle-edit incremental parsing.
  - The remaining largest costs are now mostly outside our direct code, inside Lezer parsing and GC.
- Next candidates if optimization continues later:
  - fixture diversification to measure non-repetitive corpora
  - parser replacement experiments
  - parser-specific allocation experiments around Lezer tree materialization
  - append-only parser state that avoids rebuilding the full concatenated source string on every push

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
- The remaining largest hotspots are:
  - Lezer `parseInline`
  - Lezer `finishLeaf`
  - Lezer `advance`
  - GC
- Runtime freeze is now intentionally off, so that tradeoff has already been taken.
- At this point, further optimization would mean attacking Lezer/GC behavior more directly, changing parser strategy, or accepting narrower Markdown semantics.

### Loop 3

- Hypothesis:
  - Even after duplicate prepared-block reuse, we still paid a noticeable parser-side allocation cost for top-level block signatures by doing `markdown.slice(...)` and string concatenation for every block.
  - Layout-side still paid a small extra cost from runtime `serializeContent` for normalized block identities.
- Change:
  - Replaced top-level block signature generation in `packages/parser/src/lezer-adapter.ts` with direct range hashing over the source string, avoiding `slice + template string`.
  - Moved normalized block content identity creation into `packages/layout/src/normalize.ts`, using a compact dual-hash builder instead of runtime `JSON.stringify`.
  - Switched layout caches and prepared-block memo to use precomputed normalized block `contentKey` / `contentHash`.
- Files:
  - `packages/parser/src/lezer-adapter.ts`
  - `packages/layout/src/normalize.ts`
  - `packages/layout/src/cache.ts`
  - `packages/layout/src/engine.ts`
- Validation:
  - `vp check --fix`
  - `vp test`
  - render consistency against loop 2 outputs: `7/7` PNGs identical
- Benchmark result:
  - Compared against loop 2 baseline (`/tmp/benchmark-loop2b.json`):
    - Full render `totalEngineLayoutMs`: `1171.46 -> 782.99` in one sample and `1171.46 -> 762.57` in a repeated sample
    - Full render `layoutMeasureMs`: `502.81 -> 89.15` in one sample and `502.81 -> 99.89` in a repeated sample
    - Full render `parseStateMs`: `587.87 -> 516.03` in one sample and `587.87 -> 465.37` in a repeated sample
    - Incremental `totalIncrementalLayoutMs`: essentially flat to slightly improved
    - Full rerender after insert: improved by `8.9%` to `26.1%` depending on sample
- Current profile snapshot:
  - Major self hotspot `serializeContent` is gone from the top of the profile.
  - Top frames are now dominated by Lezer parser internals and GC.
- Decision:
  - Keep the change.

### Loop 4

- Hypothesis:
  - Recursive runtime `Object.freeze()` across every emitted block/span tree was still an avoidable parse-side O(AST size) cost.
  - Since parser output types are already `readonly`, and the caller explicitly accepted TypeScript-only immutability, removing runtime freeze should improve parse/apply costs without affecting render output.
- Change:
  - Turned `packages/parser/src/immutable.ts` into a zero-work passthrough.
  - Removed parser tests that asserted `Object.isFrozen(...)`.
- Files:
  - `packages/parser/src/immutable.ts`
  - `packages/parser/tests/parser.test.ts`
  - `optimize.md`
- Validation:
  - `vp check --fix`
  - `vp test`
  - `vp run build`
  - render consistency against loop 3 outputs: `7/7` PNGs identical
- Benchmark result:
  - Compared against loop 3 stable baseline (`/tmp/benchmark-loop4b.json`):
    - Full render `totalEngineLayoutMs`: `762.57 -> 692.58` in one sample and `762.57 -> 689.69` in a repeated sample
    - Incremental `totalIncrementalLayoutMs`: `133.09 -> 117.92` in one sample and `133.09 -> 124.47` in a repeated sample
    - Incremental `applyParseResultMs`: `54.30 -> 39.34` in one sample and `54.30 -> 49.91` in a repeated sample
    - Full rerender after insert: `781.73 -> 796.41` in one sample and `781.73 -> 680.26` in a repeated sample
  - Interpretation:
    - The cold-render and true incremental paths improved consistently.
    - The isolated `fullRerenderAfterInsert` delta is noisy in a single sample, but improved in the repeated run and is not treated as a regression.
- Current profile snapshot:
  - Chrome DevTools-compatible CPU profile:
    - `/tmp/premark-cpuprofiles/CPU.20260404.034154.151637.0.001.cpuprofile`
  - Top sampled frames remain dominated by GC and Lezer internals:
    - GC
    - Lezer `parseInline`
    - Lezer `finishLeaf`
    - Lezer `advance`
- Decision:
  - Keep the change.
  - Runtime immutability is now TypeScript-enforced by contract rather than runtime-enforced by `Object.freeze()`.

### Loop 5

- Hypothesis:
  - LLM-style streaming append was still going through the generic `incrementalParse(state, newText)` API, which first rebuilt `newText` and then rediscovered the append-only change with `simpleDiff`.
  - An explicit append API should preserve Lezer incremental parsing for middle edits while shaving parser overhead from stream append.
- Change:
  - Added `appendIncrementalParse(previousState, chunk)` in `packages/parser/src/incremental-parser.ts`.
  - Switched `packages/parser/src/stream-parser.ts` to use the append path instead of `incrementalParse(this.state, this.state.text + chunk)`.
  - Kept `incrementalParse(previousState, newText)` unchanged for replace/middle-edit scenarios.
  - Added parser tests to assert append-path correctness and equivalence with the replace path for the same appended content.
- Files:
  - `packages/parser/src/incremental-parser.ts`
  - `packages/parser/src/index.ts`
  - `packages/parser/src/stream-parser.ts`
  - `packages/parser/tests/parser.test.ts`
- Validation:
  - `vp check --fix`
  - `vp test`
  - `vp run build`
  - render consistency against loop 4 outputs: `7/7` PNGs identical
- Benchmark result:
  - Dedicated append parser microbenchmark on a `300,000` char fixture with a `52` char chunk:
    - generic replace path median: `18.77ms`
    - append path median: `15.37ms`
    - speedup: `1.22x`
  - Existing `scripts/benchmark-million.ts` still measures a middle insert, not append, so it is not the right benchmark to expect a direct win from this change.
  - Middle-edit Lezer incremental parsing remains on the same code path as before; parser correctness tests and structural incremental tests stayed green.
- Decision:
  - Keep the change.
  - This is a streaming-path architecture improvement, not a general middle-edit benchmark optimization.

## Notes

- Use Chrome DevTools-compatible CPU profiles (`node --cpu-prof`) so the data can be inspected in DevTools if needed.
- Prefer changes that improve both cold render and incremental update paths.
