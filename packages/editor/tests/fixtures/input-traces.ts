import type { InputTraceEvent, NormalizedInputIntent } from "../../src/index.ts";

export interface InputTraceFixture {
  readonly name: string;
  readonly events: readonly InputTraceEvent[];
  readonly expectedIntents: readonly NormalizedInputIntent[];
}

export const inputTraceFixtures = [
  {
    name: "chromium-webkit-composition-order",
    events: [
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
    ],
    expectedIntents: [
      { type: "composition-start" },
      { type: "composition-update", text: "ni" },
      { type: "composition-commit", text: "你" },
    ],
  },
  {
    name: "firefox-composition-input-after-end",
    events: [
      { type: "compositionstart", data: "" },
      { type: "compositionupdate", data: "あ" },
      { type: "compositionend", data: "あ" },
      {
        type: "input",
        inputType: "insertCompositionText",
        data: "あ",
        isComposing: false,
      },
    ],
    expectedIntents: [
      { type: "composition-start" },
      { type: "composition-update", text: "あ" },
      { type: "composition-commit", text: "あ" },
    ],
  },
  {
    name: "composition-cancel-empty-end",
    events: [
      { type: "compositionstart", data: "" },
      { type: "compositionupdate", data: "shi" },
      { type: "compositionend", data: "" },
    ],
    expectedIntents: [
      { type: "composition-start" },
      { type: "composition-update", text: "shi" },
      { type: "composition-cancel" },
    ],
  },
  {
    name: "soft-keyboard-insert-without-keydown",
    events: [
      {
        type: "input",
        inputType: "insertText",
        data: "autocorrected",
      },
    ],
    expectedIntents: [{ type: "insert-text", text: "autocorrected" }],
  },
  {
    name: "beforeinput-editing-commands",
    events: [
      { type: "beforeinput", inputType: "deleteContentBackward", cancelable: true },
      { type: "beforeinput", inputType: "deleteContentForward", cancelable: true },
      { type: "beforeinput", inputType: "insertParagraph", cancelable: true },
      { type: "beforeinput", inputType: "historyUndo", cancelable: true },
      { type: "beforeinput", inputType: "historyRedo", cancelable: true },
    ],
    expectedIntents: [
      { type: "delete", direction: "backward" },
      { type: "delete", direction: "forward" },
      { type: "insert-paragraph" },
      { type: "history", action: "undo" },
      { type: "history", action: "redo" },
    ],
  },
  {
    name: "textarea-insert-linebreak",
    events: [{ type: "beforeinput", inputType: "insertLineBreak", cancelable: true }],
    expectedIntents: [{ type: "insert-paragraph" }],
  },
  {
    name: "selection-and-clipboard",
    events: [
      { type: "selectionchange", anchor: 3, head: 9 },
      { type: "copy" },
      { type: "cut" },
      {
        type: "paste",
        markdown: "**bold**",
        plainText: "bold",
        html: "<strong>bold</strong>",
      },
    ],
    expectedIntents: [
      { type: "selection-change", anchor: 3, head: 9 },
      { type: "clipboard", action: "copy" },
      { type: "clipboard", action: "cut" },
      {
        type: "clipboard",
        action: "paste",
        markdown: "**bold**",
        plainText: "bold",
        html: "<strong>bold</strong>",
      },
    ],
  },
  {
    name: "keyboard-selection-granularity",
    events: [
      { type: "keydown", key: "ArrowRight", shiftKey: true },
      { type: "keydown", key: "ArrowRight", altKey: true },
      { type: "keydown", key: "ArrowDown", shiftKey: true },
      { type: "keydown", key: "ArrowLeft", shiftKey: true, metaKey: true },
      { type: "keydown", key: "ArrowUp", shiftKey: true, metaKey: true },
      { type: "keydown", key: "End", shiftKey: true },
      { type: "keydown", key: "PageDown", shiftKey: true },
      { type: "keydown", key: "a", ctrlKey: true },
    ],
    expectedIntents: [
      {
        type: "keyboard-selection",
        key: "ArrowRight",
        by: "character",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "ArrowRight",
        by: "word",
        extend: false,
      },
      {
        type: "keyboard-selection",
        key: "ArrowDown",
        by: "line",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "ArrowLeft",
        by: "line-boundary",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "ArrowUp",
        by: "document-boundary",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "End",
        by: "line-boundary",
        extend: true,
      },
      {
        type: "keyboard-selection",
        key: "PageDown",
        by: "page",
        extend: true,
      },
      { type: "select-all" },
    ],
  },
] as const satisfies readonly InputTraceFixture[];
