import type { SourceRange } from "@pretext-md/parser";

import { applyEditOperation } from "./edit-ops.ts";
import type { EditOperation, StableRange, TextDocumentAdapter } from "./types.ts";

interface UndoEntry {
  readonly target: StableRange;
  readonly expectedText: string;
  readonly replacementText: string;
}

export interface LocalUndoManagerOptions {
  readonly failOnChangedTarget?: boolean;
}

export class LocalUndoManager {
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];
  private readonly failOnChangedTarget: boolean;

  constructor(options: LocalUndoManagerOptions = {}) {
    this.failOnChangedTarget = options.failOnChangedTarget ?? true;
  }

  apply(adapter: TextDocumentAdapter, operation: EditOperation): boolean {
    const applied = applyEditOperation(adapter, operation);
    const target = adapter.createRange(applied.insertedRange.from, applied.insertedRange.to, {
      kind: "undo-target",
      bias: "expand",
    });
    this.undoStack.push({
      target,
      expectedText: applied.change.insert,
      replacementText: applied.change.deleted,
    });
    this.clearRedo(adapter);
    return true;
  }

  undo(adapter: TextDocumentAdapter): boolean {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return false;
    }

    const redoEntry = this.applyEntry(adapter, entry);
    if (redoEntry === null) {
      this.undoStack.push(entry);
      return false;
    }

    this.redoStack.push(redoEntry);
    adapter.disposeRange(entry.target);
    return true;
  }

  redo(adapter: TextDocumentAdapter): boolean {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return false;
    }

    const undoEntry = this.applyEntry(adapter, entry);
    if (undoEntry === null) {
      this.redoStack.push(entry);
      return false;
    }

    this.undoStack.push(undoEntry);
    adapter.disposeRange(entry.target);
    return true;
  }

  clear(adapter: TextDocumentAdapter): void {
    for (const entry of [...this.undoStack, ...this.redoStack]) {
      adapter.disposeRange(entry.target);
    }
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  private applyEntry(adapter: TextDocumentAdapter, entry: UndoEntry): UndoEntry | null {
    const resolved = adapter.resolveRange(entry.target);
    if (this.failOnChangedTarget && resolved.text !== entry.expectedText) {
      return null;
    }

    const replacementRange: SourceRange = {
      from: resolved.from,
      to: resolved.to,
    };
    let nextTargetRange: SourceRange | undefined;
    adapter.transact((tx) => {
      const change = tx.replaceRange(replacementRange, entry.replacementText);
      nextTargetRange = {
        from: change.from,
        to: change.from + change.insert.length,
      };
    });

    if (nextTargetRange === undefined) {
      throw new Error("Undo transaction did not produce a target range");
    }

    return {
      target: adapter.createRange(nextTargetRange.from, nextTargetRange.to, {
        kind: "undo-target",
        bias: "expand",
      }),
      expectedText: entry.replacementText,
      replacementText: entry.expectedText,
    };
  }

  private clearRedo(adapter: TextDocumentAdapter): void {
    for (const entry of this.redoStack) {
      adapter.disposeRange(entry.target);
    }
    this.redoStack.length = 0;
  }
}
