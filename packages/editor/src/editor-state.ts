import { createLayoutEngine, type DocumentLayout, type StyleConfig } from "@pretext-md/layout";
import {
  createIncrementalParseState,
  createMarkdownInlineSourceMap,
  incrementalParse,
  type IncrementalParseState,
  type MarkdownInlineSourceRecord,
} from "@pretext-md/parser";

import { createCompositionSession, type CompositionSession } from "./composition.ts";
import {
  createEditableLayoutIndex,
  createIncrementalEditableLayoutIndex,
  type EditableLayoutIndex,
} from "./editable-layout.ts";
import { applyEditOperation } from "./edit-ops.ts";
import {
  createInMemoryTextDocumentAdapter,
  type InMemoryTextDocumentAdapter,
} from "./memory-adapter.ts";
import type {
  AppliedEditOperation,
  CompositionView,
  EditorSelection,
  SourceRange,
  StableRange,
  TextChange,
  TextDocumentAdapter,
} from "./types.ts";

export interface EditorDocumentStateOptions {
  readonly markdown: string;
  readonly containerWidth: number;
  readonly layoutStyle?: StyleConfig;
  readonly adapter?: TextDocumentAdapter;
}

export class EditorDocumentState {
  readonly adapter: TextDocumentAdapter;

  private readonly layoutEngine;

  private containerWidth: number;

  private selectionRange: StableRange;

  private compositionSession: CompositionSession | null = null;

  private compositionViewValue: CompositionView | null = null;

  parseState: IncrementalParseState;

  inlineSources: readonly MarkdownInlineSourceRecord[];

  layout: DocumentLayout;

  editableIndex: EditableLayoutIndex;

  constructor(options: EditorDocumentStateOptions) {
    this.adapter =
      options.adapter ??
      createInMemoryTextDocumentAdapter(options.markdown, { idPrefix: "editor" });
    this.containerWidth = options.containerWidth;
    this.layoutEngine = createLayoutEngine({
      ...(options.layoutStyle ?? { fontTheme: "github" }),
      lineBreakMode: options.layoutStyle?.lineBreakMode ?? "source",
    });
    this.selectionRange = this.adapter.createRange(0, 0, {
      kind: "selection",
      bias: "stick-end",
    });

    this.parseState = createIncrementalParseState(this.adapter.getText());
    this.inlineSources = createMarkdownInlineSourceMap(this.parseState);
    this.layout = this.layoutEngine.layout(this.adapter.getText(), this.containerWidth);
    this.editableIndex = this.createEditableIndex();

    this.adapter.subscribe(() => {
      this.refresh();
    });
  }

  get markdown(): string {
    return this.adapter.getText();
  }

  get selection(): EditorSelection {
    const resolved = this.adapter.resolveRange(this.selectionRange);
    return {
      range: this.selectionRange,
      anchor: { range: this.selectionRange, side: "anchor" },
      head: { range: this.selectionRange, side: "head" },
      direction: resolved.direction,
    };
  }

  get selectionSourceRange(): SourceRange {
    const resolved = this.adapter.resolveRange(this.selectionRange);
    return {
      from: resolved.from,
      to: resolved.to,
    };
  }

  get compositionView(): CompositionView | null {
    return this.compositionViewValue;
  }

  setSelection(anchor: number, head: number): void {
    this.adapter.disposeRange(this.selectionRange);
    this.selectionRange = this.adapter.createRange(anchor, head, {
      kind: "selection",
      bias: anchor === head ? "stick-end" : "expand",
    });
  }

  replaceSelection(insert: string): AppliedEditOperation {
    const applied = applyEditOperation(this.adapter, {
      type: "replace",
      range: this.selectionRange,
      insert,
    });
    this.setSelection(applied.insertedRange.to, applied.insertedRange.to);
    return applied;
  }

  deleteSelection(): AppliedEditOperation {
    return this.replaceSelection("");
  }

  startComposition(): void {
    if (this.compositionSession !== null) {
      throw new Error("Composition already started");
    }

    this.compositionSession = createCompositionSession(this.adapter, this.selectionRange);
  }

  updateComposition(preeditText: string): CompositionView {
    if (this.compositionSession === null) {
      this.startComposition();
    }

    const session = this.compositionSession;
    if (session === null) {
      throw new Error("No active composition");
    }
    const view = session.update(preeditText);
    this.compositionViewValue = view;
    return view;
  }

  commitComposition(text?: string): TextChange {
    if (this.compositionSession === null) {
      throw new Error("No active composition");
    }

    const change = this.compositionSession.commit(text);
    this.compositionSession = null;
    this.compositionViewValue = null;
    this.setSelection(change.from + change.insert.length, change.from + change.insert.length);
    return change;
  }

  cancelComposition(): void {
    if (this.compositionSession === null) {
      return;
    }
    this.compositionSession.cancel();
    this.compositionSession = null;
    this.compositionViewValue = null;
  }

  resize(containerWidth: number): void {
    this.containerWidth = containerWidth;
    this.layout = this.layoutEngine.resize(this.layout, containerWidth);
    this.editableIndex = this.createEditableIndex();
  }

  refresh(): void {
    const previousEditableIndex = this.editableIndex;
    const markdown = this.adapter.getText();
    const parseResult = incrementalParse(this.parseState, markdown);
    this.parseState = parseResult.state;
    this.inlineSources = createMarkdownInlineSourceMap(this.parseState);
    this.layout = this.layoutEngine.applyParseResult(parseResult, this.containerWidth);
    this.editableIndex = this.createEditableIndex(previousEditableIndex);
    if (this.compositionSession !== null && this.compositionViewValue !== null) {
      this.compositionViewValue = this.compositionSession.update(
        this.compositionViewValue.preeditText,
      );
    }
  }

  private createEditableIndex(previous?: EditableLayoutIndex): EditableLayoutIndex {
    const input = {
      markdown: this.adapter.getText(),
      layout: this.layout,
      blockSpans: this.parseState.blockSpans,
      inlineSources: this.inlineSources,
    };
    return previous === undefined
      ? createEditableLayoutIndex(input)
      : createIncrementalEditableLayoutIndex(input, previous);
  }
}

export function createEditorDocumentState(
  options: EditorDocumentStateOptions,
): EditorDocumentState {
  return new EditorDocumentState(options);
}

export function createInMemoryEditorDocumentState(
  markdown: string,
  containerWidth: number,
  layoutStyle?: StyleConfig,
): EditorDocumentState {
  const adapter: InMemoryTextDocumentAdapter = createInMemoryTextDocumentAdapter(markdown, {
    idPrefix: "editor",
  });
  return new EditorDocumentState({
    markdown,
    containerWidth,
    layoutStyle,
    adapter,
  });
}
