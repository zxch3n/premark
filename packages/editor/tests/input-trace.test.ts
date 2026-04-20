import { describe, expect, it } from "vite-plus/test";

import { InputEventTraceRecorder, normalizeInputTrace } from "../src/index.ts";

describe("normalizeInputTrace", () => {
  it("normalizes Chromium/WebKit composition order", () => {
    const intents = normalizeInputTrace([
      { type: "compositionstart", data: "" },
      {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "ni",
        isComposing: true,
        cancelable: false,
      },
      { type: "compositionupdate", data: "ni" },
      {
        type: "input",
        inputType: "insertCompositionText",
        data: "ni",
        isComposing: true,
      },
      { type: "compositionend", data: "你" },
    ]);

    expect(intents).toEqual([
      { type: "composition-start" },
      { type: "composition-update", text: "ni" },
      { type: "composition-commit", text: "你" },
    ]);
  });

  it("normalizes Firefox-style input after compositionend without double commit", () => {
    const intents = normalizeInputTrace([
      { type: "compositionstart", data: "" },
      { type: "compositionupdate", data: "あ" },
      { type: "compositionend", data: "あ" },
      {
        type: "input",
        inputType: "insertCompositionText",
        data: "あ",
        isComposing: false,
      },
    ]);

    expect(intents).toEqual([
      { type: "composition-start" },
      { type: "composition-update", text: "あ" },
      { type: "composition-commit", text: "あ" },
    ]);
  });

  it("models soft-keyboard text insertion without keydown", () => {
    expect(
      normalizeInputTrace([
        {
          type: "input",
          inputType: "insertText",
          data: "autocorrected",
        },
      ]),
    ).toEqual([{ type: "insert-text", text: "autocorrected" }]);
  });

  it("normalizes browser history undo and redo input types", () => {
    expect(
      normalizeInputTrace([
        { type: "beforeinput", inputType: "historyUndo", cancelable: true },
        { type: "beforeinput", inputType: "historyRedo", cancelable: true },
      ]),
    ).toEqual([
      { type: "history", action: "undo" },
      { type: "history", action: "redo" },
    ]);
  });

  it("records keyboard selection granularity for Shift and Command arrows", () => {
    expect(
      normalizeInputTrace([
        { type: "keydown", key: "ArrowRight", shiftKey: true },
        { type: "keydown", key: "ArrowDown", shiftKey: true },
        { type: "keydown", key: "ArrowUp", shiftKey: true, metaKey: true },
      ]),
    ).toEqual([
      {
        type: "keyboard-selection",
        key: "ArrowRight",
        by: "character",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "ArrowDown",
        by: "line",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "ArrowUp",
        by: "document-boundary",
        extend: true,
      },
    ]);
  });
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
