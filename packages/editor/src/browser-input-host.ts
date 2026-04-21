import type { EditorDocumentState } from "./editor-state.ts";
import type { EditableLayoutIndex, Rect } from "./editable-layout.ts";
import {
  applyTextareaBridgeChange,
  createTextareaBridgeSnapshot,
  type TextareaBridgeSnapshot,
} from "./input-bridge.ts";
import { applyInputIntent } from "./input-commands.ts";
import { normalizeInputTrace } from "./input-trace.ts";
import {
  beginPointerSelection,
  selectPointerRange,
  updatePointerSelection,
  type PointerSelectionSession,
} from "./selection-commands.ts";
import type { LocalUndoManager } from "./undo.ts";

export interface BrowserInputHostRenderOptions {
  readonly syncBridgeValue?: boolean;
}

export interface BrowserInputHostPoint {
  readonly x: number;
  readonly y: number;
}

export interface BrowserInputHostOptions {
  readonly editor: EditorDocumentState;
  readonly undoManager: LocalUndoManager;
  readonly surface: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  readonly editableIndex: () => EditableLayoutIndex;
  readonly pointFromEvent: (event: MouseEvent) => BrowserInputHostPoint;
  readonly render: (options?: BrowserInputHostRenderOptions) => void;
  readonly positionBridge: (caretRect: Rect, snapshot: TextareaBridgeSnapshot) => void;
}

