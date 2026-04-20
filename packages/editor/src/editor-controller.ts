import type { DocumentLayout, StyleConfig } from "@pretext-md/layout";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";

import {
  createEditableLayoutIndex,
  type EditableLayoutIndex,
  type Rect,
} from "./editable-layout.ts";
import { applyEditOperation } from "./edit-ops.ts";
import {
  createEditorDocumentState,
  type EditorDocumentState,
  type EditorDocumentStateOptions,
  type EditorDocumentSetViewportOptions,
  type EditorViewportState,
} from "./editor-state.ts";
import {
  applyInputIntent,
  toggleTaskCheckbox as toggleTaskCheckboxIntent,
  type AppliedInputIntent,
} from "./input-commands.ts";
import type { NormalizedInputIntent } from "./input-trace.ts";
import { createActiveMarkerRevealMarkdown, type ActiveMarkdownControl } from "./marker-reveal.ts";
import { createLayoutDirtyRects } from "./render-dirty-regions.ts";
import { LocalUndoManager } from "./undo.ts";
import type {
  AppliedEditOperation,
  CompositionView,
  DocumentChangeEvent,
  EditOperation,
  ResolvedRange,
  SourceRange,
  TextChange,
  Unsubscribe,
} from "./types.ts";

export interface PremarkEditorControllerOptions extends EditorDocumentStateOptions {
  readonly undoManager?: LocalUndoManager;
}

export interface PremarkEditorControllerFromStateOptions {
  readonly state: EditorDocumentState;
  readonly undoManager?: LocalUndoManager;
}

export type CreatePremarkEditorControllerOptions =
  | PremarkEditorControllerOptions
  | PremarkEditorControllerFromStateOptions;

export interface PremarkEditorSelectionSnapshot {
  readonly anchorOffset: number;
  readonly headOffset: number;
  readonly from: number;
  readonly to: number;
  readonly direction: ResolvedRange["direction"];
  readonly isCollapsed: boolean;
}

export interface PremarkEditorRenderSnapshotOptions {
  readonly activeControls?: boolean;
  readonly composition?: boolean;
}

export interface PremarkEditorRenderSnapshot {
  readonly markdown: string;
  readonly viewMarkdown: string;
  readonly renderMode: "source" | "active-controls" | "composition";
  readonly version: number;
  readonly selection: PremarkEditorSelectionSnapshot;
  readonly compositionView: CompositionView | null;
  readonly compositionRects: readonly Rect[];
  readonly activeControls: readonly ActiveMarkdownControl[];
  readonly layout: DocumentLayout;
  readonly editableIndex: EditableLayoutIndex;
  readonly viewport: EditorViewportState;
  readonly renderUpdate: {
    readonly layout: DocumentLayout["update"] | null;
    readonly editableIndex: EditableLayoutIndex["update"];
    readonly dirtyRects: readonly Rect[];
  };
}

export interface PremarkEditorChangeEvent {
  readonly type: "change";
  readonly document: DocumentChangeEvent;
  readonly snapshot: PremarkEditorRenderSnapshot;
}

export interface PremarkEditorSelectionChangeEvent {
  readonly type: "selectionchange";
  readonly selection: PremarkEditorSelectionSnapshot;
  readonly snapshot: PremarkEditorRenderSnapshot;
}

export interface PremarkEditorCompositionChangeEvent {
  readonly type: "compositionchange";
  readonly compositionView: CompositionView | null;
  readonly snapshot: PremarkEditorRenderSnapshot;
}

export interface PremarkEditorViewportChangeEvent {
  readonly type: "viewportchange";
  readonly viewport: PremarkEditorRenderSnapshot["viewport"];
  readonly snapshot: PremarkEditorRenderSnapshot;
}

export type PremarkEditorEvent =
  | PremarkEditorChangeEvent
  | PremarkEditorSelectionChangeEvent
  | PremarkEditorCompositionChangeEvent
  | PremarkEditorViewportChangeEvent;

export interface PremarkEditorEventMap {
  readonly change: PremarkEditorChangeEvent;
  readonly selectionchange: PremarkEditorSelectionChangeEvent;
  readonly compositionchange: PremarkEditorCompositionChangeEvent;
  readonly viewportchange: PremarkEditorViewportChangeEvent;
}

export interface PremarkEditorSetMarkdownOptions {
  readonly selection?: {
    readonly anchor: number;
    readonly head: number;
  };
  readonly recordUndo?: boolean;
}

export interface PremarkEditorApplyEditOptions {
  readonly recordUndo?: boolean;
  readonly selection?:
    | "preserve"
    | "inserted-end"
    | {
        readonly anchor: number;
        readonly head: number;
      };
}

export type PremarkEditorSetViewportOptions = EditorDocumentSetViewportOptions;

