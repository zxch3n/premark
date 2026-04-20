import type { SourceRange } from "@pretext-md/parser";

import {
  createResolvedRange,
  defaultRangeOptions,
  type MutableStableRangeRecord,
  normalizeRange,
  transformStableRangeRecord,
} from "./ranges.ts";
import type {
  DocumentChangeEvent,
  DocumentChangeListener,
  RangeOptions,
  ResolvedRange,
  StableRange,
  TextChange,
  TextDocumentAdapter,
  TextTransaction,
  Unsubscribe,
} from "./types.ts";

export interface InMemoryTextDocumentAdapterOptions {
  readonly idPrefix?: string;
}

export function createInMemoryTextDocumentAdapter(
  text = "",
  options: InMemoryTextDocumentAdapterOptions = {},
): InMemoryTextDocumentAdapter {
  return new InMemoryTextDocumentAdapter(text, options);
}

export class InMemoryTextDocumentAdapter implements TextDocumentAdapter {
  private text: string;
  private version = 0;
  private nextRangeId = 1;
  private readonly idPrefix: string;
  private readonly ranges = new Map<string, MutableStableRangeRecord>();
  private readonly listeners = new Set<DocumentChangeListener>();

  constructor(text = "", options: InMemoryTextDocumentAdapterOptions = {}) {
    this.text = text;
    this.idPrefix = options.idPrefix ?? "range";
  }

  getText(): string {
    return this.text;
  }

  getVersion(): number {
    return this.version;
  }

  transact(fn: (tx: TextTransaction) => void): readonly TextChange[] {
    const beforeText = this.text;
    const tx = new InMemoryTextTransaction(this);
    fn(tx);
    const changes = tx.getChanges();

    if (changes.length > 0) {
      this.version += 1;
      this.emit({
        version: this.version,
        beforeText,
        text: this.text,
        changes,
      });
    }

    return changes;
  }

  createRange(anchor: number, head: number, options?: RangeOptions): StableRange {
    this.assertOffset(anchor);
    this.assertOffset(head);

    const id = `${this.idPrefix}-${this.nextRangeId}`;
    this.nextRangeId += 1;
    this.ranges.set(id, {
      id,
      anchor,
      head,
      options: defaultRangeOptions(options),
    });
    return { id };
  }

  resolveRange(range: StableRange): ResolvedRange {
    const record = this.getRangeRecord(range);
    return createResolvedRange(record, this.text);
  }

  disposeRange(range: StableRange): void {
    this.ranges.delete(range.id);
  }

  subscribe(listener: DocumentChangeListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  replaceRange(range: SourceRange | StableRange, insert: string): TextChange {
    const normalized = this.resolveRangeLike(range);
    this.assertRange(normalized);
    const deleted = this.text.slice(normalized.from, normalized.to);
    this.text = this.text.slice(0, normalized.from) + insert + this.text.slice(normalized.to);

    for (const record of this.ranges.values()) {
      transformStableRangeRecord(record, {
        from: normalized.from,
        to: normalized.to,
        insertLength: insert.length,
      });
    }

    return {
      from: normalized.from,
      to: normalized.to,
      insert,
      deleted,
    };
  }

  private resolveRangeLike(range: SourceRange | StableRange): SourceRange {
    if ("from" in range && "to" in range) {
      return normalizeRange(range);
    }

    const resolved = this.resolveRange(range);
    return {
      from: resolved.from,
      to: resolved.to,
    };
  }

  private getRangeRecord(range: StableRange): MutableStableRangeRecord {
    const record = this.ranges.get(range.id);
    if (record === undefined) {
      throw new Error(`Unknown stable range: ${range.id}`);
    }
    return record;
  }

  private assertOffset(offset: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.text.length) {
      throw new RangeError(`Offset ${offset} is outside document length ${this.text.length}`);
    }
  }

  private assertRange(range: SourceRange): void {
    this.assertOffset(range.from);
    this.assertOffset(range.to);
  }

  private emit(event: DocumentChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

class InMemoryTextTransaction implements TextTransaction {
  private readonly changes: TextChange[] = [];

  constructor(private readonly adapter: InMemoryTextDocumentAdapter) {}

  replaceRange(range: SourceRange | StableRange, insert: string): TextChange {
    const change = this.adapter.replaceRange(range, insert);
    this.changes.push(change);
    return change;
  }

  insert(offset: number, text: string): TextChange {
    return this.replaceRange({ from: offset, to: offset }, text);
  }

  deleteRange(range: SourceRange | StableRange): TextChange {
    return this.replaceRange(range, "");
  }

  getChanges(): readonly TextChange[] {
    return this.changes;
  }
}
