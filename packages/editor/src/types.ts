import type { SourceRange } from "@pretext-md/parser";

export type { SourceRange } from "@pretext-md/parser";

export type SelectionDirection = "collapsed" | "forward" | "backward";

export type StableRangeBias = "expand" | "stick-start" | "stick-end" | "collapse-on-edit";

export type StableRangeKind =
  | "selection"
  | "composition"
  | "undo-target"
  | "search-match"
  | "ai-cursor"
  | "generic";

export interface RangeOptions {
  readonly bias?: StableRangeBias;
  readonly kind?: StableRangeKind;
}

export interface StableRange {
  readonly id: string;
}

export interface ResolvedRange {
  readonly id: string;
  readonly anchor: number;
  readonly head: number;
  readonly from: number;
  readonly to: number;
  readonly direction: SelectionDirection;
  readonly text: string;
  readonly isCollapsed: boolean;
  readonly options: Required<RangeOptions>;
}

export interface StableRangeEndpoint {
  readonly range: StableRange;
  readonly side: "anchor" | "head";
}

export interface EditorSelection {
  readonly anchor: StableRangeEndpoint;
  readonly head: StableRangeEndpoint;
  readonly range: StableRange;
  readonly direction: SelectionDirection;
  readonly granularity?: "char" | "word" | "line" | "block";
}

export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly deleted: string;
}

export interface DocumentChangeEvent {
  readonly version: number;
  readonly beforeText: string;
  readonly text: string;
  readonly changes: readonly TextChange[];
}

export type DocumentChangeListener = (event: DocumentChangeEvent) => void;

export type Unsubscribe = () => void;

export interface TextTransaction {
  replaceRange(range: SourceRange | StableRange, insert: string): TextChange;
  insert(offset: number, text: string): TextChange;
  deleteRange(range: SourceRange | StableRange): TextChange;
}

export interface TextDocumentAdapter {
  getText(): string;
  getVersion(): number;
  transact(fn: (tx: TextTransaction) => void): readonly TextChange[];
  createRange(anchor: number, head: number, options?: RangeOptions): StableRange;
  resolveRange(range: StableRange): ResolvedRange;
  disposeRange(range: StableRange): void;
  subscribe(listener: DocumentChangeListener): Unsubscribe;
}

export type EditOperation =
  | {
      readonly type: "replace";
      readonly range: SourceRange | StableRange;
      readonly insert: string;
    }
  | {
      readonly type: "insert";
      readonly offset: number;
      readonly text: string;
    }
  | {
      readonly type: "delete";
      readonly range: SourceRange | StableRange;
    };

export interface AppliedEditOperation {
  readonly operation: EditOperation;
  readonly change: TextChange;
  readonly beforeRange: SourceRange;
  readonly insertedRange: SourceRange;
}

export interface CompositionView {
  readonly sourceText: string;
  readonly virtualText: string;
  readonly replacementRange: SourceRange;
  readonly preeditText: string;
  readonly hasConflict: boolean;
}
