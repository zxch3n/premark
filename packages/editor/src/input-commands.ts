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
      return applyInsertParagraphIntent(editor, options);
    case "delete":
      return applyDeleteIntent(editor, intent.direction, options);
    case "selection-change":
      editor.setSelection(intent.anchor, intent.head);
      return { type: "selection" };
    case "select-all":
      editor.setSelection(0, editor.markdown.length);
      return { type: "selection" };
    case "keyboard-selection":
      return applyKeyboardSelectionIntent(editor, intent)
        ? { type: "selection" }
        : { type: "ignored" };
    case "line-indent":
      return applyLineIndentIntent(editor, intent.direction, options);
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
      return applyClipboardIntent(editor, intent, options);
  }
}

export function toggleTaskCheckbox(
  editor: EditorDocumentState,
  offset = editor.selectionSourceRange.from,
  options: ApplyInputIntentOptions = {},
): AppliedInputIntent {
  const line = lineAtOffset(editor.markdown, offset);
  const marker = taskMarkerRange(line.text, line.start);
  if (marker === null) {
    return { type: "ignored" };
  }
  const next = marker.checked ? " " : "x";
  return {
    type: "edit",
    applied: applySourceEdit(
      editor,
      {
        type: "replace",
        range: {
          from: marker.checkboxOffset,
          to: marker.checkboxOffset + 1,
        },
        insert: next,
      },
      options,
    ),
  };
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

function applyInsertParagraphIntent(
  editor: EditorDocumentState,
  options: ApplyInputIntentOptions,
): AppliedInputIntent {
  const selection = editor.selectionSourceRange;
  if (selection.from !== selection.to || isInsideFencedCode(editor.markdown, selection.from)) {
    return replaceSelection(editor, "\n", options);
  }

  const line = lineAtOffset(editor.markdown, selection.from);
  const context = markdownLineContext(line.text);
  if (context === null || selection.from < line.start + context.editableContentFrom) {
    return replaceSelection(editor, "\n", options);
  }

  if (line.text.slice(context.editableContentFrom).trim().length === 0) {
    const applied = applySourceEdit(
      editor,
      {
        type: "delete",
        range: {
          from: line.start + context.emptyExitDeleteFrom,
          to: line.start + context.emptyExitDeleteTo,
        },
      },
      options,
    );
    const caret = line.start + context.emptyExitDeleteFrom;
    editor.setSelection(caret, caret);
    return {
      type: "edit",
      applied,
    };
  }

  return replaceSelection(editor, `\n${context.continuation}`, options);
}

function applyLineIndentIntent(
  editor: EditorDocumentState,
  direction: "in" | "out",
  options: ApplyInputIntentOptions,
): AppliedInputIntent {
  const selection = editor.selectionSourceRange;
  if (selection.from === selection.to && isInsideFencedCode(editor.markdown, selection.from)) {
    return replaceSelection(editor, direction === "in" ? "\t" : "", options);
  }

  const lineStarts = selectedLineStarts(editor.markdown, selection);
  let applied: AppliedEditOperation | null = null;
  for (const lineStart of lineStarts.toReversed()) {
    if (direction === "in") {
      applied = applySourceEdit(
        editor,
        {
          type: "insert",
          offset: lineStart,
          text: "  ",
        },
        options,
      );
      continue;
    }

    const deleteTo = outdentDeleteTo(editor.markdown, lineStart);
    if (deleteTo > lineStart) {
      applied = applySourceEdit(
        editor,
        {
          type: "delete",
          range: {
            from: lineStart,
            to: deleteTo,
          },
        },
        options,
      );
    }
  }

  return applied === null
    ? { type: "ignored" }
    : {
        type: "edit",
        applied,
      };
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

  const boundaryEdit = markdownBoundaryDelete(editor.markdown, selection.from, direction);
  if (boundaryEdit !== null) {
    const applied = applySourceEdit(
      editor,
      {
        type: "replace",
        range: boundaryEdit.range,
        insert: boundaryEdit.insert,
      },
      options,
    );
    editor.setSelection(boundaryEdit.caret, boundaryEdit.caret);
    return {
      type: "edit",
      applied,
    };
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

function applyClipboardIntent(
  editor: EditorDocumentState,
  intent: Extract<NormalizedInputIntent, { type: "clipboard" }>,
  options: ApplyInputIntentOptions,
): AppliedInputIntent {
  if (intent.action === "paste") {
    const text = clipboardText(intent);
    if (text.length === 0) {
      return { type: "ignored" };
    }
    return replaceSelection(editor, text, options);
  }

  if (
    intent.action === "cut" &&
    editor.selectionSourceRange.from !== editor.selectionSourceRange.to
  ) {
    return replaceSelection(editor, "", options);
  }

  return { type: "ignored" };
}

function clipboardText(
  intent: Extract<NormalizedInputIntent, { type: "clipboard"; action: "paste" }>,
): string {
  if (intent.markdown !== undefined) {
    return intent.markdown;
  }
  if (intent.plainText !== undefined) {
    return intent.plainText;
  }
  if (intent.html !== undefined) {
    return htmlToPlainText(intent.html);
  }
  return "";
}

function htmlToPlainText(html: string): string {
  return html
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll(/<\/p\s*>/giu, "\n\n")
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function deleteRange(text: string, offset: number, direction: "backward" | "forward"): SourceRange {
  return direction === "backward"
    ? graphemeDeleteBackwardRange(text, offset)
    : graphemeDeleteForwardRange(text, offset);
}

interface SourceLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface MarkdownLineContext {
  readonly continuation: string;
  readonly editableContentFrom: number;
  readonly emptyExitDeleteFrom: number;
  readonly emptyExitDeleteTo: number;
}

interface ListMarkerContext {
  readonly full: string;
  readonly indent: string;
  readonly continuation: string;
  readonly checkboxOffsetInMarker?: number;
}

interface BoundaryDelete {
  readonly range: SourceRange;
  readonly insert: string;
  readonly caret: number;
}

function lineAtOffset(text: string, offset: number): SourceLine {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
  const nextLineBreak = text.indexOf("\n", safeOffset);
  const lineEnd = nextLineBreak < 0 ? text.length : nextLineBreak;
  return {
    start: lineStart,
    end: lineEnd,
    text: text.slice(lineStart, lineEnd),
  };
}

function markdownLineContext(line: string): MarkdownLineContext | null {
  const quotePrefix = quotePrefixOf(line);
  const quoteContent = line.slice(quotePrefix.length);
  const list = listMarkerContext(quoteContent);
  if (list !== null) {
    return {
      continuation: `${quotePrefix}${list.continuation}`,
      editableContentFrom: quotePrefix.length + list.full.length,
      emptyExitDeleteFrom: quotePrefix.length + list.indent.length,
      emptyExitDeleteTo: quotePrefix.length + list.full.length,
    };
  }

  if (quotePrefix.length > 0) {
    return {
      continuation: quotePrefix,
      editableContentFrom: quotePrefix.length,
      emptyExitDeleteFrom: 0,
      emptyExitDeleteTo: quotePrefix.length,
    };
  }

  return null;
}

function quotePrefixOf(line: string): string {
  return /^(?:(?: {0,3}> ?)+)/u.exec(line)?.[0] ?? "";
}

function markdownBoundaryDelete(
  markdown: string,
  offset: number,
  direction: "backward" | "forward",
): BoundaryDelete | null {
  if (direction !== "backward") {
    return null;
  }

  return headingBoundaryDelete(markdown, offset) ?? linePrefixBoundaryDelete(markdown, offset);
}

function headingBoundaryDelete(markdown: string, offset: number): BoundaryDelete | null {
  const line = lineAtOffset(markdown, offset);
  const quotePrefix = quotePrefixOf(line.text);
  const rest = line.text.slice(quotePrefix.length);
  const match = /^([ \t]{0,3})(#{1,6})([ \t]+)/u.exec(rest);
  if (match === null) {
    return null;
  }

  const indent = match[1] ?? "";
  const markers = match[2] ?? "";
  const markerStart = line.start + quotePrefix.length + indent.length;
  const contentStart = line.start + quotePrefix.length + match[0].length;
  if (offset !== contentStart) {
    return null;
  }

  if (markers.length > 1) {
    return {
      range: {
        from: markerStart,
        to: markerStart + 1,
      },
      insert: "",
      caret: offset - 1,
    };
  }

  return {
    range: {
      from: markerStart,
      to: contentStart,
    },
    insert: "",
    caret: markerStart,
  };
}

function linePrefixBoundaryDelete(markdown: string, offset: number): BoundaryDelete | null {
  const line = lineAtOffset(markdown, offset);
  const quotePrefix = quotePrefixOf(line.text);
  const quoteContent = line.text.slice(quotePrefix.length);
  const list = listMarkerContext(quoteContent);
  if (list !== null) {
    const contentStart = line.start + quotePrefix.length + list.full.length;
    if (offset !== contentStart) {
      return null;
    }

    const prefixStart = line.start + quotePrefix.length;
    if (list.indent.length > 0) {
      const deleteTo = outdentDeleteTo(markdown, prefixStart);
      if (deleteTo > prefixStart) {
        return {
          range: {
            from: prefixStart,
            to: deleteTo,
          },
          insert: "",
          caret: offset - (deleteTo - prefixStart),
        };
      }
    }

    return {
      range: {
        from: prefixStart,
        to: contentStart,
      },
      insert: "",
      caret: prefixStart,
    };
  }

  if (quotePrefix.length === 0 || offset !== line.start + quotePrefix.length) {
    return null;
  }

  return {
    range: {
      from: line.start,
      to: line.start + quotePrefix.length,
    },
    insert: "",
    caret: line.start,
  };
}

function listMarkerContext(line: string): ListMarkerContext | null {
  const match = /^([ \t]*)(?:([-+*])|(\d+)([.)]))([ \t]+)(?:\[([ xX])\]([ \t]+))?/u.exec(line);
  if (match === null) {
    return null;
  }

  const indent = match[1] ?? "";
  const bullet = match[2];
  const orderedNumber = match[3];
  const orderedSuffix = match[4] ?? ".";
  const markerSpaces = match[5] ?? " ";
  const taskState = match[6];
  const taskSpaces = match[7] ?? "";
  const baseMarker =
    orderedNumber === undefined
      ? `${bullet}${markerSpaces}`
      : `${Number.parseInt(orderedNumber, 10) + 1}${orderedSuffix}${markerSpaces}`;
  const taskMarker = taskState === undefined ? "" : `[ ]${taskSpaces}`;
  const full = match[0];

  return {
    full,
    indent,
    continuation: `${indent}${baseMarker}${taskMarker}`,
    checkboxOffsetInMarker:
      taskState === undefined ? undefined : full.indexOf(`[${taskState}]`) + 1,
  };
}

function taskMarkerRange(
  line: string,
  lineStart: number,
): { readonly checkboxOffset: number; readonly checked: boolean } | null {
  const quotePrefix = quotePrefixOf(line);
  const list = listMarkerContext(line.slice(quotePrefix.length));
  if (list?.checkboxOffsetInMarker === undefined) {
    return null;
  }
  const checkboxOffset = lineStart + quotePrefix.length + list.checkboxOffsetInMarker;
  return {
    checkboxOffset,
    checked: line[quotePrefix.length + list.checkboxOffsetInMarker].toLowerCase() === "x",
  };
}

function selectedLineStarts(text: string, selection: SourceRange): number[] {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const lastOffset = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const firstLine = lineAtOffset(text, from);
  const lastLine = lineAtOffset(text, lastOffset);
  const starts: number[] = [];
  let current = firstLine.start;
  while (current <= lastLine.start) {
    starts.push(current);
    const next = text.indexOf("\n", current);
    if (next < 0) {
      break;
    }
    current = next + 1;
  }
  return starts;
}

function outdentDeleteTo(text: string, lineStart: number): number {
  if (text[lineStart] === "\t") {
    return lineStart + 1;
  }
  let spaces = 0;
  while (spaces < 2 && text[lineStart + spaces] === " ") {
    spaces += 1;
  }
  return lineStart + spaces;
}

function isInsideFencedCode(markdown: string, offset: number): boolean {
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let lineStart = 0;
  const safeOffset = Math.max(0, Math.min(offset, markdown.length));

  while (lineStart <= markdown.length) {
    const nextBreak = markdown.indexOf("\n", lineStart);
    const lineEnd = nextBreak < 0 ? markdown.length : nextBreak;
    const line = markdown.slice(lineStart, lineEnd);
    const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    let currentLineIsFence = false;

    if (fence !== undefined) {
      currentLineIsFence = true;
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0] ?? "";
        fenceLength = fence.length;
      } else if (fence[0] === fenceChar && fence.length >= fenceLength) {
        if (safeOffset >= lineStart && safeOffset <= lineEnd) {
          return true;
        }
        inFence = false;
      }
    }

    if (safeOffset >= lineStart && safeOffset <= lineEnd) {
      return inFence || currentLineIsFence;
    }

    if (nextBreak < 0) {
      break;
    }
    lineStart = nextBreak + 1;
  }

  return false;
}
