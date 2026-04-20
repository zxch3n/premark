export type TraceKeyboardEventType = "keydown" | "keyup";

export type TraceInputEventType = "beforeinput" | "input";

export type TraceCompositionEventType = "compositionstart" | "compositionupdate" | "compositionend";

export type TraceClipboardEventType = "copy" | "cut" | "paste";

export type InputTraceEvent =
  | {
      readonly type: TraceKeyboardEventType;
      readonly key: string;
      readonly code?: string;
      readonly shiftKey?: boolean;
      readonly metaKey?: boolean;
      readonly altKey?: boolean;
      readonly ctrlKey?: boolean;
    }
  | {
      readonly type: TraceInputEventType;
      readonly inputType: string;
      readonly data?: string | null;
      readonly isComposing?: boolean;
      readonly cancelable?: boolean;
    }
  | {
      readonly type: TraceCompositionEventType;
      readonly data?: string;
    }
  | {
      readonly type: TraceClipboardEventType;
      readonly plainText?: string;
      readonly html?: string;
      readonly markdown?: string;
    }
  | {
      readonly type: "selectionchange";
      readonly anchor: number;
      readonly head: number;
    };

export type NormalizedInputIntent =
  | { readonly type: "composition-start" }
  | { readonly type: "composition-update"; readonly text: string }
  | { readonly type: "composition-commit"; readonly text: string }
  | { readonly type: "composition-cancel" }
  | { readonly type: "insert-text"; readonly text: string }
  | { readonly type: "delete"; readonly direction: "backward" | "forward" }
  | { readonly type: "insert-paragraph" }
  | { readonly type: "history"; readonly action: "undo" | "redo" }
  | { readonly type: "clipboard"; readonly action: "copy" | "cut" | "paste" }
  | { readonly type: "selection-change"; readonly anchor: number; readonly head: number }
  | {
      readonly type: "keyboard-selection";
      readonly key: string;
      readonly by: "character" | "line" | "document-boundary";
      readonly extend: boolean;
    };

export class InputEventTraceRecorder {
  private readonly events: InputTraceEvent[] = [];

  record(event: InputTraceEvent): void {
    this.events.push(event);
  }

  snapshot(): readonly InputTraceEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }

  normalize(): readonly NormalizedInputIntent[] {
    return normalizeInputTrace(this.events);
  }
}

export function normalizeInputTrace(events: readonly InputTraceEvent[]): NormalizedInputIntent[] {
  const intents: NormalizedInputIntent[] = [];
  let composing = false;
  let lastCompositionText = "";
  let committedCompositionText: string | null = null;
  let lastPlainInputKey = "";

  for (const event of events) {
    switch (event.type) {
      case "compositionstart":
        composing = true;
        lastCompositionText = event.data ?? "";
        committedCompositionText = null;
        intents.push({ type: "composition-start" });
        if (lastCompositionText) {
          pushCompositionUpdate(intents, lastCompositionText);
        }
        break;
      case "compositionupdate": {
        if (!composing) composing = true;
        const text = event.data ?? "";
        if (text !== lastCompositionText) {
          lastCompositionText = text;
          pushCompositionUpdate(intents, text);
        }
        break;
      }
      case "compositionend": {
        const text = event.data ?? lastCompositionText;
        if (text.length === 0) {
          intents.push({ type: "composition-cancel" });
        } else {
          intents.push({ type: "composition-commit", text });
        }
        composing = false;
        committedCompositionText = text;
        lastCompositionText = "";
        break;
      }
      case "beforeinput":
      case "input":
        if (event.inputType === "insertCompositionText") {
          const text = event.data ?? "";
          if (!composing && committedCompositionText === text) {
            break;
          }
          if (text !== lastCompositionText) {
            lastCompositionText = text;
            pushCompositionUpdate(intents, text);
          }
          break;
        }

        if (event.type === "beforeinput" && !event.cancelable) {
          break;
        }

        if (event.inputType === "insertText") {
          const text = event.data ?? "";
          const key = `${event.type}:${event.inputType}:${text}`;
          if (event.type === "input" || key !== lastPlainInputKey) {
            pushPlainIntent(intents, { type: "insert-text", text });
          }
          lastPlainInputKey = key;
          break;
        }

        if (event.inputType === "insertParagraph") {
          pushPlainIntent(intents, { type: "insert-paragraph" });
          break;
        }

        if (event.inputType === "historyUndo") {
          pushPlainIntent(intents, { type: "history", action: "undo" });
          break;
        }

        if (event.inputType === "historyRedo") {
          pushPlainIntent(intents, { type: "history", action: "redo" });
          break;
        }

        if (event.inputType === "deleteContentBackward") {
          pushPlainIntent(intents, { type: "delete", direction: "backward" });
          break;
        }

        if (event.inputType === "deleteContentForward") {
          pushPlainIntent(intents, { type: "delete", direction: "forward" });
        }
        break;
      case "selectionchange":
        intents.push({
          type: "selection-change",
          anchor: event.anchor,
          head: event.head,
        });
        break;
      case "copy":
      case "cut":
      case "paste":
        intents.push({ type: "clipboard", action: event.type });
        break;
      case "keydown": {
        const selectionIntent = keyboardSelectionIntent(event);
        if (selectionIntent !== null) {
          intents.push(selectionIntent);
        }
        break;
      }
      case "keyup":
        break;
    }
  }

  return intents;
}

function pushCompositionUpdate(intents: NormalizedInputIntent[], text: string): void {
  const previous = intents.at(-1);
  if (previous?.type === "composition-update" && previous.text === text) {
    return;
  }
  intents.push({ type: "composition-update", text });
}

function pushPlainIntent(intents: NormalizedInputIntent[], intent: NormalizedInputIntent): void {
  const previous = intents.at(-1);
  if (JSON.stringify(previous) === JSON.stringify(intent)) {
    return;
  }
  intents.push(intent);
}

function keyboardSelectionIntent(event: {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
}): NormalizedInputIntent | null {
  if (!event.key.startsWith("Arrow")) {
    return null;
  }

  return {
    type: "keyboard-selection",
    key: event.key,
    by: event.metaKey
      ? "document-boundary"
      : event.key === "ArrowUp" || event.key === "ArrowDown"
        ? "line"
        : "character",
    extend: event.shiftKey === true,
  };
}
