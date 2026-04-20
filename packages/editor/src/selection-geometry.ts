import type { EditorDocumentState } from "./editor-state.ts";
import type { CaretRect, EditableLayoutIndex, Rect } from "./editable-layout.ts";
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

export function createSelectionGeometry(
  editor: EditorDocumentState,
  editableIndex: EditableLayoutIndex = editor.editableIndex,
): SelectionGeometry {
  const resolved = editor.adapter.resolveRange(editor.selection.range);
  const range = {
    from: resolved.from,
    to: resolved.to,
  };
  const anchorCaret = editableIndex.sourceOffsetToCaretRect(resolved.anchor, "before");
  const headCaret = editableIndex.sourceOffsetToCaretRect(
    resolved.head,
    resolved.isCollapsed ? "before" : "after",
  );

  return {
    range,
    anchorOffset: resolved.anchor,
    headOffset: resolved.head,
    direction: resolved.direction,
    isCollapsed: resolved.isCollapsed,
    selectionRects: resolved.isCollapsed ? [] : editableIndex.sourceRangeToSelectionRects(range),
    caret: resolved.isCollapsed ? headCaret : null,
    anchorCaret,
    headCaret,
  };
}
