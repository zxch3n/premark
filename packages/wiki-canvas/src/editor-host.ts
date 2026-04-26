import {
  createPremarkBrowserInputHost,
  createSelectionGeometry,
  type BrowserInputHostRenderOptions,
  type EditableFragment,
  type EditableLayoutIndex,
  type EditorDocumentState,
  type LocalUndoManager,
  type PremarkEditorController,
  type PremarkEditorRenderSnapshot,
  type Rect,
  type SelectionGeometry,
} from "@pretext-md/editor";

import {
  darkTilePalette,
  drawTile,
  type TileDrawOptions,
  type TilePalette,
} from "./canvas-draw.ts";

export type PremarkCanvasDrawDocument = (
  ctx: CanvasRenderingContext2D,
  layout: PremarkEditorRenderSnapshot["layout"],
  width: number,
  height: number,
  options: TileDrawOptions,
) => void;

export interface PremarkCanvasEditorHostOptions {
  readonly editor: EditorDocumentState;
  readonly controller: PremarkEditorController;
  readonly undoManager: LocalUndoManager;
  readonly canvas: HTMLCanvasElement;
  readonly inputBridge: HTMLTextAreaElement;
  readonly width: number;
  readonly height: number;
  readonly contentPadding?: number;
  readonly viewportHeight?: number;
  readonly overscanY?: number;
  readonly initialScrollTop?: number;
  readonly pixelRatio?: number | (() => number);
  readonly wheel?:
    | boolean
    | {
        readonly enabled?: boolean;
        readonly deltaScale?: number;
      };
  readonly paint?: PremarkCanvasEditorHostPaintOptions;
  readonly onRender?: (state: PremarkCanvasEditorHostRenderState) => void;
}

export interface PremarkCanvasEditorHostPaintOptions {
  readonly palette?: TilePalette;
  readonly cardRadius?: number;
  readonly title?: string;
  readonly titleBarHeight?: number;
  readonly selectionColor?: string;
  readonly caretColor?: string;
  readonly compositionColor?: string;
  readonly showDirtyOverlay?: boolean;
  readonly dirtyOverlayColor?: string;
  readonly dirtyOverlayDash?: readonly number[];
  readonly drawDocument?: PremarkCanvasDrawDocument;
  readonly beforePaint?: (state: PremarkCanvasEditorHostPaintState) => void;
  readonly afterPaint?: (state: PremarkCanvasEditorHostPaintState) => void;
}

export interface PremarkCanvasEditorHostPaintState {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly snapshot: PremarkEditorRenderSnapshot;
  readonly geometry: SelectionGeometry;
  readonly width: number;
  readonly height: number;
  readonly contentPadding: number;
}

export interface PremarkCanvasEditorHostRenderState extends PremarkCanvasEditorHostPaintState {
  readonly editableIndex: EditableLayoutIndex;
}

export interface PremarkCanvasEditorHost {
  readonly context: CanvasRenderingContext2D;
  render(options?: BrowserInputHostRenderOptions): PremarkCanvasEditorHostRenderState;
  dispose(): void;
  resize(size: PremarkCanvasEditorHostSize): void;
  scrollTo(scrollTop: number): void;
  pointForSourceRange(from: number, to: number): { x: number; y: number };
  pointForText(text: string, edge?: "start" | "end"): { x: number; y: number };
  fragmentForText(text: string): EditableFragment;
}

export interface PremarkCanvasEditorHostSize {
  readonly width?: number;
  readonly height?: number;
  readonly viewportHeight?: number;
  readonly overscanY?: number;
  readonly scrollTop?: number;
}

const DEFAULT_CONTENT_PADDING = 28;

export function createPremarkCanvasEditorHost(
  options: PremarkCanvasEditorHostOptions,
): PremarkCanvasEditorHost {
  return new PremarkCanvasEditorHostImpl(options);
}

class PremarkCanvasEditorHostImpl implements PremarkCanvasEditorHost {
  readonly context: CanvasRenderingContext2D;

  private readonly inputHost;
  private readonly cleanups: Array<() => void> = [];
  private readonly contentPadding: number;
  private width: number;
  private height: number;
  private viewportHeight: number;
  private overscanY: number;
  private activeEditableIndex: EditableLayoutIndex;
  private lastSnapshot: PremarkEditorRenderSnapshot | null = null;
  private readonly requestImageRepaint = () => {
    if (!this.options.canvas.isConnected) return;
    this.render({ syncBridgeValue: false });
  };

