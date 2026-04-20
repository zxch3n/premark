import type { EditorDocumentState } from "./editor-state.ts";
import type { EditableLayoutIndex } from "./editable-layout.ts";
import { createGraphemeSegments, snapOffsetToGraphemeBoundary } from "./grapheme.ts";
import type { NormalizedInputIntent } from "./input-trace.ts";
import { createWordSegments } from "./text-segments.ts";

export interface PointerSelectionSession {
  readonly anchorOffset: number;
}

export function beginPointerSelection(
  editor: EditorDocumentState,
  x: number,
  y: number,
  editableIndex: EditableLayoutIndex = editor.editableIndex,
): PointerSelectionSession {
  const offset = hitTestGraphemeOffset(editor, editableIndex, x, y);
  editor.setSelection(offset, offset);
  return {
    anchorOffset: offset,
  };
}

export function updatePointerSelection(
  editor: EditorDocumentState,
  session: PointerSelectionSession,
  x: number,
  y: number,
  editableIndex: EditableLayoutIndex = editor.editableIndex,
): void {
  const offset = hitTestGraphemeOffset(editor, editableIndex, x, y);
  editor.setSelection(session.anchorOffset, offset);
}

export function applyKeyboardSelectionIntent(
  editor: EditorDocumentState,
  intent: NormalizedInputIntent,
): boolean {
  if (intent.type !== "keyboard-selection") {
    return false;
  }

  const resolved = editor.adapter.resolveRange(editor.selection.range);
  const target = keyboardTargetOffset(editor, intent, resolved.head);
  if (target === null) {
    return false;
  }

  if (intent.extend) {
    editor.setSelection(resolved.anchor, target);
    return true;
  }

  editor.setSelection(target, target);
  return true;
}

function keyboardTargetOffset(
  editor: EditorDocumentState,
  intent: Extract<NormalizedInputIntent, { type: "keyboard-selection" }>,
  headOffset: number,
): number | null {
  const resolved = editor.adapter.resolveRange(editor.selection.range);
  if (!intent.extend && !resolved.isCollapsed && intent.by === "character") {
    return intent.key === "ArrowLeft" ? resolved.from : resolved.to;
  }

  switch (intent.by) {
    case "character":
      return moveByCharacter(editor.markdown, headOffset, intent.key);
    case "word":
      return moveByWord(editor.markdown, headOffset, intent.key);
    case "line":
      return moveByLine(editor, headOffset, intent.key);
    case "line-boundary":
      return moveToLineBoundary(editor, headOffset, intent.key);
    case "page":
      return moveByPage(editor, headOffset, intent.key);
    case "document-boundary":
      return moveToDocumentBoundary(editor.markdown, intent.key);
  }
}

function moveByCharacter(text: string, offset: number, key: string): number | null {
  if (key === "ArrowLeft") {
    return previousGraphemeBoundary(text, offset);
  }
  if (key === "ArrowRight") {
    return nextGraphemeBoundary(text, offset);
  }
  return null;
}

function moveByWord(text: string, offset: number, key: string): number | null {
  const bounded = Math.min(Math.max(offset, 0), text.length);
  const segments = createWordSegments(text).filter((segment) => segment.isWordLike);
  if (key === "ArrowLeft") {
    for (const segment of [...segments].reverse()) {
      if (segment.from < bounded && bounded <= segment.to) {
        return segment.from;
      }
      if (segment.to < bounded) {
        return segment.from;
      }
    }
    return 0;
  }
  if (key === "ArrowRight") {
    for (const segment of segments) {
      if (segment.from <= bounded && bounded < segment.to) {
        return segment.to;
      }
      if (segment.from > bounded) {
        return segment.to;
      }
    }
    return text.length;
  }
  return null;
}

function moveByLine(editor: EditorDocumentState, offset: number, key: string): number | null {
  if (key !== "ArrowUp" && key !== "ArrowDown") {
    return null;
  }

  const caret = editor.editableIndex.sourceOffsetToCaretRect(offset);
  const direction = key === "ArrowUp" ? -1 : 1;
  const lineHeight = Math.max(caret.rect.height, 1);
  const targetY = caret.rect.y + direction * lineHeight + lineHeight / 2;
  const hit = editor.editableIndex.hitTest(caret.rect.x, targetY);
  return hit.offset;
}

function moveToLineBoundary(
  editor: EditorDocumentState,
  offset: number,
  key: string,
): number | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
    return null;
  }

  const lineRange = editor.editableIndex.sourceLineRangeAtOffset(
    offset,
    key === "ArrowLeft" || key === "Home" ? "before" : "after",
  );
  return key === "ArrowLeft" || key === "Home" ? lineRange.from : lineRange.to;
}

function moveByPage(editor: EditorDocumentState, offset: number, key: string): number | null {
  if (key !== "PageUp" && key !== "PageDown") {
    return null;
  }

  const caret = editor.editableIndex.sourceOffsetToCaretRect(offset);
  const lineHeight = Math.max(caret.rect.height, 1);
  const direction = key === "PageUp" ? -1 : 1;
  const targetY = caret.rect.y + direction * lineHeight * 8 + lineHeight / 2;
  const hit = editor.editableIndex.hitTest(caret.rect.x, targetY);
  return hit.offset;
}

function moveToDocumentBoundary(text: string, key: string): number | null {
  if (key === "ArrowUp" || key === "ArrowLeft") {
    return 0;
  }
  if (key === "ArrowDown" || key === "ArrowRight") {
    return text.length;
  }
  return null;
}

function hitTestGraphemeOffset(
  editor: EditorDocumentState,
  editableIndex: EditableLayoutIndex,
  x: number,
  y: number,
): number {
  const hit = editableIndex.hitTest(x, y);
  return snapOffsetToGraphemeBoundary(
    editor.markdown,
    hit.offset,
    hit.affinity === "before" ? "backward" : "forward",
  );
}

function previousGraphemeBoundary(text: string, offset: number): number {
  const bounded = Math.min(Math.max(offset, 0), text.length);
  let previous = 0;
  for (const segment of createGraphemeSegments(text)) {
    if (segment.from >= bounded) {
      return previous;
    }
    if (segment.to >= bounded) {
      return segment.from;
    }
    previous = segment.to;
  }
  return previous;
}

function nextGraphemeBoundary(text: string, offset: number): number {
  const bounded = Math.min(Math.max(offset, 0), text.length);
  for (const segment of createGraphemeSegments(text)) {
    if (segment.from > bounded) {
      return segment.from;
    }
    if (segment.from <= bounded && segment.to > bounded) {
      return segment.to;
    }
  }
  return text.length;
}