export interface PremarkEditorRemotePatchChange extends SourceRange {
  readonly insert: string;
}

export interface PremarkEditorApplyRemotePatchOptions {
  readonly origin?: "remote" | "ai";
  readonly actorId?: string;
  readonly changes: readonly PremarkEditorRemotePatchChange[];
  readonly cancelCompositionOnConflict?: boolean;
}

export interface PremarkEditorRemotePatchResult {
  readonly origin: "remote" | "ai";
  readonly actorId?: string;
  readonly changes: readonly TextChange[];
  readonly beforeSelection: PremarkEditorSelectionSnapshot;
  readonly afterSelection: PremarkEditorSelectionSnapshot;
  readonly composition: "none" | "preserved" | "conflict" | "canceled";
  readonly snapshot: PremarkEditorRenderSnapshot;
}

export class PremarkEditorController {
  private readonly state: EditorDocumentState;

  private readonly undoManager: LocalUndoManager;

  private readonly unsubscribeDocument: Unsubscribe;

  private readonly listeners = new Map<
    keyof PremarkEditorEventMap,
    Set<(event: PremarkEditorEvent) => void>
  >();

  private mutationDepth = 0;

  private readonly queuedDocumentEvents: DocumentChangeEvent[] = [];

  constructor(state: EditorDocumentState, undoManager = new LocalUndoManager()) {
    this.state = state;
    this.undoManager = undoManager;
    this.unsubscribeDocument = state.adapter.subscribe((event) => {
      if (this.mutationDepth > 0) {
        this.queuedDocumentEvents.push(event);
        return;
      }
      this.emitDocumentChange(event);
    });
  }

  markdown(): string {
    return this.state.markdown;
  }

  version(): number {
    return this.state.version;
  }

  selection(): PremarkEditorSelectionSnapshot {
    const resolved = this.state.adapter.resolveRange(this.state.selection.range);
    return {
      anchorOffset: resolved.anchor,
      headOffset: resolved.head,
      from: resolved.from,
      to: resolved.to,
      direction: resolved.direction,
      isCollapsed: resolved.isCollapsed,
    };
  }

  renderSnapshot(options: PremarkEditorRenderSnapshotOptions = {}): PremarkEditorRenderSnapshot {
    const compositionView = this.state.compositionView;
    if (options.composition !== false && compositionView !== null) {
      const parseState = createIncrementalParseState(compositionView.virtualText);
      const layout = this.state.layoutMarkdownView(compositionView.virtualText);
      const editableIndex = createEditableLayoutIndex({
        markdown: compositionView.virtualText,
        layout,
        blockSpans: parseState.blockSpans,
        inlineSources: createMarkdownInlineSourceMap(parseState),
        viewport: this.state.editableViewport,
      });
      return this.createRenderSnapshot({
        viewMarkdown: compositionView.virtualText,
        renderMode: "composition",
        compositionView,
        compositionRects:
          compositionView.preeditText.length === 0
            ? []
            : editableIndex.sourceRangeToSelectionRects({
                from: compositionView.replacementRange.from,
                to: compositionView.replacementRange.from + compositionView.preeditText.length,
              }),
        activeControls: [],
        layout,
        editableIndex,
      });
    }

    if (options.activeControls !== false) {
      const reveal = createActiveMarkerRevealMarkdown({
        markdown: this.state.markdown,
        inlineSources: this.state.inlineSources,
        blockSpans: this.state.parseState.blockSpans,
        selectionRange: this.state.selectionSourceRange,
      });
      if (reveal.markerState === "active") {
        const layout = this.state.layoutMarkdownView(reveal.markdown);
        return this.createRenderSnapshot({
          viewMarkdown: reveal.markdown,
          renderMode: "active-controls",
          compositionView: null,
          compositionRects: [],
          activeControls: reveal.activeControls,
          layout,
          editableIndex: createEditableLayoutIndex({
            markdown: this.state.markdown,
            layout,
            blockSpans: this.state.parseState.blockSpans,
            inlineSources: this.state.inlineSources,
            sourceMap: reveal.sourceMap,
            viewport: this.state.editableViewport,
          }),
        });
      }
    }

    return this.createRenderSnapshot({
      viewMarkdown: this.state.markdown,
      renderMode: "source",
      compositionView: null,
      compositionRects: [],
      activeControls: [],
      layout: this.state.layout,
      editableIndex: this.state.editableIndex,
    });
  }

