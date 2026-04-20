import type { EditorDocumentState } from "./editor-state.ts";
import type { CaretRect, Rect } from "./editable-layout.ts";
import type { SelectionDirection, SourceRange } from "./types.ts";

export interface SelectionGeometry {
  readonly range: SourceRange;
  readonly anchorOffset: number;
  readonly headOffset: number;
  readonly direction: SelectionDirection;
  readonly isCollapsed: boolean;
  readonly selectionRects: readonly Rect[];
  readonly caret: CaretRect | null;
  readonly anchorCaret: CaretRect;
  readonly headCaret: CaretRect;
}

export function createSelectionGeometry(editor: EditorDocumentState): SelectionGeometry {
  const resolved = editor.adapter.resolveRange(editor.selection.range);
  const range = {
    from: resolved.from,
    to: resolved.to,
  };
  const anchorCaret = editor.editableIndex.sourceOffsetToCaretRect(resolved.anchor, "before");
  const headCaret = editor.editableIndex.sourceOffsetToCaretRect(resolved.head, "after");

  return {
    range,
    anchorOffset: resolved.anchor,
    headOffset: resolved.head,
    direction: resolved.direction,
    isCollapsed: resolved.isCollapsed,
    selectionRects: resolved.isCollapsed
      ? []
      : editor.editableIndex.sourceRangeToSelectionRects(range),
    caret: resolved.isCollapsed ? headCaret : null,
    anchorCaret,
    headCaret,
  };
}
