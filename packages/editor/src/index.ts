export { createCompositionSession, CompositionSession } from "./composition.ts";
export {
  clientPointToSurfacePoint,
  clientPointToWorldPoint,
  surfacePointToClientPoint,
  surfacePointToDevicePixel,
  worldPointToClientPoint,
} from "./coordinate-transform.ts";
export type { EditorCoordinateTransform, Point } from "./coordinate-transform.ts";
export {
  applyEditOperation,
  deleteRangeOperation,
  insertTextOperation,
  replaceRangeOperation,
} from "./edit-ops.ts";
export {
  createInMemoryPremarkEditorController,
  createPremarkEditorController,
  PremarkEditorController,
} from "./editor-controller.ts";
export type {
  CreatePremarkEditorControllerOptions,
  PremarkEditorApplyEditOptions,
  PremarkEditorChangeEvent,
  PremarkEditorCompositionChangeEvent,
  PremarkEditorControllerFromStateOptions,
  PremarkEditorControllerOptions,
  PremarkEditorEvent,
  PremarkEditorEventMap,
  PremarkEditorRenderSnapshot,
  PremarkEditorRenderSnapshotOptions,
  PremarkEditorSelectionChangeEvent,
  PremarkEditorSelectionSnapshot,
  PremarkEditorSetMarkdownOptions,
  PremarkEditorViewportChangeEvent,
} from "./editor-controller.ts";
export {
  createEditorDocumentState,
  createInMemoryEditorDocumentState,
  EditorDocumentState,
} from "./editor-state.ts";
export {
  createEditableLayoutIndex,
  createIncrementalEditableLayoutIndex,
  EditableLayoutIndex,
} from "./editable-layout.ts";
export type {
  CaretRect,
  EditableFragment,
  EditableLayoutSourceMap,
  EditableLayoutSourceMapRun,
  EditableLayoutSourceMapSegment,
  GranularHitTestResult,
  HitTestGranularity,
  HitTestResult,
  Rect,
} from "./editable-layout.ts";
export {
  createInMemoryTextDocumentAdapter,
  InMemoryTextDocumentAdapter,
} from "./memory-adapter.ts";
export { createActiveMarkerRevealMarkdown, findActiveMarkerToken } from "./marker-reveal.ts";
export type {
  ActiveMarkdownControl,
  ActiveMarkerRevealEditableRun,
  ActiveMarkerRevealMarkdown,
  ActiveMarkerRevealMarkdownInput,
  ActiveMarkerRevealSourceMap,
  ActiveMarkerRevealSourceMapSegment,
  RevealedMarkerType,
} from "./marker-reveal.ts";
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
export { applyInputIntent, toggleTaskCheckbox } from "./input-commands.ts";
export type { AppliedInputIntent, ApplyInputIntentOptions } from "./input-commands.ts";
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
  selectPointerRange,
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
