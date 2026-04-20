import type { EditorDocumentState } from "./editor-state.ts";
import { applyEditOperation } from "./edit-ops.ts";
import { graphemeDeleteBackwardRange, graphemeDeleteForwardRange } from "./grapheme.ts";
import type { NormalizedInputIntent } from "./input-trace.ts";
import { applyKeyboardSelectionIntent } from "./selection-commands.ts";
import type { AppliedEditOperation, CompositionView, SourceRange, TextChange } from "./types.ts";

export type AppliedInputIntent =
  | { readonly type: "edit"; readonly applied: AppliedEditOperation }
  | { readonly type: "selection" }
  | { readonly type: "composition-start" }
  | { readonly type: "composition-update"; readonly view: CompositionView }
  | { readonly type: "composition-commit"; readonly change: TextChange }
  | { readonly type: "composition-cancel" }
  | { readonly type: "ignored" };

export function applyInputIntent(
  editor: EditorDocumentState,
  intent: NormalizedInputIntent,
): AppliedInputIntent {
  switch (intent.type) {
    case "insert-text":
      return {
        type: "edit",
        applied: editor.replaceSelection(intent.text),
      };
    case "insert-paragraph":
      return {
        type: "edit",
        applied: editor.replaceSelection("\n\n"),
      };
    case "delete":
      return applyDeleteIntent(editor, intent.direction);
    case "selection-change":
      editor.setSelection(intent.anchor, intent.head);
      return { type: "selection" };
    case "keyboard-selection":
      return applyKeyboardSelectionIntent(editor, intent)
        ? { type: "selection" }
        : { type: "ignored" };
    case "composition-start":
      editor.startComposition();
      return { type: "composition-start" };
    case "composition-update":
      return {
        type: "composition-update",
        view: editor.updateComposition(intent.text),
      };
    case "composition-commit":
      editor.updateComposition(intent.text);
      return {
        type: "composition-commit",
        change: editor.commitComposition(intent.text),
      };
    case "composition-cancel":
      editor.cancelComposition();
      return { type: "composition-cancel" };
    case "clipboard":
      return { type: "ignored" };
  }
}

function applyDeleteIntent(
  editor: EditorDocumentState,
  direction: "backward" | "forward",
): AppliedInputIntent {
  const selection = editor.selectionSourceRange;
  if (selection.from !== selection.to) {
    return {
      type: "edit",
      applied: editor.deleteSelection(),
    };
  }

  const range = deleteRange(editor.markdown, selection.from, direction);
  if (range.from === range.to) {
    return { type: "ignored" };
  }

  const applied = applyEditOperation(editor.adapter, {
    type: "delete",
    range,
  });
  editor.setSelection(range.from, range.from);
  return {
    type: "edit",
    applied,
  };
}

function deleteRange(text: string, offset: number, direction: "backward" | "forward"): SourceRange {
  return direction === "backward"
    ? graphemeDeleteBackwardRange(text, offset)
    : graphemeDeleteForwardRange(text, offset);
}
