import type { EditorDocumentState } from "./editor-state.ts";
import { createGraphemeSegments } from "./grapheme.ts";
import type { NormalizedInputIntent } from "./input-trace.ts";

export interface PointerSelectionSession {
  readonly anchorOffset: number;
}

export function beginPointerSelection(
  editor: EditorDocumentState,
  x: number,
  y: number,
): PointerSelectionSession {
  const hit = editor.editableIndex.hitTest(x, y);
  editor.setSelection(hit.offset, hit.offset);
  return {
    anchorOffset: hit.offset,
  };
}

export function updatePointerSelection(
  editor: EditorDocumentState,
  session: PointerSelectionSession,
  x: number,
  y: number,
): void {
  const hit = editor.editableIndex.hitTest(x, y);
  editor.setSelection(session.anchorOffset, hit.offset);
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
    case "line":
      return moveByLine(editor, headOffset, intent.key);
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

function moveToDocumentBoundary(text: string, key: string): number | null {
  if (key === "ArrowUp" || key === "ArrowLeft") {
    return 0;
  }
  if (key === "ArrowDown" || key === "ArrowRight") {
    return text.length;
  }
  return null;
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
