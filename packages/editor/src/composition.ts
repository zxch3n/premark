import type { SourceRange } from "@pretext-md/parser";

import type { CompositionView, StableRange, TextChange, TextDocumentAdapter } from "./types.ts";

export interface CompositionSessionOptions {
  readonly failOnChangedReplacementText?: boolean;
}

export class CompositionSession {
  private preeditText = "";
  private committed = false;
  private canceled = false;
  private readonly baseSelectedText: string;
  private readonly baseVersion: number;
  private readonly failOnChangedReplacementText: boolean;

  constructor(
    private readonly adapter: TextDocumentAdapter,
    readonly range: StableRange,
    options: CompositionSessionOptions = {},
  ) {
    const resolved = adapter.resolveRange(range);
    this.baseSelectedText = resolved.text;
    this.baseVersion = adapter.getVersion();
    this.failOnChangedReplacementText = options.failOnChangedReplacementText ?? true;
  }

  update(preeditText: string): CompositionView {
    this.assertActive();
    this.preeditText = preeditText;
    return this.getView();
  }

  getView(): CompositionView {
    const sourceText = this.adapter.getText();
    const replacementRange = this.getReplacementRange();
    const hasConflict = this.hasConflict();
    return {
      sourceText,
      virtualText:
        sourceText.slice(0, replacementRange.from) +
        this.preeditText +
        sourceText.slice(replacementRange.to),
      replacementRange,
      preeditText: this.preeditText,
      hasConflict,
    };
  }

  commit(text = this.preeditText): TextChange {
    this.assertActive();
    if (this.failOnChangedReplacementText && this.hasConflict()) {
      throw new Error("Cannot commit composition because the replacement range changed");
    }

    let committedChange: TextChange | undefined;
    this.adapter.transact((tx) => {
      committedChange = tx.replaceRange(this.range, text);
    });
    this.committed = true;

    if (committedChange === undefined) {
      throw new Error("Composition commit did not produce a document change");
    }

    return committedChange;
  }

  cancel(): void {
    this.assertActive();
    this.canceled = true;
    this.preeditText = "";
  }

  hasConflict(): boolean {
    if (this.adapter.getVersion() === this.baseVersion) {
      return false;
    }
    return this.adapter.resolveRange(this.range).text !== this.baseSelectedText;
  }

  private getReplacementRange(): SourceRange {
    const resolved = this.adapter.resolveRange(this.range);
    return {
      from: resolved.from,
      to: resolved.to,
    };
  }

  private assertActive(): void {
    if (this.committed) {
      throw new Error("Composition session has already been committed");
    }
    if (this.canceled) {
      throw new Error("Composition session has already been canceled");
    }
  }
}

export function createCompositionSession(
  adapter: TextDocumentAdapter,
  range: StableRange,
  options?: CompositionSessionOptions,
): CompositionSession {
  return new CompositionSession(adapter, range, options);
}
