import { simpleDiff, type BlockSpan } from "@pretext-md/parser";

import type { EditorDocumentState } from "./editor-state.ts";
import { applyEditOperation } from "./edit-ops.ts";
import type { AppliedEditOperation, SourceRange } from "./types.ts";

export type TextareaBridgeMode = "active-block" | "cross-block";

export interface TextareaBridgeSnapshot {
  readonly mode: TextareaBridgeMode;
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly sourceRange: SourceRange;
  readonly selectionSourceRange: SourceRange;
}

export interface TextareaBridgeEdit {
  readonly sourceRange: SourceRange;
  readonly insert: string;
}

export function createTextareaBridgeSnapshot(editor: EditorDocumentState): TextareaBridgeSnapshot {
  const selectionSourceRange = editor.selectionSourceRange;
  const startBlock = findBlockSpanContainingSelectionEdge(
    editor,
    selectionSourceRange.from,
    "from",
  );
  const endBlock = findBlockSpanContainingSelectionEdge(
    editor,
    selectionSourceRange.to,
    selectionSourceRange.from === selectionSourceRange.to ? "from" : "to",
  );

  if (startBlock === null) {
    return {
      mode: "active-block",
      value: editor.markdown,
      selectionStart: selectionSourceRange.from,
      selectionEnd: selectionSourceRange.to,
      sourceRange: {
        from: 0,
        to: editor.markdown.length,
      },
      selectionSourceRange,
    };
  }

  if (endBlock === null || startBlock.id !== endBlock.id) {
    return {
      mode: "cross-block",
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
      sourceRange: {
        from: selectionSourceRange.from,
        to: selectionSourceRange.from,
      },
      selectionSourceRange,
    };
  }

  return {
    mode: "active-block",
    value: editor.markdown.slice(startBlock.from, startBlock.to),
    selectionStart: selectionSourceRange.from - startBlock.from,
    selectionEnd: selectionSourceRange.to - startBlock.from,
    sourceRange: {
      from: startBlock.from,
      to: startBlock.to,
    },
    selectionSourceRange,
  };
}

export function textareaOffsetToSourceOffset(
  snapshot: TextareaBridgeSnapshot,
  offset: number,
): number {
  return snapshot.sourceRange.from + clampTextareaOffset(snapshot, offset);
}

export function sourceOffsetToTextareaOffset(
  snapshot: TextareaBridgeSnapshot,
  offset: number,
): number | null {
  if (offset < snapshot.sourceRange.from || offset > snapshot.sourceRange.to) {
    return null;
  }

  return offset - snapshot.sourceRange.from;
}

export function deriveTextareaBridgeEdit(
  snapshot: TextareaBridgeSnapshot,
  nextValue: string,
): TextareaBridgeEdit | null {
  if (snapshot.mode !== "active-block") {
    return null;
  }

  const diff = simpleDiff(snapshot.value, nextValue);
  if (diff === null) {
    return null;
  }

  return {
    sourceRange: {
      from: snapshot.sourceRange.from + diff.fromA,
      to: snapshot.sourceRange.from + diff.toA,
    },
    insert: nextValue.slice(diff.fromB, diff.toB),
  };
}

export interface ApplyTextareaBridgeChangeOptions {
  readonly nextSelectionStart?: number;
  readonly nextSelectionEnd?: number;
}

export function applyTextareaBridgeChange(
  editor: EditorDocumentState,
  snapshot: TextareaBridgeSnapshot,
  nextValue: string,
  options: ApplyTextareaBridgeChangeOptions = {},
): AppliedEditOperation | null {
  if (snapshot.mode === "cross-block") {
    editor.setSelection(snapshot.selectionSourceRange.from, snapshot.selectionSourceRange.to);
    return editor.replaceSelection(nextValue);
  }

  const nextSelectionStart = options.nextSelectionStart ?? nextValue.length;
  const nextSelectionEnd = options.nextSelectionEnd ?? nextSelectionStart;
  const edit = deriveTextareaBridgeEdit(snapshot, nextValue);

  if (edit === null) {
    setSelectionFromTextareaOffsets(editor, snapshot, nextSelectionStart, nextSelectionEnd);
    return null;
  }

  const applied = applyEditOperation(editor.adapter, {
    type: "replace",
    range: edit.sourceRange,
    insert: edit.insert,
  });
  setSelectionFromTextareaOffsets(editor, snapshot, nextSelectionStart, nextSelectionEnd);
  return applied;
}

function setSelectionFromTextareaOffsets(
  editor: EditorDocumentState,
  snapshot: TextareaBridgeSnapshot,
  selectionStart: number,
  selectionEnd: number,
): void {
  const sourceStart = textareaOffsetToSourceOffsetForNextValue(snapshot, selectionStart);
  const sourceEnd = textareaOffsetToSourceOffsetForNextValue(snapshot, selectionEnd);
  const length = editor.markdown.length;
  editor.setSelection(clampOffset(sourceStart, length), clampOffset(sourceEnd, length));
}

function textareaOffsetToSourceOffsetForNextValue(
  snapshot: TextareaBridgeSnapshot,
  offset: number,
): number {
  return snapshot.sourceRange.from + Math.max(0, offset);
}

function findBlockSpanContainingSelectionEdge(
  editor: EditorDocumentState,
  offset: number,
  edge: "from" | "to",
): BlockSpan | null {
  const markdownLength = editor.markdown.length;
  const lookupOffset =
    edge === "to" && offset > 0 && offset <= markdownLength ? offset - 1 : offset;

  for (const span of editor.parseState.blockSpans) {
    if (lookupOffset >= span.from && lookupOffset < span.to) {
      return span;
    }
  }

  const lastSpan = editor.parseState.blockSpans.at(-1);
  if (lastSpan !== undefined && offset === lastSpan.to) {
    return lastSpan;
  }

  return null;
}

function clampTextareaOffset(snapshot: TextareaBridgeSnapshot, offset: number): number {
  return clampOffset(offset, snapshot.value.length);
}

function clampOffset(offset: number, max: number): number {
  return Math.min(Math.max(0, offset), max);
}
