import {
  createPremarkBrowserInputHost,
  createSelectionGeometry,
  type BrowserInputHostRenderOptions,
  type EditableLayoutIndex,
  type EditorDocumentState,
  type LocalUndoManager,
  type PremarkEditorController,
  type PremarkEditorRenderSnapshot,
  type Rect,
  type SelectionGeometry,
} from "@pretext-md/editor";

import {
  createPremarkHtmlRenderHost,
  type PremarkHtmlRenderHost,
  type PremarkHtmlRenderResult,
} from "./dom-render-host.ts";
import { renderToHtml } from "./renderer.ts";

export interface PremarkDomEditorHostOptions {
  readonly editor: EditorDocumentState;
  readonly controller: PremarkEditorController;
  readonly undoManager: LocalUndoManager;
  readonly surface: HTMLElement;
  readonly overlay: HTMLElement;
  readonly inputBridge: HTMLTextAreaElement;
  readonly contentInset?: PremarkDomEditorInset;
  readonly renderMarkdown?: (snapshot: PremarkEditorRenderSnapshot) => PremarkHtmlRenderResult;
  readonly overlayClassNames?: PremarkDomOverlayClassNames;
  readonly overlayRenderers?: PremarkDomOverlayRenderers;
  readonly onRender?: (state: PremarkDomEditorHostRenderState) => void;
}

export interface PremarkDomEditorInset {
  readonly x: number;
  readonly y: number;
}

export interface PremarkDomOverlayRenderers {
  readonly selectionRect?: (rect: Rect) => string;
  readonly caret?: (rect: Rect) => string;
  readonly compositionRect?: (rect: Rect) => string;
}

export interface PremarkDomOverlayClassNames {
  readonly selection?: string;
  readonly caret?: string;
  readonly composition?: string;
}

export interface PremarkDomEditorHostRenderState {
  readonly snapshot: PremarkEditorRenderSnapshot;
  readonly geometry: SelectionGeometry;
  readonly editableIndex: EditableLayoutIndex;
  readonly htmlHost: PremarkHtmlRenderHost;
}

export interface PremarkDomEditorHost {
  readonly htmlHost: PremarkHtmlRenderHost;
  render(options?: BrowserInputHostRenderOptions): PremarkDomEditorHostRenderState;
  dispose(): void;
  pointForSourceRange(from: number, to: number): { x: number; y: number };
}

const defaultInset: PremarkDomEditorInset = { x: 0, y: 0 };

const defaultOverlayClassNames: Required<PremarkDomOverlayClassNames> = {
  selection: "pne-selection",
  caret: "pne-caret",
  composition: "pne-composition",
};

export function createPremarkDomEditorHost(
  options: PremarkDomEditorHostOptions,
): PremarkDomEditorHost {
  return new PremarkDomEditorHostImpl(options);
}

class PremarkDomEditorHostImpl implements PremarkDomEditorHost {
  readonly htmlHost: PremarkHtmlRenderHost;

  private readonly inputHost;

  private currentEditableIndex: EditableLayoutIndex;

  constructor(private readonly options: PremarkDomEditorHostOptions) {
    this.currentEditableIndex = options.editor.editableIndex;
    this.htmlHost = createPremarkHtmlRenderHost(options.surface);
    this.inputHost = createPremarkBrowserInputHost({
      editor: options.editor,
      undoManager: options.undoManager,
      surface: options.surface,
      textarea: options.inputBridge,
      editableIndex: () => this.currentEditableIndex,
      pointFromEvent: (event) => this.pointFromEvent(event),
      render: (renderOptions) => {
        this.render(renderOptions);
      },
      positionBridge: (caretRect) => {
        const inset = options.contentInset ?? defaultInset;
        options.inputBridge.style.left = `${inset.x + Math.max(0, caretRect.x)}px`;
        options.inputBridge.style.top = `${inset.y + Math.max(0, caretRect.y)}px`;
        options.inputBridge.style.height = `${Math.max(16, caretRect.height)}px`;
      },
    });
    this.inputHost.install();
  }