  private createRenderSnapshot(input: {
    readonly viewMarkdown: string;
    readonly renderMode: PremarkEditorRenderSnapshot["renderMode"];
    readonly compositionView: CompositionView | null;
    readonly compositionRects: readonly Rect[];
    readonly activeControls: readonly ActiveMarkdownControl[];
    readonly layout: DocumentLayout;
    readonly editableIndex: EditableLayoutIndex;
  }): PremarkEditorRenderSnapshot {
    return {
      markdown: this.state.markdown,
      viewMarkdown: input.viewMarkdown,
      renderMode: input.renderMode,
      version: this.state.version,
      selection: this.selection(),
      compositionView: input.compositionView,
      compositionRects: input.compositionRects,
      activeControls: input.activeControls,
      layout: input.layout,
      editableIndex: input.editableIndex,
      viewport: this.state.viewport,
      renderUpdate: {
        layout: input.layout.update ?? null,
        editableIndex: input.editableIndex.update,
        dirtyRects: createLayoutDirtyRects(input.layout, this.state.viewport),
      },
    };
  }

  on<K extends keyof PremarkEditorEventMap>(
    type: K,
    listener: (event: PremarkEditorEventMap[K]) => void,
  ): Unsubscribe {
    let listenersForType = this.listeners.get(type);
    if (listenersForType === undefined) {
      listenersForType = new Set();
      this.listeners.set(type, listenersForType);
    }
    listenersForType.add(listener as (event: PremarkEditorEvent) => void);
    return () => {
      listenersForType?.delete(listener as (event: PremarkEditorEvent) => void);
    };
  }

  setMarkdown(markdown: string, options: PremarkEditorSetMarkdownOptions = {}): TextChange | null {
    if (markdown === this.state.markdown) {
      if (options.selection !== undefined) {
        this.setSelection(options.selection.anchor, options.selection.head);
      }
      return null;
    }

    let change: TextChange | null = null;
    this.runDocumentMutation(() => {
      const applied = applyEditOperation(this.state.adapter, {
        type: "replace",
        range: { from: 0, to: this.state.markdown.length },
        insert: markdown,
      });
      change = applied.change;
      if (options.recordUndo === true) {
        this.undoManager.recordApplied(this.state.adapter, applied);
      }
      if (options.selection !== undefined) {
        this.state.setSelection(options.selection.anchor, options.selection.head);
      }
    });
    return change;
  }

  setSelection(anchor: number, head: number): void {
    this.state.setSelection(anchor, head);
    this.emitSelectionChange();
  }

  setCaret(offset: number): void {
    this.setSelection(offset, offset);
  }

  replaceSelection(
    insert: string,
    options: { readonly recordUndo?: boolean } = {},
  ): AppliedEditOperation {
    let applied: AppliedEditOperation | undefined;
    this.runDocumentMutation(() => {
      applied = applyEditOperation(this.state.adapter, {
        type: "replace",
        range: this.state.selection.range,
        insert,
      });
      if (options.recordUndo !== false) {
        this.undoManager.recordApplied(this.state.adapter, applied);
      }
      this.state.setSelection(applied.insertedRange.to, applied.insertedRange.to);
    });
    if (applied === undefined) {
      throw new Error("replaceSelection did not apply an edit");
    }
    return applied;
  }

  applyEdit(
    operation: EditOperation,
    options: PremarkEditorApplyEditOptions = {},
  ): AppliedEditOperation {
    let applied: AppliedEditOperation | undefined;
    this.runDocumentMutation(() => {
      applied = applyEditOperation(this.state.adapter, operation);
      if (options.recordUndo !== false) {
        this.undoManager.recordApplied(this.state.adapter, applied);
      }
      if (options.selection === "inserted-end") {
        this.state.setSelection(applied.insertedRange.to, applied.insertedRange.to);
      } else if (typeof options.selection === "object") {
        this.state.setSelection(options.selection.anchor, options.selection.head);
      }
    });
    if (applied === undefined) {
      throw new Error("applyEdit did not apply an edit");
    }
    return applied;
  }

  applyRemotePatch(options: PremarkEditorApplyRemotePatchOptions): PremarkEditorRemotePatchResult {
    const beforeSelection = this.selection();
    const hadComposition = this.state.compositionView !== null;
    let changes: readonly TextChange[] = [];

    this.runDocumentMutation(() => {
      const orderedChanges = [...options.changes].sort(
        (left, right) => right.from - left.from || right.to - left.to,
      );
      changes = this.state.adapter.transact((tx) => {
        for (const change of orderedChanges) {
          tx.replaceRange({ from: change.from, to: change.to }, change.insert);
        }
      });
    });

    let composition: PremarkEditorRemotePatchResult["composition"] = "none";
    const compositionView = this.state.compositionView;
    if (hadComposition || compositionView !== null) {
      if (compositionView?.hasConflict === true) {
        if (options.cancelCompositionOnConflict === true) {
          this.state.cancelComposition();
          composition = "canceled";
        } else {
          composition = "conflict";
        }
      } else {
        composition = compositionView === null ? "none" : "preserved";
      }
      this.emitCompositionChange();
    }

    return {
      origin: options.origin ?? "remote",
      actorId: options.actorId,
      changes,
      beforeSelection,
      afterSelection: this.selection(),
      composition,
      snapshot: this.renderSnapshot(),
    };
  }

