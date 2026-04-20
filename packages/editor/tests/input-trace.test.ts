import { describe, expect, it } from "vite-plus/test";

import { InputEventTraceRecorder, normalizeInputTrace } from "../src/index.ts";
import { inputTraceFixtures } from "./fixtures/input-traces.ts";

describe("normalizeInputTrace", () => {
  for (const fixture of inputTraceFixtures) {
    it(`normalizes fixture: ${fixture.name}`, () => {
      expect(normalizeInputTrace(fixture.events)).toEqual(fixture.expectedIntents);
    });
  }
});

describe("InputEventTraceRecorder", () => {
  it("captures snapshots and clears traces", () => {
    const recorder = new InputEventTraceRecorder();
    recorder.record({ type: "selectionchange", anchor: 1, head: 3 });
    recorder.record({ type: "paste", plainText: "hello" });

    expect(recorder.snapshot()).toHaveLength(2);
    expect(recorder.normalize()).toEqual([
      { type: "selection-change", anchor: 1, head: 3 },
      {
        type: "clipboard",
        action: "paste",
        plainText: "hello",
        html: undefined,
        markdown: undefined,
      },
    ]);

    recorder.clear();
    expect(recorder.snapshot()).toEqual([]);
  });
});
