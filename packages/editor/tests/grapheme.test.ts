import { describe, expect, it } from "vite-plus/test";

import {
  createGraphemeSegments,
  graphemeDeleteBackwardRange,
  graphemeDeleteForwardRange,
  snapOffsetToGraphemeBoundary,
} from "../src/index.ts";

describe("grapheme sidecar", () => {
  it("segments combining marks, emoji ZWJ sequences, flags and skin tones", () => {
    const text = "e\u0301 👨‍👩‍👧‍👦 🇨🇳 👍🏽 中";
    const segments = createGraphemeSegments(text).map((segment) => segment.segment);

    expect(segments).toContain("e\u0301");
    expect(segments).toContain("👨‍👩‍👧‍👦");
    expect(segments).toContain("🇨🇳");
    expect(segments).toContain("👍🏽");
    expect(segments).toContain("中");
  });

  it("snaps offsets out of a grapheme cluster without changing source units", () => {
    const text = "a👨‍👩‍👧‍👦b";
    const clusterStart = 1;
    const insideCluster = clusterStart + 3;
    const clusterEnd = text.indexOf("b");

    expect(snapOffsetToGraphemeBoundary(text, insideCluster, "backward")).toBe(clusterStart);
    expect(snapOffsetToGraphemeBoundary(text, insideCluster, "forward")).toBe(clusterEnd);
  });

  it("creates delete ranges that do not split grapheme clusters", () => {
    const text = "a👍🏽b";
    const thumbsStart = text.indexOf("👍");
    const thumbsEnd = text.indexOf("b");

    expect(graphemeDeleteBackwardRange(text, thumbsEnd)).toEqual({
      from: thumbsStart,
      to: thumbsEnd,
    });
    expect(graphemeDeleteForwardRange(text, thumbsStart)).toEqual({
      from: thumbsStart,
      to: thumbsEnd,
    });
  });
});