  applyInputIntent(intent: NormalizedInputIntent): AppliedInputIntent {
    const applied = this.runDocumentMutation(() =>
      applyInputIntent(this.state, intent, { undoManager: this.undoManager }),
    );
    if (applied.type === "selection") {
      this.emitSelectionChange();
    }
    if (
      applied.type === "composition-start" ||
      applied.type === "composition-update" ||
      applied.type === "composition-commit" ||
      applied.type === "composition-cancel"
    ) {
      this.emitCompositionChange();
    }
    return applied;
  }

  toggleTaskCheckbox(offset = this.selection().from): AppliedInputIntent {
    return this.runDocumentMutation(() =>
      toggleTaskCheckboxIntent(this.state, offset, { undoManager: this.undoManager }),
    );
  }

  undo(): boolean {
    const didUndo = this.runDocumentMutation(() => this.undoManager.undo(this.state.adapter));
    if (didUndo) {
      this.emitSelectionChange();
    }
    return didUndo;
  }

  redo(): boolean {
    const didRedo = this.runDocumentMutation(() => this.undoManager.redo(this.state.adapter));
    if (didRedo) {
      this.emitSelectionChange();
    }
    return didRedo;
  }

  startComposition(): void {
    this.state.startComposition();
    this.emitCompositionChange();
  }

  updateComposition(preeditText: string): CompositionView {
    const view = this.state.updateComposition(preeditText);
    this.emitCompositionChange();
    return view;
  }

  commitComposition(text?: string): TextChange {
    const change = this.runDocumentMutation(() => this.state.commitComposition(text));
    this.undoManager.recordChange(this.state.adapter, change);
    this.emitCompositionChange();
    return change;
  }

  cancelComposition(): void {
    this.state.cancelComposition();
    this.emitCompositionChange();
  }

  resize(containerWidth: number): void {
    this.state.resize(containerWidth);
    this.emitViewportChange();
  }

  setViewport(options: PremarkEditorSetViewportOptions): void {
    this.state.setViewport(options);
    this.emitViewportChange();
  }

  dispose(): void {
    this.unsubscribeDocument();
    this.undoManager.clear(this.state.adapter);
    this.listeners.clear();
    this.queuedDocumentEvents.length = 0;
  }

  private runDocumentMutation<T>(mutate: () => T): T {
    this.mutationDepth += 1;
    try {
      return mutate();
    } finally {
      this.mutationDepth -= 1;
      if (this.mutationDepth === 0) {
        this.flushDocumentEvents();
      }
    }
  }

  private flushDocumentEvents(): void {
    const events = this.queuedDocumentEvents.splice(0);
    for (const event of events) {
      this.emitDocumentChange(event);
    }
    if (events.length > 0) {
      this.emitSelectionChange();
    }
  }

  private emitDocumentChange(document: DocumentChangeEvent): void {
    this.emit("change", {
      type: "change",
      document,
      snapshot: this.renderSnapshot(),
    });
  }

  private emitSelectionChange(): void {
    this.emit("selectionchange", {
      type: "selectionchange",
      selection: this.selection(),
      snapshot: this.renderSnapshot(),
    });
  }

  private emitCompositionChange(): void {
    this.emit("compositionchange", {
      type: "compositionchange",
      compositionView: this.state.compositionView,
      snapshot: this.renderSnapshot(),
    });
  }

  private emitViewportChange(): void {
    this.emit("viewportchange", {
      type: "viewportchange",
      viewport: this.state.viewport,
      snapshot: this.renderSnapshot(),
    });
  }

  private emit<K extends keyof PremarkEditorEventMap>(
    type: K,
    event: PremarkEditorEventMap[K],
  ): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

export function createPremarkEditorController(
  options: CreatePremarkEditorControllerOptions,
): PremarkEditorController {
  if ("state" in options) {
    return new PremarkEditorController(options.state, options.undoManager);
  }

  return new PremarkEditorController(
    createEditorDocumentState({
      markdown: options.markdown,
      containerWidth: options.containerWidth,
      scrollTop: options.scrollTop,
      viewportHeight: options.viewportHeight,
      overscanY: options.overscanY,
      layoutStyle: options.layoutStyle,
      adapter: options.adapter,
    }),
    options.undoManager,
  );
}

export function createInMemoryPremarkEditorController(
  markdown: string,
  containerWidth: number,
  layoutStyle?: StyleConfig,
): PremarkEditorController {
  return createPremarkEditorController({
    markdown,
    containerWidth,
    layoutStyle,
  });
}
