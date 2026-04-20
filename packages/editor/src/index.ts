export { createCompositionSession, CompositionSession } from "./composition.ts";
export {
  applyEditOperation,
  deleteRangeOperation,
  insertTextOperation,
  replaceRangeOperation,
} from "./edit-ops.ts";
export {
  createEditorDocumentState,
  createInMemoryEditorDocumentState,
  EditorDocumentState,
} from "./editor-state.ts";
export { createEditableLayoutIndex, EditableLayoutIndex } from "./editable-layout.ts";
export type { CaretRect, EditableFragment, HitTestResult, Rect } from "./editable-layout.ts";
export {
  createInMemoryTextDocumentAdapter,
  InMemoryTextDocumentAdapter,
} from "./memory-adapter.ts";
export {
  createGraphemeSegments,
  graphemeDeleteBackwardRange,
  graphemeDeleteForwardRange,
  snapOffsetToGraphemeBoundary,
} from "./grapheme.ts";
export {
  applyTextareaBridgeChange,
  createTextareaBridgeSnapshot,
  deriveTextareaBridgeEdit,
  sourceOffsetToTextareaOffset,
  textareaOffsetToSourceOffset,
} from "./input-bridge.ts";
export type {
  ApplyTextareaBridgeChangeOptions,
  TextareaBridgeEdit,
  TextareaBridgeMode,
  TextareaBridgeSnapshot,
} from "./input-bridge.ts";
export { InputEventTraceRecorder, normalizeInputTrace } from "./input-trace.ts";
export {
  createResolvedRange,
  defaultRangeOptions,
  normalizeRange,
  selectionDirection,
  transformStableRangeRecord,
} from "./ranges.ts";
export {
  applyKeyboardSelectionIntent,
  beginPointerSelection,
  updatePointerSelection,
} from "./selection-commands.ts";
export type { PointerSelectionSession } from "./selection-commands.ts";
export { createSelectionGeometry } from "./selection-geometry.ts";
export type { SelectionGeometry } from "./selection-geometry.ts";
export { LocalUndoManager } from "./undo.ts";
export type {
  InputTraceEvent,
  NormalizedInputIntent,
  TraceClipboardEventType,
  TraceCompositionEventType,
  TraceInputEventType,
  TraceKeyboardEventType,
} from "./input-trace.ts";
export type * from "./types.ts";
