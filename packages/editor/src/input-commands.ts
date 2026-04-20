import type { EditorDocumentState } from "./editor-state.ts";
import { applyEditOperation } from "./edit-ops.ts";
import { graphemeDeleteBackwardRange, graphemeDeleteForwardRange } from "./grapheme.ts";
import type { NormalizedInputIntent } from "./input-trace.ts";
import { applyKeyboardSelectionIntent } from "./selection-commands.ts";
import type { LocalUndoManager } from "./undo.ts";
import type { AppliedEditOperation, CompositionView, SourceRange, TextChange } from "./types.ts";

export type AppliedInputIntent =
  | { readonly type: "edit"; readonly applied: AppliedEditOperation }
  | { readonly type: "selection" }
  | { readonly type: "composition-start" }
  | { readonly type: "composition-update"; readonly view: CompositionView }
  | { readonly type: "composition-commit"; readonly change: TextChange }
  | { readonly type: "composition-cancel" }
  | { readonly type: "history"; readonly action: "undo" | "redo" }
  | { readonly type: "ignored" };

export interface ApplyInputIntentOptions {
  readonly undoManager?: LocalUndoManager;
}

export function applyInputIntent(
  editor: EditorDocumentState,
  intent: NormalizedInputIntent,
  options: ApplyInputIntentOptions = {},
): AppliedInputIntent {
  switch (intent.type) {
    case "insert-text":
      return replaceSelection(editor, intent.text, options);
    case "insert-paragraph":
      return replaceSelection(editor, "\n\n", options);
    case "delete":
      return applyDeleteIntent(editor, intent.direction, options);
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
      {
        const change = editor.commitComposition(intent.text);
        options.undoManager?.recordChange(editor.adapter, change);
        return {
          type: "composition-commit",
          change,
        };
      }
    case "history":
      if (options.undoManager === undefined) {
        return { type: "ignored" };
      }
      if (intent.action === "undo") {
        return options.undoManager.undo(editor.adapter)
          ? { type: "history", action: "undo" }
          : { type: "ignored" };
      }
      return options.undoManager.redo(editor.adapter)
        ? { type: "history", action: "redo" }
        : { type: "ignored" };
    case "composition-cancel":
      editor.cancelComposition();
      return { type: "composition-cancel" };
    case "clipboard":
      return { type: "ignored" };
  }
}

function replaceSelection(
  editor: EditorDocumentState,
  insert: string,
  options: ApplyInputIntentOptions,
): AppliedInputIntent {
  const applied = applySourceEdit(
    editor,
    {
      type: "replace",
      range: editor.selection.range,
      insert,
    },
    options,
  );
  editor.setSelection(applied.insertedRange.to, applied.insertedRange.to);
  return {
    type: "edit",
    applied,
  };
}

function applySourceEdit(
  editor: EditorDocumentState,
  operation: Parameters<typeof applyEditOperation>[1],
  options: ApplyInputIntentOptions,
): AppliedEditOperation {
  const applied = applyEditOperation(editor.adapter, operation);
  options.undoManager?.recordApplied(editor.adapter, applied);
  return applied;
}

function applyDeleteIntent(
  editor: EditorDocumentState,
  direction: "backward" | "forward",
  options: ApplyInputIntentOptions,
): AppliedInputIntent {
  const selection = editor.selectionSourceRange;
  if (selection.from !== selection.to) {
    return replaceSelection(editor, "", options);
  }

  const range = deleteRange(editor.markdown, selection.from, direction);
  if (range.from === range.to) {
    return { type: "ignored" };
  }

  const applied = applySourceEdit(
    editor,
    {
      type: "delete",
      range,
    },
    options,
  );
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