  render(options: BrowserInputHostRenderOptions = {}): PremarkDomEditorHostRenderState {
    const snapshot = this.options.controller.renderSnapshot();
    this.currentEditableIndex = snapshot.editableIndex;
    const rendered = this.options.renderMarkdown?.(snapshot) ?? renderToHtml(snapshot.layout);

    this.options.surface.style.width = `${snapshot.layout.containerWidth}px`;
    this.options.surface.style.height = `${snapshot.layout.totalHeight}px`;
    this.options.overlay.style.width = `${snapshot.layout.containerWidth}px`;
    this.options.overlay.style.height = `${snapshot.layout.totalHeight}px`;
    this.htmlHost.render(rendered);

    const geometry = this.createGeometry(snapshot);
    this.options.overlay.innerHTML = this.renderOverlay(snapshot, geometry);
    this.syncInputBridge(snapshot, geometry, { writeValue: options.syncBridgeValue !== false });

    const state: PremarkDomEditorHostRenderState = {
      snapshot,
      geometry,
      editableIndex: snapshot.editableIndex,
      htmlHost: this.htmlHost,
    };
    this.options.onRender?.(state);
    return state;
  }

  dispose(): void {
    this.inputHost.dispose();
  }

  pointForSourceRange(from: number, to: number): { x: number; y: number } {
    const fromCaret = this.currentEditableIndex.sourceOffsetToCaretRect(from);
    const toCaret = this.currentEditableIndex.sourceOffsetToCaretRect(to, "before");
    return {
      x: (fromCaret.rect.x + toCaret.rect.x) / 2,
      y: (fromCaret.rect.y + toCaret.rect.y) / 2 + fromCaret.rect.height / 2,
    };
  }

  private pointFromEvent(event: MouseEvent): { x: number; y: number } {
    const rect = this.options.surface.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private createGeometry(snapshot: PremarkEditorRenderSnapshot): SelectionGeometry {
    if (snapshot.compositionView === null) {
      return createSelectionGeometry(this.options.editor, snapshot.editableIndex);
    }

    const caretOffset =
      snapshot.compositionView.replacementRange.from + snapshot.compositionView.preeditText.length;
    const caret = snapshot.editableIndex.sourceOffsetToCaretRect(caretOffset);
    return {
      range: { from: caretOffset, to: caretOffset },
      anchorOffset: caretOffset,
      headOffset: caretOffset,
      direction: "forward",
      isCollapsed: true,
      selectionRects: [],
      caret,
      anchorCaret: caret,
      headCaret: caret,
    };
  }

  private syncInputBridge(
    snapshot: PremarkEditorRenderSnapshot,
    geometry: SelectionGeometry,
    options: { readonly writeValue: boolean },
  ): void {
    const compositionCaret = this.compositionCaretRect(snapshot);
    const fallbackCaret = geometry.caret ?? geometry.headCaret;
    this.inputHost.syncBridge(compositionCaret ?? fallbackCaret.rect, options);
  }

  private renderOverlay(
    snapshot: PremarkEditorRenderSnapshot,
    geometry: SelectionGeometry,
  ): string {
    const composition = this.renderCompositionOverlay(snapshot.compositionRects);
    if (snapshot.compositionView !== null) {
      const caret = this.compositionCaretRect(snapshot);
      return `${composition}${caret === null ? "" : this.renderCaret(caret)}`;
    }

    const selection = geometry.selectionRects
      .map((rect) => this.renderSelectionRect(rect))
      .join("");
    return `${selection}${composition}${geometry.caret === null ? "" : this.renderCaret(geometry.caret.rect)}`;
  }

  private compositionCaretRect(snapshot: PremarkEditorRenderSnapshot): Rect | null {
    const view = snapshot.compositionView;
    if (view === null) {
      return null;
    }
    return snapshot.editableIndex.sourceOffsetToCaretRect(
      view.replacementRange.from + view.preeditText.length,
    ).rect;
  }

  private renderCompositionOverlay(rects: readonly Rect[]): string {
    if (rects.length === 0) {
      return "";
    }
    return rects.map((rect) => this.renderCompositionRect(rect)).join("");
  }

  private renderSelectionRect(rect: Rect): string {
    const className = this.overlayClassNames().selection;
    return (
      this.options.overlayRenderers?.selectionRect?.(rect) ??
      `<div class="${className}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px"></div>`
    );
  }

  private renderCaret(rect: Rect): string {
    const className = this.overlayClassNames().caret;
    return (
      this.options.overlayRenderers?.caret?.(rect) ??
      `<div class="${className}" style="left:${rect.x}px;top:${rect.y}px;height:${rect.height}px"></div>`
    );
  }

  private renderCompositionRect(rect: Rect): string {
    const className = this.overlayClassNames().composition;
    return (
      this.options.overlayRenderers?.compositionRect?.(rect) ??
      `<div class="${className}" style="left:${rect.x}px;top:${rect.y + rect.height - 3}px;width:${rect.width}px"></div>`
    );
  }

  private overlayClassNames(): Required<PremarkDomOverlayClassNames> {
    return {
      ...defaultOverlayClassNames,
      ...this.options.overlayClassNames,
    };
  }
}