export class PremarkBrowserInputHost {
  private bridgeSnapshot: TextareaBridgeSnapshot;
  private pointerSession: PointerSelectionSession | null = null;
  private composing = false;
  private compositionCommitKeyWasEnter = false;
  private suppressLineBreakUntil = 0;
  private pointerClickCount = 0;
  private lastPointerClick: {
    readonly time: number;
    readonly x: number;
    readonly y: number;
  } | null = null;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly options: BrowserInputHostOptions) {
    this.bridgeSnapshot = createTextareaBridgeSnapshot(options.editor);
  }

  install(): void {
    const { surface, textarea } = this.options;
    this.listen(surface, "pointerdown", this.onPointerDown);
    this.listen(surface, "click", this.onClick);
    this.listen(window, "pointermove", this.onPointerMove);
    this.listen(window, "pointerup", this.onPointerUp);
    this.listen(textarea, "keydown", this.onKeyDown);
    this.listen(textarea, "beforeinput", this.onBeforeInput);
    this.listen(textarea, "compositionstart", this.onCompositionStart);
    this.listen(textarea, "compositionupdate", this.onCompositionUpdate);
    this.listen(textarea, "compositionend", this.onCompositionEnd);
    this.listen(textarea, "paste", this.onPaste);
    this.listen(textarea, "cut", this.onCut);
    this.listen(textarea, "input", this.onInput);
  }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    this.pointerSession = null;
  }

  syncBridge(
    caretRect: Rect,
    options: {
      readonly writeValue?: boolean;
    } = {},
  ): void {
    this.bridgeSnapshot = createTextareaBridgeSnapshot(this.options.editor);
    if (options.writeValue !== false) {
      this.options.textarea.value = this.bridgeSnapshot.value;
      this.options.textarea.setSelectionRange(
        this.bridgeSnapshot.selectionStart,
        this.bridgeSnapshot.selectionEnd,
      );
    }
    this.options.positionBridge(caretRect, this.bridgeSnapshot);
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, listener as EventListener);
    this.cleanups.push(() => {
      target.removeEventListener(type, listener as EventListener);
    });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const point = this.options.pointFromEvent(event);
    const clickCount = this.clickCountFromPointer(event, point);
    if (clickCount >= 3) {
      selectPointerRange(
        this.options.editor,
        point.x,
        point.y,
        "block",
        this.options.editableIndex(),
      );
      this.pointerSession = null;
      this.options.textarea.focus();
      this.options.render();
      return;
    }
    if (clickCount === 2) {
      selectPointerRange(
        this.options.editor,
        point.x,
        point.y,
        "word",
        this.options.editableIndex(),
      );
      this.pointerSession = null;
      this.options.textarea.focus();
      this.options.render();
      return;
    }
    this.pointerSession = beginPointerSelection(
      this.options.editor,
      point.x,
      point.y,
      this.options.editableIndex(),
    );
    this.options.textarea.focus();
    this.options.render();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (event.detail < 2) {
      return;
    }
    const point = this.options.pointFromEvent(event);
    selectPointerRange(
      this.options.editor,
      point.x,
      point.y,
      event.detail >= 3 ? "block" : "word",
      this.options.editableIndex(),
    );
    this.pointerSession = null;
    this.options.textarea.focus();
    this.options.render();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pointerSession === null) {
      return;
    }
    const point = this.options.pointFromEvent(event);
    updatePointerSelection(
      this.options.editor,
      this.pointerSession,
      point.x,
      point.y,
      this.options.editableIndex(),
    );
    this.options.render();
  };

  private readonly onPointerUp = (): void => {
    this.pointerSession = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.composing && event.key === "Enter") {
      this.compositionCommitKeyWasEnter = true;
    }
    if (!this.composing && isPlainEnterKey(event)) {
      event.preventDefault();
      this.suppressLineBreakUntil = performance.now() + 500;
      applyInputIntent(
        this.options.editor,
        { type: "insert-paragraph" },
        { undoManager: this.options.undoManager },
      );
      this.options.render();
      return;
    }

    const intent = normalizeInputTrace([
      {
        type: "keydown",
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
      },
    ])[0];
    if (
      intent?.type !== "keyboard-selection" &&
      intent?.type !== "select-all" &&
      intent?.type !== "line-indent"
    ) {
      return;
    }

    event.preventDefault();
    applyInputIntent(this.options.editor, intent, { undoManager: this.options.undoManager });
    this.options.render();
  };

  private readonly onBeforeInput = (event: InputEvent): void => {
    if (
      (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") &&
      performance.now() <= this.suppressLineBreakUntil
    ) {
      this.suppressLineBreakUntil = 0;
      event.preventDefault();
      return;
    }
    const intent = normalizeInputTrace([
      {
        type: "beforeinput",
        inputType: event.inputType,
        data: event.data,
        isComposing: event.isComposing,
        cancelable: event.cancelable,
      },
    ])[0];

    if (
      intent?.type !== "insert-paragraph" &&
      intent?.type !== "delete" &&
      intent?.type !== "history"
    ) {
      return;
    }

    event.preventDefault();
    applyInputIntent(this.options.editor, intent, { undoManager: this.options.undoManager });
    this.options.render();
  };

  private readonly onCompositionStart = (event: CompositionEvent): void => {
    this.composing = true;
    this.compositionCommitKeyWasEnter = false;
    applyInputIntent(
      this.options.editor,
      { type: "composition-start" },
      { undoManager: this.options.undoManager },
    );
    this.options.render({ syncBridgeValue: false });
    event.preventDefault();
  };

  private readonly onCompositionUpdate = (event: CompositionEvent): void => {
    if (!this.composing) {
      return;
    }
    applyInputIntent(
      this.options.editor,
      { type: "composition-update", text: event.data },
      { undoManager: this.options.undoManager },
    );
    this.options.render({ syncBridgeValue: false });
  };

  private readonly onCompositionEnd = (event: CompositionEvent): void => {
    this.composing = false;
    if (this.compositionCommitKeyWasEnter && event.data.length > 0) {
      this.suppressLineBreakUntil = performance.now() + 500;
    }
    this.compositionCommitKeyWasEnter = false;
    applyInputIntent(
      this.options.editor,
      { type: "composition-commit", text: event.data },
      { undoManager: this.options.undoManager },
    );
    this.options.render();
  };

  private readonly onPaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    applyInputIntent(
      this.options.editor,
      {
        type: "clipboard",
        action: "paste",
        markdown: event.clipboardData?.getData("text/markdown") || undefined,
        plainText: event.clipboardData?.getData("text/plain") || undefined,
        html: event.clipboardData?.getData("text/html") || undefined,
      },
      { undoManager: this.options.undoManager },
    );
    this.options.render();
  };

  private readonly onCut = (event: ClipboardEvent): void => {
    event.preventDefault();
    applyInputIntent(
      this.options.editor,
      { type: "clipboard", action: "cut" },
      { undoManager: this.options.undoManager },
    );
    this.options.render();
  };

  private readonly onInput = (event: InputEvent): void => {
    if (this.composing) {
      return;
    }
    const applied = applyTextareaBridgeChange(
      this.options.editor,
      this.bridgeSnapshot,
      this.options.textarea.value,
      {
        nextSelectionStart: this.options.textarea.selectionStart,
        nextSelectionEnd: this.options.textarea.selectionEnd,
      },
    );
    if (applied !== null) {
      this.options.undoManager.recordApplied(this.options.editor.adapter, applied);
    }
    this.options.render({ syncBridgeValue: !shouldPreserveNativeInputContext(event) });
  };

  private clickCountFromPointer(event: PointerEvent, point: BrowserInputHostPoint): number {
    if (
      this.lastPointerClick !== null &&
      event.timeStamp - this.lastPointerClick.time < 500 &&
      Math.hypot(point.x - this.lastPointerClick.x, point.y - this.lastPointerClick.y) < 6
    ) {
      this.pointerClickCount += 1;
    } else {
      this.pointerClickCount = 1;
    }
    this.lastPointerClick = {
      time: event.timeStamp,
      x: point.x,
      y: point.y,
    };
    return Math.max(event.detail, this.pointerClickCount);
  }
}

export function shouldPreserveNativeInputContext(event: InputEvent): boolean {
  if (event.isComposing) {
    return true;
  }
  const data = event.data ?? "";
  return (
    event.inputType === "insertText" && /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(data)
  );
}

function isPlainEnterKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function createPremarkBrowserInputHost(
  options: BrowserInputHostOptions,
): PremarkBrowserInputHost {
  return new PremarkBrowserInputHost(options);
}