  constructor(private readonly options: PremarkCanvasEditorHostOptions) {
    const ctx = options.canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Canvas 2D context is unavailable");
    }
    this.context = ctx;
    this.contentPadding = options.contentPadding ?? DEFAULT_CONTENT_PADDING;
    this.width = options.width;
    this.height = options.height;
    this.viewportHeight =
      options.viewportHeight ?? Math.max(0, this.height - this.contentPadding * 2);
    this.overscanY = options.overscanY ?? this.viewportHeight;
    this.activeEditableIndex = options.editor.editableIndex;

    options.controller.setViewport({
      scrollTop: Math.max(0, options.initialScrollTop ?? 0),
      height: this.viewportHeight,
      overscanY: this.overscanY,
    });
    this.applyPixelRatio();

    this.inputHost = createPremarkBrowserInputHost({
      editor: options.editor,
      undoManager: options.undoManager,
      surface: options.canvas,
      textarea: options.inputBridge,
      editableIndex: () => this.activeEditableIndex,
      pointFromEvent: (event) => this.pointFromEvent(event),
      render: (renderOptions) => {
        this.render(renderOptions);
      },
      positionBridge: (caretRect) => {
        options.inputBridge.style.left = `${this.contentPadding + Math.max(0, caretRect.x)}px`;
        options.inputBridge.style.top = `${this.contentPadding + Math.max(0, caretRect.y)}px`;
        options.inputBridge.style.height = `${Math.max(16, caretRect.height)}px`;
      },
    });
    this.inputHost.install();
    this.installWheel();
  }

  render(options: BrowserInputHostRenderOptions = {}): PremarkCanvasEditorHostRenderState {
    this.applyPixelRatio();
    const snapshot = this.options.controller.renderSnapshot();
    this.activeEditableIndex = snapshot.editableIndex;
    const geometry = this.createGeometry(snapshot);
    const state: PremarkCanvasEditorHostRenderState = {
      canvas: this.options.canvas,
      ctx: this.context,
      snapshot,
      geometry,
      editableIndex: snapshot.editableIndex,
      width: this.width,
      height: this.height,
      contentPadding: this.contentPadding,
    };

    this.options.paint?.beforePaint?.(state);
    this.drawDocument(state);
    if (this.options.paint?.showDirtyOverlay === true) {
      this.drawDirtyOverlay(snapshot.renderUpdate.dirtyRects, snapshot.viewport.scrollTop);
    }
    this.options.paint?.afterPaint?.(state);

    this.lastSnapshot = snapshot;
    this.syncInputBridge(snapshot, geometry, {
      writeValue: options.syncBridgeValue !== false,
    });
    this.options.onRender?.(state);
    return state;
  }

  dispose(): void {
    this.inputHost.dispose();
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
  }

  resize(size: PremarkCanvasEditorHostSize): void {
    const nextWidth = Math.max(1, size.width ?? this.width);
    const nextHeight = Math.max(1, size.height ?? this.height);
    const nextViewportHeight =
      size.viewportHeight ?? Math.max(0, nextHeight - this.contentPadding * 2);
    const nextOverscanY = size.overscanY ?? nextViewportHeight;

    if (nextWidth !== this.width) {
      this.options.controller.resize(Math.max(0, nextWidth - this.contentPadding * 2));
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.viewportHeight = Math.max(0, nextViewportHeight);
    this.overscanY = Math.max(0, nextOverscanY);

    const snapshot = this.options.controller.renderSnapshot();
    const maxScrollTop = Math.max(0, snapshot.layout.totalHeight - this.viewportHeight);
    this.options.controller.setViewport({
      scrollTop: Math.min(maxScrollTop, Math.max(0, size.scrollTop ?? snapshot.viewport.scrollTop)),
      height: this.viewportHeight,
      overscanY: this.overscanY,
    });
    this.applyPixelRatio();
  }

  scrollTo(scrollTop: number): void {
    const snapshot = this.options.controller.renderSnapshot();
    const maxScrollTop = Math.max(0, snapshot.layout.totalHeight - this.viewportHeight);
    this.options.controller.setViewport({
      scrollTop: Math.min(maxScrollTop, Math.max(0, scrollTop)),
      height: this.viewportHeight,
      overscanY: this.overscanY,
    });
    this.render();
  }

  pointForSourceRange(from: number, to: number): { x: number; y: number } {
    const fromCaret = this.activeEditableIndex.sourceOffsetToCaretRect(from);
    const toCaret = this.activeEditableIndex.sourceOffsetToCaretRect(to, "before");
    return this.viewportPointFromLayoutPoint({
      x: (fromCaret.rect.x + toCaret.rect.x) / 2,
      y: (fromCaret.rect.y + toCaret.rect.y) / 2 + fromCaret.rect.height / 2,
    });
  }

  pointForText(text: string, edge: "start" | "end" = "start"): { x: number; y: number } {
    const offset = this.options.editor.markdown.indexOf(text);
    if (offset < 0) {
      throw new Error(`Missing text: ${text}`);
    }
    const target = edge === "start" ? offset : offset + text.length;
    const caret = this.activeEditableIndex.sourceOffsetToCaretRect(target);
    return this.viewportPointFromLayoutPoint({
      x: caret.rect.x,
      y: caret.rect.y + caret.rect.height / 2,
    });
  }

  fragmentForText(text: string): EditableFragment {
    const fragment = this.activeEditableIndex.fragments.find((candidate) =>
      candidate.text.includes(text),
    );
    if (fragment === undefined) {
      throw new Error(`Missing fragment for text: ${text}`);
    }
    return fragment;
  }

  private drawDocument(state: PremarkCanvasEditorHostRenderState): void {
    const paint = this.options.paint;
    const drawDocument = paint?.drawDocument ?? drawTile;
    drawDocument(this.context, state.snapshot.layout, this.width, this.height, {
      title: paint?.title,
      titleBarHeight: paint?.titleBarHeight,
      cardRadius: paint?.cardRadius ?? 0,
      contentPadding: this.contentPadding,
      scrollY: state.snapshot.viewport.scrollTop,
      selectionRects: state.geometry.selectionRects,
      selectionColor: paint?.selectionColor ?? "rgba(52, 139, 99, 0.34)",
      caretRect: state.geometry.caret?.rect,
      caretColor: paint?.caretColor ?? "#7dd3ae",
      compositionRects: state.snapshot.compositionRects,
      compositionColor: paint?.compositionColor ?? paint?.caretColor ?? "#7dd3ae",
      palette: paint?.palette ?? darkTilePalette,
      requestRepaint: this.requestImageRepaint,
    });
  }

  private applyPixelRatio(): void {
    const ratio = this.pixelRatio();
    this.options.canvas.style.width = `${this.width}px`;
    this.options.canvas.style.height = `${this.height}px`;
    const pixelWidth = Math.round(this.width * ratio);
    const pixelHeight = Math.round(this.height * ratio);
    if (this.options.canvas.width !== pixelWidth) {
      this.options.canvas.width = pixelWidth;
    }
    if (this.options.canvas.height !== pixelHeight) {
      this.options.canvas.height = pixelHeight;
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private pixelRatio(): number {
    const ratio =
      typeof this.options.pixelRatio === "function"
        ? this.options.pixelRatio()
        : (this.options.pixelRatio ?? window.devicePixelRatio);
    return Math.max(1, ratio || 1);
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
    const fallbackCaret = geometry.caret ?? geometry.headCaret;
    this.inputHost.syncBridge(
      {
        ...fallbackCaret.rect,
        y: fallbackCaret.rect.y - snapshot.viewport.scrollTop,
        width: 1,
      },
      options,
    );
  }

  private drawDirtyOverlay(rects: readonly Rect[], scrollTop: number): void {
    const paint = this.options.paint;
    this.context.save();
    this.context.strokeStyle = paint?.dirtyOverlayColor ?? "rgba(248, 113, 113, 0.82)";
    this.context.setLineDash([...(paint?.dirtyOverlayDash ?? [6, 4])]);
    for (const rect of rects) {
      this.context.strokeRect(
        this.contentPadding + rect.x + 0.5,
        this.contentPadding + rect.y - scrollTop + 0.5,
        rect.width,
        rect.height,
      );
    }
    this.context.restore();
  }

  private pointFromEvent(event: MouseEvent): { x: number; y: number } {
    const rect = this.options.canvas.getBoundingClientRect();
    const scrollTop = this.lastSnapshot?.viewport.scrollTop ?? 0;
    return {
      x: event.clientX - rect.left - this.contentPadding,
      y: event.clientY - rect.top - this.contentPadding + scrollTop,
    };
  }

  private viewportPointFromLayoutPoint(point: { x: number; y: number }): { x: number; y: number } {
    const scrollTop = this.lastSnapshot?.viewport.scrollTop ?? 0;
    return {
      x: this.contentPadding + point.x,
      y: this.contentPadding + point.y - scrollTop,
    };
  }

  private installWheel(): void {
    const wheel = this.options.wheel;
    const enabled =
      wheel === undefined || wheel === true || (wheel !== false && wheel.enabled !== false);
    if (!enabled) {
      return;
    }
    const deltaScale = typeof wheel === "object" ? (wheel.deltaScale ?? 1) : 1;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const snapshot = this.options.controller.renderSnapshot();
      this.scrollTo(snapshot.viewport.scrollTop + event.deltaY * deltaScale);
    };
    this.options.canvas.addEventListener("wheel", onWheel, { passive: false });
    this.cleanups.push(() => {
      this.options.canvas.removeEventListener("wheel", onWheel);
    });
  }
}
